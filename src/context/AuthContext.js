import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { MOCK_MODE, supabase } from '../config/supabaseClient';
import { DEMO_ORGANIZACIONES } from '../data/mockData';
import {
  tienePermiso,
  rutaInicioPorPermisos,
  PERMISO_GESTION_USUARIOS,
} from '../config/permisos';
import { buscarUsuarioLogin, updatePerfilMock, getStore } from '../services/mockService';

const AuthContext = createContext(null);

function buildSessionFromMock(usuario, rol) {
  return {
    user: {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      telefono: usuario.telefono || '',
      cargo: usuario.cargo || '',
      avatar_url: usuario.avatar_url || null,
    },
    organizacion_id: usuario.organizacion_id,
    rol_id: rol.id,
    rol_nombre: rol.nombre,
    permisos: [...rol.permisos],
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [organizacion, setOrganizacion] = useState(null);
  const [rolId, setRolId] = useState(null);
  const [rolNombre, setRolNombre] = useState(null);
  const [permisos, setPermisos] = useState([]);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((session) => {
    if (!session) {
      setUser(null);
      setOrganizacion(null);
      setRolId(null);
      setRolNombre(null);
      setPermisos([]);
      return;
    }
    setUser(session.user);
    setOrganizacion(DEMO_ORGANIZACIONES[session.organizacion_id] || null);
    setRolId(session.rol_id);
    setRolNombre(session.rol_nombre);
    setPermisos(session.permisos || []);
  }, []);

  const persistSession = useCallback((session) => {
    if (MOCK_MODE && session) {
      localStorage.setItem('vtd_session', JSON.stringify(session));
    }
    applySession(session);
  }, [applySession]);

  const hydrateUser = useCallback(async (authUser) => {
    const { data: roleData } = await supabase
      .from('usuarios_roles')
      .select('rol, organizacion_id, organizaciones(*)')
      .eq('usuario_id', authUser.id)
      .single();

    if (roleData) {
      setUser(authUser);
      setRolId(roleData.rol);
      setRolNombre(roleData.rol);
      setPermisos([]);
      setOrganizacion(roleData.organizaciones);
    }
    setLoading(false);
  }, []);

  const loadMockSession = useCallback(() => {
    const saved = localStorage.getItem('vtd_session');
    if (saved) {
      try {
        const session = JSON.parse(saved);
        const storeUser = getStore().usuarios.find((u) => u.id === session.user?.id);
        if (storeUser && session.user) {
          session.user = {
            ...session.user,
            nombre: storeUser.nombre,
            telefono: storeUser.telefono || '',
            cargo: storeUser.cargo || '',
            avatar_url: storeUser.avatar_url || null,
          };
        }
        applySession(session);
      } catch {
        localStorage.removeItem('vtd_session');
      }
    }
    setLoading(false);
  }, [applySession]);

  useEffect(() => {
    if (MOCK_MODE) {
      loadMockSession();
      return undefined;
    }

    async function initSupabaseAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await hydrateUser(session.user);
      else setLoading(false);
    }

    initSupabaseAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) await hydrateUser(session.user);
      else applySession(null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadMockSession, applySession, hydrateUser]);

  const hasPermiso = useCallback(
    (permisoId) => tienePermiso(permisos, permisoId),
    [permisos]
  );

  const rutaInicio = rutaInicioPorPermisos(permisos);

  async function login(email, password) {
    if (MOCK_MODE) {
      const match = buscarUsuarioLogin(email, password);
      if (!match) throw new Error('Credenciales inválidas o usuario inactivo');

      const session = buildSessionFromMock(match.usuario, match.rol);
      localStorage.setItem('vtd_session', JSON.stringify(session));
      applySession(session);
      return session;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await hydrateUser(data.user);
    return data;
  }

  async function register(email, password, nombreOrganizacion) {
    if (MOCK_MODE) {
      throw new Error('Registro disponible al conectar Supabase. Use demo: admin@demo.com / demo123');
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) throw authError;

    const slug = nombreOrganizacion.toLowerCase().replace(/\s+/g, '-').slice(0, 30);
    const { data: org, error: orgError } = await supabase
      .from('organizaciones')
      .insert({
        nombre_oficial: nombreOrganizacion,
        subdominio_slug: slug,
        creado_por: authData.user.id,
      })
      .select()
      .single();

    if (orgError) throw orgError;

    await supabase.from('usuarios_roles').insert({
      usuario_id: authData.user.id,
      organizacion_id: org.id,
      rol: 'administrador',
    });

    await hydrateUser(authData.user);
    return authData;
  }

  async function logout() {
    if (MOCK_MODE) {
      localStorage.removeItem('vtd_session');
      applySession(null);
      setLoading(false);
      return;
    }
    await supabase.auth.signOut();
    applySession(null);
    setLoading(false);
  }

  async function updateProfile(datos) {
    if (!user?.id || !organizacion?.id) {
      throw new Error('Sesión no válida');
    }

    if (MOCK_MODE) {
      const result = updatePerfilMock(user.id, organizacion.id, datos);
      if (result.error) throw new Error(result.error);

      const saved = localStorage.getItem('vtd_session');
      if (saved) {
        try {
          const session = JSON.parse(saved);
          session.user = {
            ...session.user,
            nombre: result.data.nombre,
            telefono: result.data.telefono || '',
            cargo: result.data.cargo || '',
            avatar_url: result.data.avatar_url || null,
          };
          persistSession(session);
        } catch {
          applySession(null);
        }
      }
      return result.data;
    }

    throw new Error('Actualización de perfil disponible al conectar Supabase.');
  }

  const value = {
    user,
    organizacion,
    rolId,
    rolNombre,
    permisos,
    organizacionId: organizacion?.id,
    loading,
    isAuthenticated: !!user,
    isAdmin: hasPermiso(PERMISO_GESTION_USUARIOS),
    hasPermiso,
    rutaInicio,
    login,
    register,
    logout,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
