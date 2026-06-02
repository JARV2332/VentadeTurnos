import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';

export default function PrivateRoute({ children, adminOnly = false }) {
  const { isAuthenticated, loading, isAdmin } = useAuth();

  if (loading) return <Loader fullScreen text="Verificando sesión..." />;

  if (!isAuthenticated) return <Navigate to="/" replace />;

  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;

  return children;
}
