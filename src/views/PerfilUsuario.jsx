import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { leerImagenComoDataUrl } from '../utils/pagoUtils';

export default function PerfilUsuario() {
  const { user, rolNombre, organizacion, updateProfile } = useAuth();
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    telefono: '',
    cargo: '',
    avatar_url: '',
  });
  const [passwords, setPasswords] = useState({
    actual: '',
    nueva: '',
    confirmar: '',
  });
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      nombre: user?.nombre || '',
      email: user?.email || '',
      telefono: user?.telefono || '',
      cargo: user?.cargo || '',
      avatar_url: user?.avatar_url || '',
    });
  }, [user]);

  const handleAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await leerImagenComoDataUrl(file);
      setForm((f) => ({ ...f, avatar_url: dataUrl }));
    } catch {
      setError('No se pudo cargar la foto.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    setGuardando(true);
    try {
      await updateProfile({
        nombre: form.nombre,
        telefono: form.telefono,
        cargo: form.cargo,
        avatar_url: form.avatar_url || null,
        passwordActual: passwords.actual,
        passwordNueva: passwords.nueva,
        passwordConfirmar: passwords.confirmar,
      });
      setMsg('Perfil actualizado correctamente.');
      setPasswords({ actual: '', nueva: '', confirmar: '' });
    } catch (err) {
      setError(err.message || 'Error al guardar el perfil.');
    } finally {
      setGuardando(false);
    }
  };

  const iniciales = form.nombre?.[0] || user?.email?.[0]?.toUpperCase() || '?';

  return (
    <Layout title="Mi perfil" subtitle="Datos personales y acceso a la cuenta">
      {msg && <div className="alert alert--success">{msg}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="perfil-grid">
        <section className="card perfil-resumen">
          <div className="perfil-avatar-wrap">
            {form.avatar_url ? (
              <img src={form.avatar_url} alt="" className="perfil-avatar perfil-avatar--foto" />
            ) : (
              <span className="perfil-avatar">{iniciales}</span>
            )}
          </div>
          <h2 className="perfil-nombre">{form.nombre || user?.email}</h2>
          <p className="text-muted perfil-meta">{user?.email}</p>
          <span className="badge badge--info">{rolNombre}</span>
          {organizacion && (
            <p className="perfil-org">
              <small>Organización</small>
              <strong>{organizacion.nombre_oficial}</strong>
            </p>
          )}
        </section>

        <section className="card">
          <h3 className="panel__title">Editar perfil</h3>
          <form onSubmit={handleSubmit} className="perfil-form">
            <label className="perfil-foto-label">
              Foto de perfil
              <input type="file" accept="image/*" onChange={handleAvatar} />
            </label>
            {form.avatar_url && (
              <button
                type="button"
                className="btn btn--ghost btn--sm perfil-quitar-foto"
                onClick={() => setForm((f) => ({ ...f, avatar_url: '' }))}
              >
                Quitar foto
              </button>
            )}

            <label>
              Nombre completo
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                required
              />
            </label>

            <label>
              Correo electrónico
              <input type="email" value={form.email} disabled />
              <span className="hint">El correo de acceso lo gestiona el administrador.</span>
            </label>

            <label>
              Teléfono
              <input
                type="tel"
                placeholder="50212345678"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </label>

            <label>
              Cargo / puesto
              <input
                type="text"
                placeholder="Ej. Operador de taquilla"
                value={form.cargo}
                onChange={(e) => setForm({ ...form, cargo: e.target.value })}
              />
            </label>

            <div className="perfil-seccion-pass">
              <h4>Cambiar contraseña</h4>
              <p className="hint">Deje en blanco si no desea cambiarla.</p>
              <label>
                Contraseña actual
                <input
                  type="password"
                  autoComplete="current-password"
                  value={passwords.actual}
                  onChange={(e) => setPasswords({ ...passwords, actual: e.target.value })}
                />
              </label>
              <label>
                Nueva contraseña
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwords.nueva}
                  onChange={(e) => setPasswords({ ...passwords, nueva: e.target.value })}
                />
              </label>
              <label>
                Confirmar nueva contraseña
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwords.confirmar}
                  onChange={(e) => setPasswords({ ...passwords, confirmar: e.target.value })}
                />
              </label>
            </div>

            <button type="submit" className="btn btn--primary" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </form>
        </section>
      </div>
    </Layout>
  );
}
