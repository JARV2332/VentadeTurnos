import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';

export default function PrivateRoute({ children, permission, adminOnly = false }) {
  const { isAuthenticated, loading, hasPermiso, rutaInicio } = useAuth();

  const permisoRequerido = adminOnly ? 'usuarios' : permission;

  if (loading) return <Loader fullScreen text="Verificando sesión..." />;

  if (!isAuthenticated) return <Navigate to="/" replace />;

  if (permisoRequerido && !hasPermiso(permisoRequerido)) {
    return <Navigate to={rutaInicio} replace />;
  }

  return children;
}
