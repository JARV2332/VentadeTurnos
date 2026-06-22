import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PANTALLAS, puedeVerPantalla } from '../config/permisos';
import Loader from './Loader';

export default function PrivateRoute({ children, permission, adminOnly = false }) {
  const { isAuthenticated, loading, hasPermiso, rutaInicio } = useAuth();

  const permisoRequerido = adminOnly ? 'usuarios' : permission;

  if (loading) return <Loader fullScreen text="Verificando sesión..." />;

  if (!isAuthenticated) return <Navigate to="/" replace />;

  if (permisoRequerido) {
    const pantalla = PANTALLAS.find((p) => p.id === permisoRequerido);
    const permitido = pantalla
      ? puedeVerPantalla(hasPermiso, pantalla)
      : hasPermiso(permisoRequerido);
    if (!permitido) {
      return <Navigate to={rutaInicio} replace />;
    }
  }

  return children;
}
