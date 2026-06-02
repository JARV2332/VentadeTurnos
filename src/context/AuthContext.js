import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { MOCK_MODE, supabase } from '../config/supabaseClient';
import { DEMO_USERS, DEMO_ORGANIZACIONES } from '../data/mockData';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [organizacion, setOrganizacion] = useState(null);
  const [rol, setRol] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMockSession = useCallback(() => {
    const saved = localStorage.getItem('vtd_session');
    if (saved) {
      const session = JSON.parse(saved);
      setUser(session.user);
      setOrganizacion(DEMO_ORGANIZACIONES[session.organizacion_id]);
      setRol(session.rol);
    }
    setLoading(false);
  }, []);

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
      else clearSession();
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMockSession]);

  async function hydrateUser(authUser) {
    const { data: roleData } = await supabase
      .from('usuarios_roles')
      .select('rol, organizacion_id, organizaciones(*)')
      .eq('usuario_id', authUser.id)
      .single();

    if (roleData) {
      setUser(authUser);
      setRol(roleData.rol);
      setOrganizacion(roleData.organizaciones);
    }
    setLoading(false);
  }

  function clearSession() {
    setUser(null);
    setOrganizacion(null);
    setRol(null);
    setLoading(false);
  }

  async function login(email, password) {
    if (MOCK_MODE) {
      const demoUser = Object.values(DEMO_USERS).find(
        (u) => u.email === email && u.password === password
      );
      if (!demoUser) throw new Error('Credenciales inválidas');

      const session = {
        user: { id: demoUser.id, email: demoUser.email, nombre: demoUser.nombre },
        organizacion_id: demoUser.organizacion_id,
        rol: demoUser.rol,
      };
      localStorage.setItem('vtd_session', JSON.stringify(session));
      setUser(session.user);
      setOrganizacion(DEMO_ORGANIZACIONES[demoUser.organizacion_id]);
      setRol(demoUser.rol);
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
      clearSession();
      return;
    }
    await supabase.auth.signOut();
    clearSession();
  }

  const value = {
    user,
    organizacion,
    rol,
    organizacionId: organizacion?.id,
    loading,
    isAuthenticated: !!user,
    isAdmin: rol === 'administrador',
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
