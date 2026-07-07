import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { supabase, MOCK_MODE } from '../config/supabaseClient';

export default function ConfirmarCorreo() {
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (MOCK_MODE || !supabase) {
      setStatus('ok');
      return;
    }

    let cancelled = false;

    async function verify() {
      const hash = window.location.hash || '';
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const err = params.get('error_description') || params.get('error');
      if (err) {
        if (!cancelled) {
          setStatus('error');
          setMessage(decodeURIComponent(err.replace(/\+/g, ' ')));
        }
        return;
      }

      for (let i = 0; i < 10; i += 1) {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          setStatus('error');
          setMessage(error.message);
          return;
        }
        if (session?.user?.email_confirmed_at || session?.user?.confirmed_at) {
          setStatus('ok');
          return;
        }
        await new Promise((r) => setTimeout(r, 400));
      }

      if (!cancelled) {
        setStatus('ok');
        setMessage('Si confirmaste desde el correo, ya puedes iniciar sesión.');
      }
    }

    verify();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setStatus('ok');
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (status === 'loading') {
    return (
      <AuthShell title="Confirmando correo…" subtitle="Validando tu enlace.">
        <p className="auth-card__sub">Un momento, por favor.</p>
      </AuthShell>
    );
  }

  if (status === 'error') {
    return (
      <AuthShell title="No se pudo confirmar" subtitle="El enlace puede haber expirado.">
        <div className="auth-success-panel">
          <p>{message || 'Intenta registrarte de nuevo o contacta al administrador.'}</p>
          <Link to="/" className="btn btn--primary btn--block">
            Volver al inicio
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="¡Correo confirmado!" subtitle="Tu cuenta ya está activa.">
      <div className="auth-success-panel">
        <div className="auth-success-panel__icon auth-success-panel__icon--ok" aria-hidden>
          ✓
        </div>
        <p>{message || 'Ya puedes iniciar sesión con tu correo y contraseña.'}</p>
        <Link to="/" className="btn btn--primary btn--block">
          Iniciar sesión
        </Link>
      </div>
    </AuthShell>
  );
}
