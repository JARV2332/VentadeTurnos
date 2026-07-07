import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';
import { MOCK_MODE } from '../config/supabaseClient';

export default function RecuperarContrasena() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'No se pudo enviar el correo.');
    } finally {
      setLoading(false);
    }
  };

  if (MOCK_MODE) {
    return (
      <AuthShell title="Recuperar contraseña" subtitle="Disponible con Supabase conectado.">
        <p className="auth-card__sub">En modo demo use las credenciales de prueba en la pantalla de inicio.</p>
        <Link to="/" className="btn btn--primary btn--block">
          Ir al inicio
        </Link>
      </AuthShell>
    );
  }

  if (sent) {
    return (
      <AuthShell
        title="Revisa tu correo"
        subtitle="Te enviamos un enlace para restablecer tu contraseña."
      >
        <div className="auth-success-panel">
          <div className="auth-success-panel__icon" aria-hidden>
            ✉
          </div>
          <p>
            Si existe una cuenta con <strong>{email.trim().toLowerCase()}</strong>, recibirás un
            mensaje en unos minutos. Abre el enlace y elige una contraseña nueva.
          </p>
          <p className="hint">Revisa también spam o promociones.</p>
          <Link to="/" className="btn btn--primary btn--block">
            Volver a iniciar sesión
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="¿Olvidaste tu contraseña?"
      subtitle="Te enviaremos un enlace seguro a tu correo."
    >
      <h2>Recuperar acceso</h2>
      <p className="auth-card__sub">Indica el correo con el que te registraste.</p>

      <form onSubmit={handleSubmit} className="auth-form">
        <label>
          Correo electrónico
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            required
            autoComplete="email"
          />
        </label>

        {error && <div className="form-error">{error}</div>}

        <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
          {loading ? 'Enviando…' : 'Enviar enlace de recuperación'}
        </button>
      </form>
    </AuthShell>
  );
}
