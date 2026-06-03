import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MOCK_MODE } from '../config/supabaseClient';
import { rutaInicioPorPermisos } from '../config/permisos';
import BrandLogo from '../components/BrandLogo';

export default function Landing() {
  const { login, register, isAuthenticated, rutaInicio } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    email: '',
    password: '',
    orgName: '',
  });

  React.useEffect(() => {
    if (isAuthenticated) navigate(rutaInicio);
  }, [isAuthenticated, rutaInicio, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let session;
      if (tab === 'login') {
        session = await login(form.email, form.password);
      } else {
        await register(form.email, form.password, form.orgName);
        session = { permisos: ['dashboard', 'usuarios', 'config', 'config_correo', 'taquilla', 'entrega', 'caja', 'impresion'] };
      }
      navigate(
        session?.permisos ? rutaInicioPorPermisos(session.permisos) : rutaInicio
      );
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing">
      <div className="landing__hero">
        <BrandLogo variant="hero" className="landing__brand" />
        <div className="landing__badge">Plataforma SaaS · Multi-tenant</div>
        <h1 className="landing__title">
          Gestión universal de
          <span> turnos y espacios</span>
        </h1>
        <p className="landing__desc">
          Vende, reserva e imprime turnos en tiempo real para cualquier cortejo,
          desfile o evento de carga. Marca blanca, segura y lista para múltiples
          puntos de venta simultáneos.
        </p>

        <div className="landing__features">
          <div className="landing__feature">
            <strong>Tiempo real</strong>
            <span>Sincronización instantánea entre mesas</span>
          </div>
          <div className="landing__feature">
            <strong>Multi-tenant</strong>
            <span>Aislamiento total por organización</span>
          </div>
          <div className="landing__feature">
            <strong>Marca blanca</strong>
            <span>Etiquetas y boletas personalizables</span>
          </div>
        </div>
      </div>

      <div className="landing__auth">
        <div className="auth-card">
          <BrandLogo variant="icon" className="auth-card__brand-icon" />
          <h2>ventadeturnos.com</h2>
          <p className="auth-card__sub">Accede a tu panel de organización</p>

          <div className="auth-tabs">
            <button
              type="button"
              className={tab === 'login' ? 'auth-tabs__btn--active' : ''}
              onClick={() => setTab('login')}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={tab === 'register' ? 'auth-tabs__btn--active' : ''}
              onClick={() => setTab('register')}
            >
              Registrarse
            </button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {tab === 'register' && (
              <label>
                Nombre de la organización
                <input
                  type="text"
                  placeholder="Ej. Pastoral de Religiosidad Popular…"
                  value={form.orgName}
                  onChange={(e) => setForm({ ...form, orgName: e.target.value })}
                  required
                />
              </label>
            )}
            <label>
              Correo electrónico
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </label>

            {error && <div className="form-error">{error}</div>}

            <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
              {loading ? 'Procesando...' : tab === 'login' ? 'Entrar al panel' : 'Crear cuenta'}
            </button>
          </form>

          {!MOCK_MODE && tab === 'login' && (
            <p className="auth-demo" style={{ marginTop: '1rem', fontSize: '0.85rem', opacity: 0.85 }}>
              Super administrador: <strong>super@ventadeturnos.com</strong>
            </p>
          )}

          {MOCK_MODE && (
            <div className="auth-demo">
              <p><strong>Administrador:</strong> admin@demo.com / demo123</p>
              <p><strong>Caja</strong> (taquilla, entrega, impresión): caja@demo.com / demo123</p>
              <p><strong>Vendedor</strong> (solo taquilla): vendedor@demo.com / demo123</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
