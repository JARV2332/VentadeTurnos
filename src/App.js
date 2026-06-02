import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Landing from './views/Landing';
import Dashboard from './views/Dashboard';
import ConfigSaaS from './views/ConfigSaaS';
import ConfigCorreo from './views/ConfigCorreo';
import ConfigUsuarios from './views/ConfigUsuarios';
import ConfigImportReservas from './views/ConfigImportReservas';
import Taquilla from './views/Taquilla';
import CajaSaaS from './views/CajaSaaS';
import Impresion from './views/Impresion';
import EntregaTurno from './views/EntregaTurno';
import PerfilUsuario from './views/PerfilUsuario';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute permission="dashboard">
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/config/usuarios"
            element={
              <PrivateRoute permission="usuarios">
                <ConfigUsuarios />
              </PrivateRoute>
            }
          />
          <Route
            path="/config/reservas"
            element={
              <PrivateRoute permission="import_reservas">
                <ConfigImportReservas />
              </PrivateRoute>
            }
          />
          <Route
            path="/config/correo"
            element={
              <PrivateRoute permission="config_correo">
                <ConfigCorreo />
              </PrivateRoute>
            }
          />
          <Route
            path="/config"
            element={
              <PrivateRoute permission="config">
                <ConfigSaaS />
              </PrivateRoute>
            }
          />
          <Route
            path="/taquilla"
            element={
              <PrivateRoute permission="taquilla">
                <Taquilla />
              </PrivateRoute>
            }
          />
          <Route
            path="/caja"
            element={
              <PrivateRoute permission="caja">
                <CajaSaaS />
              </PrivateRoute>
            }
          />
          <Route
            path="/entrega"
            element={
              <PrivateRoute permission="entrega">
                <EntregaTurno />
              </PrivateRoute>
            }
          />
          <Route
            path="/impresion"
            element={
              <PrivateRoute permission="impresion">
                <Impresion />
              </PrivateRoute>
            }
          />
          <Route
            path="/perfil"
            element={
              <PrivateRoute>
                <PerfilUsuario />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
