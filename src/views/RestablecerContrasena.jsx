import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';
import { supabase, MOCK_MODE } from '../config/supabaseClient';

export default function RestablecerContrasena() {
  const { completePasswordReset } = useAuth();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (MOCK_MODE || !supabase) return;

    let cancelled = false;

    async function waitForRecoverySession() {
      for (let i = 0; i < 8; i += 1) {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user) {
          setReady(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      if (!cancelled) setInvalidLink(true);
    }

    waitForRecoverySession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session?.user)) {
        setReady(true);
        setInvalidLink(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await completePasswordReset(password);
      setDone(true);
      setTimeout(() => navigate('/'), 2500);
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  if (MOCK_MODE) {
    return (
      <AuthShell title="Restablecer contraseña">
        <Link to="/" className="btn btn--primary btn--block">
          Ir al inicio
        </Link>
      </AuthShell>
    );
  }

  if (invalidLink) {
    return (
      <AuthShell title="Enlace no válido" subtitle="El enlace expiró o ya fue usado.">
        <div className="auth-success-panel">
          <p>Solicita uno nuevo desde la pantalla de recuperación.</p>
          <Link to="/recuperar-contrasena" className="btn btn--primary btn--block">
            Solicitar nuevo enlace
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="¡Listo!" subtitle="Tu contraseña fue actualizada.">
        <div className="auth-success-panel">
          <div className="auth-success-panel__icon auth-success-panel__icon--ok" aria-hidden>
            ✓
          </div>
          <p>Redirigiendo al inicio de sesión…</p>
          <Link to="/" className="btn btn--primary btn--block">
            Entrar ahora
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (!ready) {
    return (
      <AuthShell title="Preparando…" subtitle="Validando tu enlace seguro.">
        <p className="auth-card__sub">Un momento, por favor.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Nueva contraseña" subtitle="Elige una contraseña segura para tu cuenta.">
      <h2>Restablecer contraseña</h2>
      <p className="auth-card__sub">Mínimo 6 caracteres.</p>

      <form onSubmit={handleSubmit} className="auth-form">
        <label>
          Nueva contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirmar contraseña
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </label>

        {error && <div className="form-error">{error}</div>}

        <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </AuthShell>
  );
}
