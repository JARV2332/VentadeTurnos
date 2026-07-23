import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Landing from './views/Landing';
import RecuperarContrasena from './views/RecuperarContrasena';
import RestablecerContrasena from './views/RestablecerContrasena';
import ConfirmarCorreo from './views/ConfirmarCorreo';
import Dashboard from './views/Dashboard';
import ConfigSaaS from './views/ConfigSaaS';
import ConfigCorreo from './views/ConfigCorreo';
import ConfigRecibo from './views/ConfigRecibo';
import ConfigUsuarios from './views/ConfigUsuarios';
import ConfigImportReservas from './views/ConfigImportReservas';
import Taquilla from './views/Taquilla';
import CajaSaaS from './views/CajaSaaS';
import Impresion from './views/Impresion';
import Devotos from './views/Devotos';
import EntregaTurno from './views/EntregaTurno';
import AjusteEntrega from './views/AjusteEntrega';
import PerfilUsuario from './views/PerfilUsuario';
import PlataformaAdmin from './views/PlataformaAdmin';
import BoletaPublica from './views/BoletaPublica';
import MisTurnosPublico from './views/MisTurnosPublico';
import ConsultaTurnosDevoto from './views/ConsultaTurnosDevoto';
import ListadoTurnos from './views/ListadoTurnos';
import DisponibilidadTurnos from './views/DisponibilidadTurnos';
import ApartadosPendientes from './views/ApartadosPendientes';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/recuperar-contrasena" element={<RecuperarContrasena />} />
          <Route path="/restablecer-contrasena" element={<RestablecerContrasena />} />
          <Route path="/confirmar-correo" element={<ConfirmarCorreo />} />
          <Route path="/boleta/:codigo" element={<BoletaPublica />} />
          <Route path="/mis-turnos/:orgSlug" element={<MisTurnosPublico />} />
          <Route
            path="/plataforma"
            element={
              <PrivateRoute permission="plataforma">
                <PlataformaAdmin />
              </PrivateRoute>
            }
          />
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
            path="/config/recibo"
            element={
              <PrivateRoute permission="config_correo">
                <ConfigRecibo />
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
            path="/ajuste-entrega"
            element={
              <PrivateRoute permission="ajuste_entrega">
                <AjusteEntrega />
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
            path="/consulta-turnos"
            element={
              <PrivateRoute permission="consulta_turnos">
                <ConsultaTurnosDevoto />
              </PrivateRoute>
            }
          />
          <Route
            path="/listado-turnos"
            element={
              <PrivateRoute permission="listado_turnos">
                <ListadoTurnos />
              </PrivateRoute>
            }
          />
          <Route
            path="/disponibilidad-turnos"
            element={
              <PrivateRoute permission="disponibilidad_turnos">
                <DisponibilidadTurnos />
              </PrivateRoute>
            }
          />
          <Route
            path="/apartados-pendientes"
            element={
              <PrivateRoute permission="apartados_pendientes">
                <ApartadosPendientes />
              </PrivateRoute>
            }
          />
          <Route
            path="/devotos"
            element={
              <PrivateRoute permission="devotos">
                <Devotos />
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
