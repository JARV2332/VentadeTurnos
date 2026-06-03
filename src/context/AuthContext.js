import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { MOCK_MODE, supabase } from '../config/supabaseClient';
import { DEMO_ORGANIZACIONES } from '../data/mockData';
import {
  tienePermiso,
  rutaInicioPorPermisos,
  PERMISO_GESTION_USUARIOS,
  PERMISOS_ADMIN_COMPLETO,
} from '../config/permisos';
import { buscarUsuarioLogin } from '../services/mockService';
import {
  fetchPerfilByAuthId,
  updatePerfil,
  setOrganizacionActiva as setOrganizacionActivaApi,
} from '../services/dataService';
import { getStore } from '../services/dataService';

const AuthContext = createContext(null);

function buildSessionFromMock(usuario, rol) {
  return {
    user: {
      id: usuario.id,
      authUserId: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      telefono: usuario.telefono || '',
      cargo: usuario.cargo || '',
      avatar_url: usuario.avatar_url || null,
    },
    organizacion_id: usuario.organizacion_id,
    organizacion: DEMO_ORGANIZACIONES[usuario.organizacion_id],
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
  const [esSuperAdmin, setEsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((session) => {
    if (!session) {
      setUser(null);
      setOrganizacion(null);
      setRolId(null);
      setRolNombre(null);
      setPermisos([]);
      setEsSuperAdmin(false);
      return;
    }
    setUser(session.user);
    setEsSuperAdmin(Boolean(session.esSuperAdmin));
    setOrganizacion(
      session.organizacion || DEMO_ORGANIZACIONES[session.organizacion_id] || null
    );
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
    const perfil = await fetchPerfilByAuthId(authUser.id);
    if (perfil?.error || !perfil?.user) {
      setLoading(false);
      throw new Error(
        'Usuario sin perfil. Ejecute en Supabase 007_super_admin.sql y npm run db:seed-super, o regístrese como nueva asociación.'
      );
    }
    const session = {
      user: perfil.user,
      esSuperAdmin: perfil.esSuperAdmin,
      organizacion: perfil.organizacion,
      organizacion_id: perfil.organizacion_id,
      rol_id: perfil.rol_id,
      rol_nombre: perfil.rol_nombre,
      permisos: perfil.permisos,
    };
    applySession(session);
    setLoading(false);
    return session;
  }, [applySession]);

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

    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    async function initSupabaseAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        try {
          await hydrateUser(session.user);
        } catch {
          applySession(null);
        }
      } else {
        setLoading(false);
      }
    }

    initSupabaseAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        try {
          await hydrateUser(session.user);
        } catch {
          applySession(null);
        }
      } else {
        applySession(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadMockSession, applySession, hydrateUser]);

  const hasPermiso = useCallback(
    (permisoId) => tienePermiso(permisos, permisoId),
    [permisos]
  );

  const rutaInicio = rutaInicioPorPermisos(permisos, esSuperAdmin);

  const entrarEnOrganizacion = useCallback(
    async (orgId) => {
      if (MOCK_MODE) return;
      const res = await setOrganizacionActivaApi(orgId);
      if (res?.error) throw new Error(res.error);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await hydrateUser(session.user);
    },
    [hydrateUser]
  );

  const salirDeOrganizacion = useCallback(async () => {
    if (MOCK_MODE) return;
    const res = await setOrganizacionActivaApi(null);
    if (res?.error) throw new Error(res.error);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) await hydrateUser(session.user);
  }, [hydrateUser]);

  async function login(email, password) {
    if (MOCK_MODE) {
      const match = buscarUsuarioLogin(email, password);
      if (!match) throw new Error('Credenciales inválidas o usuario inactivo');

      const session = buildSessionFromMock(match.usuario, match.rol);
      localStorage.setItem('vtd_session', JSON.stringify(session));
      applySession(session);
      return session;
    }

    const emailNorm = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailNorm,
      password,
    });
    if (error) {
      throw new Error(
        error.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos. Super admin: super@ventadeturnos.com'
          : error.message
      );
    }
    return hydrateUser(data.user);
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
        subdominio_slug: `${slug}-${Date.now().toString(36).slice(-4)}`,
        creado_por: authData.user.id,
      })
      .select()
      .single();

    if (orgError) throw orgError;

    const { data: rol, error: rolError } = await supabase
      .from('roles_organizacion')
      .insert({
        organizacion_id: org.id,
        nombre: 'Administrador',
        descripcion: 'Acceso total',
        es_sistema: true,
        permisos: PERMISOS_ADMIN_COMPLETO,
      })
      .select()
      .single();

    if (rolError) throw rolError;

    const { error: userError } = await supabase.from('usuarios_app').insert({
      organizacion_id: org.id,
      auth_user_id: authData.user.id,
      nombre: nombreOrganizacion,
      email: email.trim().toLowerCase(),
      rol_id: rol.id,
      activo: true,
    });

    if (userError) throw userError;

    return hydrateUser(authData.user);
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

    const result = await updatePerfil(user.id, organizacion.id, datos, user.email);
    if (result.error) throw new Error(result.error);

    if (MOCK_MODE) {
      const saved = localStorage.getItem('vtd_session');
      if (saved) {
        const session = JSON.parse(saved);
        session.user = {
          ...session.user,
          nombre: result.data.nombre,
          telefono: result.data.telefono || '',
          cargo: result.data.cargo || '',
          avatar_url: result.data.avatar_url || null,
        };
        persistSession(session);
      }
    } else {
      setUser((u) => ({
        ...u,
        nombre: result.data.nombre,
        telefono: result.data.telefono || '',
        cargo: result.data.cargo || '',
        avatar_url: result.data.avatar_url || null,
      }));
    }

    return result.data;
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
    esSuperAdmin,
    hasPermiso,
    rutaInicio,
    entrarEnOrganizacion,
    salirDeOrganizacion,
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
