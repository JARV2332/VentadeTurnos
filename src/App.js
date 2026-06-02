import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Landing from './views/Landing';
import Dashboard from './views/Dashboard';
import ConfigSaaS from './views/ConfigSaaS';
import ConfigCorreo from './views/ConfigCorreo';
import Taquilla from './views/Taquilla';
import CajaSaaS from './views/CajaSaaS';
import Impresion from './views/Impresion';
import EntregaTurno from './views/EntregaTurno';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/config/correo"
            element={
              <PrivateRoute adminOnly>
                <ConfigCorreo />
              </PrivateRoute>
            }
          />
          <Route
            path="/config"
            element={
              <PrivateRoute adminOnly>
                <ConfigSaaS />
              </PrivateRoute>
            }
          />
          <Route
            path="/taquilla"
            element={
              <PrivateRoute>
                <Taquilla />
              </PrivateRoute>
            }
          />
          <Route
            path="/caja"
            element={
              <PrivateRoute>
                <CajaSaaS />
              </PrivateRoute>
            }
          />
          <Route
            path="/entrega"
            element={
              <PrivateRoute>
                <EntregaTurno />
              </PrivateRoute>
            }
          />
          <Route
            path="/impresion"
            element={
              <PrivateRoute>
                <Impresion />
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
