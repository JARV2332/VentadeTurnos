import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import {
  listOrganizacionesPlataforma,
  crearOrganizacionPlataforma,
} from '../services/dataService';

const FORM_VACIO = {
  nombreOficial: '',
  entidad: '',
  telefono: '',
  subdominioSlug: '',
  adminNombre: '',
  adminEmail: '',
  adminPassword: '',
};

export default function PlataformaAdmin() {
  const { entrarEnOrganizacion, organizacion, esSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState([]);
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setOrgs(await listOrganizacionesPlataforma());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCrear = async (e) => {
    e.preventDefault();
    setError('');
    setOkMsg('');
    setGuardando(true);
    try {
      const res = await crearOrganizacionPlataforma({
        nombreOficial: form.nombreOficial,
        entidad: form.entidad,
        telefono: form.telefono,
        subdominioSlug: form.subdominioSlug || undefined,
        adminNombre: form.adminNombre,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOkMsg(`Asociación "${res.data.organizacion.nombre_oficial}" creada. Admin: ${res.data.adminEmail}`);
      setForm(FORM_VACIO);
      refresh();
    } finally {
      setGuardando(false);
    }
  };

  const handleEntrar = async (org) => {
    setError('');
    try {
      await entrarEnOrganizacion(org.id);
      navigate('/config/usuarios');
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Layout
      title="Administración de plataforma"
      subtitle="Cree asociaciones y asigne un administrador; luego entre a cada una para crear usuarios y roles"
    >
      {okMsg && <div className="alert alert--success">{okMsg}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {organizacion && esSuperAdmin && (
        <div className="alert alert--info">
          Asociación activa: <strong>{organizacion.nombre_oficial}</strong> — use el menú para
          Config → Usuarios y roles, o vuelva aquí para cambiar de asociación.
        </div>
      )}

      <section className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Nueva asociación</h3>
        <p className="text-muted">
          Se crea la organización, el rol Administrador y el primer usuario admin de esa
          asociación.
        </p>
        <form onSubmit={handleCrear} className="form-grid">
          <label>
            Nombre oficial
            <input
              value={form.nombreOficial}
              onChange={(e) => setForm((f) => ({ ...f, nombreOficial: e.target.value }))}
              required
            />
          </label>
          <label>
            Parroquia / entidad
            <input
              value={form.entidad}
              onChange={(e) => setForm((f) => ({ ...f, entidad: e.target.value }))}
            />
          </label>
          <label>
            Teléfono contacto
            <input
              value={form.telefono}
              onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
            />
          </label>
          <label>
            Correo administrador
            <input
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
              required
            />
          </label>
          <label>
            Contraseña administrador
            <input
              type="password"
              value={form.adminPassword}
              onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
              required
              minLength={6}
            />
          </label>
          <label>
            Nombre del administrador
            <input
              value={form.adminNombre}
              onChange={(e) => setForm((f) => ({ ...f, adminNombre: e.target.value }))}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={guardando}>
              {guardando ? 'Creando…' : 'Crear asociación'}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h3>Asociaciones registradas</h3>
        {loading ? (
          <p>Cargando…</p>
        ) : orgs.length === 0 ? (
          <p>No hay asociaciones. Cree la primera arriba.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Entidad</th>
                <th>Slug</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td>{o.nombre_oficial}</td>
                  <td>{o.entidad_o_parroquia || '—'}</td>
                  <td><code>{o.subdominio_slug}</code></td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => handleEntrar(o)}
                    >
                      Administrar usuarios
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </Layout>
  );
}
