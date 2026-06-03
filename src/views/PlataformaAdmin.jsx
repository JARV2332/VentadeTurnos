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

  const setField = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

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
      setOkMsg(
        `Asociación "${res.data.organizacion.nombre_oficial}" creada. Admin: ${res.data.adminEmail}`
      );
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
      subtitle="Cree asociaciones, asigne un administrador y entre a cada una para gestionar usuarios y roles"
    >
      {okMsg && <div className="alert alert--success">{okMsg}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {organizacion && esSuperAdmin && (
        <div className="alert alert--info">
          Asociación activa: <strong>{organizacion.nombre_oficial}</strong> — use el menú para
          Config → Usuarios y roles, o vuelva aquí para cambiar de asociación.
        </div>
      )}

      <div className="config-grid config-grid--wide plataforma-grid">
        <form className="panel config-form plataforma-form" onSubmit={handleCrear}>
          <h3 className="panel__title">Nueva asociación</h3>
          <p className="panel__subtitle text-muted">
            Se crea la organización, el rol Administrador y el primer usuario admin.
          </p>

          <fieldset className="config-seccion">
            <legend>Datos de la asociación</legend>
            <label>
              Nombre oficial
              <input
                type="text"
                placeholder="Ej. Pastoral de Religiosidad Popular…"
                value={form.nombreOficial}
                onChange={(e) => setField('nombreOficial', e.target.value)}
                required
              />
            </label>
            <div className="form-row form-row--2">
              <label>
                Parroquia / entidad
                <input
                  type="text"
                  placeholder="Ej. Nuestra Señora de La Asunción"
                  value={form.entidad}
                  onChange={(e) => setField('entidad', e.target.value)}
                />
              </label>
              <label>
                Teléfono de contacto
                <input
                  type="tel"
                  placeholder="50255551234"
                  value={form.telefono}
                  onChange={(e) => setField('telefono', e.target.value)}
                />
              </label>
            </div>
            <label>
              Slug / subdominio (opcional)
              <input
                type="text"
                placeholder="pastoral-asuncion"
                value={form.subdominioSlug}
                onChange={(e) => setField('subdominioSlug', e.target.value)}
              />
              <small className="text-muted">Solo letras, números y guiones. Si lo deja vacío, se genera automáticamente.</small>
            </label>
          </fieldset>

          <fieldset className="config-seccion">
            <legend>Administrador de la asociación</legend>
            <p className="config-seccion__desc">
              Esta persona podrá crear roles, usuarios de caja, vendedores, etc.
            </p>
            <label>
              Nombre del administrador
              <input
                type="text"
                placeholder="Ej. María García"
                value={form.adminNombre}
                onChange={(e) => setField('adminNombre', e.target.value)}
              />
            </label>
            <div className="form-row form-row--2">
              <label>
                Correo electrónico
                <input
                  type="email"
                  placeholder="admin@pastoral.org"
                  value={form.adminEmail}
                  onChange={(e) => setField('adminEmail', e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>
              <label>
                Contraseña inicial
                <input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={form.adminPassword}
                  onChange={(e) => setField('adminPassword', e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </label>
            </div>
          </fieldset>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={guardando}>
              {guardando ? 'Creando…' : 'Crear asociación'}
            </button>
          </div>
        </form>

        <section className="panel plataforma-lista">
          <h3 className="panel__title">Asociaciones registradas</h3>
          {loading ? (
            <p className="text-muted">Cargando…</p>
          ) : orgs.length === 0 ? (
            <div className="plataforma-empty">
              <p className="plataforma-empty__icon">◇</p>
              <p><strong>Sin asociaciones aún</strong></p>
              <p className="text-muted">Complete el formulario para registrar la primera pastoral o hermandad.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Entidad</th>
                    <th>Slug</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => (
                    <tr key={o.id}>
                      <td><strong>{o.nombre_oficial}</strong></td>
                      <td>{o.entidad_o_parroquia || '—'}</td>
                      <td><code className="slug-code">{o.subdominio_slug}</code></td>
                      <td className="td-actions">
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => handleEntrar(o)}
                        >
                          Administrar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

