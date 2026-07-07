import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import {
  getRolesByOrg,
  getUsuariosByOrg,
  saveRol,
  deleteRol,
  saveUsuario,
  setUsuarioActivo,
} from '../services/dataService';
import { pantallasPorGrupo, labelPermiso, PLANTILLAS_ROL } from '../config/permisos';

const ROL_VACIO = {
  nombre: '',
  descripcion: '',
  permisos: [],
};

const USUARIO_VACIO = {
  nombre: '',
  email: '',
  password: '',
  rol_id: '',
  activo: true,
};

export default function ConfigUsuarios() {
  const { organizacionId, user } = useAuth();
  const [tab, setTab] = useState('roles');
  const [roles, setRoles] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [rolForm, setRolForm] = useState(ROL_VACIO);
  const [rolEditId, setRolEditId] = useState(null);
  const [userForm, setUserForm] = useState(USUARIO_VACIO);
  const [userEditId, setUserEditId] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [toggleUsuarioId, setToggleUsuarioId] = useState(null);
  const [rolFormVisible, setRolFormVisible] = useState(false);
  const [userFormVisible, setUserFormVisible] = useState(false);

  const refresh = useCallback(async () => {
    if (!organizacionId) return;
    setRoles(await getRolesByOrg(organizacionId));
    setUsuarios(await getUsuariosByOrg(organizacionId));
  }, [organizacionId]);

  useEffect(() => {
    refresh();
  }, [organizacionId, refresh]);

  const gruposPantallas = pantallasPorGrupo();

  const aplicarPlantillaRol = (clave) => {
    const plantilla = PLANTILLAS_ROL[clave];
    if (!plantilla) return;
    setRolForm({
      nombre: plantilla.nombre,
      descripcion: plantilla.descripcion,
      permisos: [...plantilla.permisos],
    });
    setRolFormVisible(true);
    setError('');
  };

  const togglePermisoRol = (permisoId) => {
    setRolForm((prev) => {
      const tiene = prev.permisos.includes(permisoId);
      return {
        ...prev,
        permisos: tiene
          ? prev.permisos.filter((p) => p !== permisoId)
          : [...prev.permisos, permisoId],
      };
    });
  };

  const editarRol = (rol) => {
    setRolEditId(rol.id);
    setRolForm({
      nombre: rol.nombre,
      descripcion: rol.descripcion || '',
      permisos: [...rol.permisos],
    });
    setRolFormVisible(true);
    setError('');
  };

  const nuevoRol = () => {
    setRolEditId(null);
    setRolForm({ ...ROL_VACIO, permisos: ['taquilla'] });
    setRolFormVisible(true);
    setError('');
  };

  const cancelarRol = () => {
    setRolEditId(null);
    setRolForm(ROL_VACIO);
    setRolFormVisible(false);
    setError('');
  };

  const guardarRol = async (e) => {
    e.preventDefault();
    setError('');
    const res = await saveRol(organizacionId, rolForm, rolEditId);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOkMsg(rolEditId ? 'Rol actualizado.' : 'Rol creado.');
    setRolEditId(null);
    setRolForm(ROL_VACIO);
    setRolFormVisible(false);
    refresh();
    setTimeout(() => setOkMsg(''), 4000);
  };

  const eliminarRol = async (rol) => {
    if (!window.confirm(`¿Eliminar el rol "${rol.nombre}"?`)) return;
    const res = await deleteRol(rol.id, organizacionId);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOkMsg('Rol eliminado.');
    if (rolEditId === rol.id) {
      setRolEditId(null);
      setRolForm(ROL_VACIO);
      setRolFormVisible(false);
    }
    refresh();
    setTimeout(() => setOkMsg(''), 4000);
  };

  const editarUsuario = (u) => {
    setUserEditId(u.id);
    setUserForm({
      nombre: u.nombre,
      email: u.email,
      password: '',
      rol_id: u.rol_id,
      activo: u.activo !== false,
    });
    setUserFormVisible(true);
    setTab('usuarios');
    setError('');
  };

  const nuevoUsuario = () => {
    setUserEditId(null);
    setUserForm({
      ...USUARIO_VACIO,
      rol_id: roles.find((r) => !r.es_sistema)?.id || roles[0]?.id || '',
    });
    setUserFormVisible(true);
    setTab('usuarios');
    setError('');
  };

  const cancelarUsuario = () => {
    setUserEditId(null);
    setUserForm(USUARIO_VACIO);
    setUserFormVisible(false);
    setError('');
  };

  const guardarUsuario = async (e) => {
    e.preventDefault();
    setError('');
    const res = await saveUsuario(organizacionId, userForm, userEditId);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOkMsg(userEditId ? 'Usuario actualizado.' : 'Usuario creado.');
    setUserEditId(null);
    setUserForm(USUARIO_VACIO);
    setUserFormVisible(false);
    refresh();
    setTimeout(() => setOkMsg(''), 4000);
  };

  const toggleActivoUsuario = async (u) => {
    if (u.id === user?.id) {
      setError('No puede desactivar su propia cuenta mientras está conectado.');
      return;
    }

    const activoActual = u.activo !== false;
    const accion = activoActual ? 'desactivar' : 'activar';
    const confirmar = window.confirm(
      `¿${accion.charAt(0).toUpperCase() + accion.slice(1)} a "${u.nombre}"?\n\n${
        activoActual
          ? 'Ya no podrá iniciar sesión hasta que lo reactive.'
          : 'Podrá volver a iniciar sesión con su correo y contraseña.'
      }`
    );
    if (!confirmar) return;

    setError('');
    setToggleUsuarioId(u.id);
    try {
      const res = await setUsuarioActivo(organizacionId, u, !activoActual);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOkMsg(activoActual ? 'Usuario desactivado.' : 'Usuario activado.');
      if (userEditId === u.id) {
        setUserForm((prev) => ({ ...prev, activo: !activoActual }));
      }
      refresh();
      setTimeout(() => setOkMsg(''), 4000);
    } finally {
      setToggleUsuarioId(null);
    }
  };

  return (
    <Layout
      title="Usuarios y roles"
      subtitle="Cree roles con permisos por pantalla y asigne usuarios de caja o taquilla"
    >
      {okMsg && <div className="alert alert--success">{okMsg}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="usuarios-tabs">
        <button
          type="button"
          className={`usuarios-tabs__btn ${tab === 'roles' ? 'usuarios-tabs__btn--active' : ''}`}
          onClick={() => setTab('roles')}
        >
          Roles y permisos
        </button>
        <button
          type="button"
          className={`usuarios-tabs__btn ${tab === 'usuarios' ? 'usuarios-tabs__btn--active' : ''}`}
          onClick={() => setTab('usuarios')}
        >
          Usuarios ({usuarios.length})
        </button>
      </div>

      {tab === 'roles' && (
        <div className="config-grid config-grid--wide">
          <div className="panel">
            <div className="panel__head-row">
              <h3 className="panel__title">Roles de la organización</h3>
              <button type="button" className="btn btn--primary btn--sm" onClick={nuevoRol}>
                + Nuevo rol
              </button>
            </div>
            <p className="text-muted config-hint">
              Marque qué pantallas del menú lateral puede ver cada rol. Use una plantilla para
              incluir Consulta, Listado y Disponibilidad sin marcarlas una a una.
            </p>

            <div className="roles-plantillas">
              <span className="roles-plantillas__label">Plantillas rápidas</span>
              <div className="roles-plantillas__btns">
                {Object.entries(PLANTILLAS_ROL).map(([clave, p]) => (
                  <button
                    key={clave}
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => aplicarPlantillaRol(clave)}
                    title={p.descripcion}
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>
            </div>

            <div className="roles-lista">
              {roles.map((rol) => (
                <div
                  key={rol.id}
                  className={`rol-card ${rolEditId === rol.id ? 'rol-card--active' : ''}`}
                >
                  <div className="rol-card__head">
                    <strong>{rol.nombre}</strong>
                    {rol.es_sistema && <span className="badge badge--info">Sistema</span>}
                  </div>
                  {rol.descripcion && (
                    <p className="rol-card__desc text-muted">{rol.descripcion}</p>
                  )}
                  <div className="rol-card__permisos">
                    {(Array.isArray(rol.permisos) ? rol.permisos : []).map((p) => (
                      <span key={p} className="permiso-chip">
                        {labelPermiso(p)}
                      </span>
                    ))}
                  </div>
                  <div className="rol-card__actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => editarRol(rol)}
                    >
                      Editar
                    </button>
                    {!rol.es_sistema && (
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        onClick={() => eliminarRol(rol)}
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form
            className={`panel config-form ${rolFormVisible ? 'config-form--visible' : ''}`}
            onSubmit={guardarRol}
          >
            <div className="config-form__head">
              <h3 className="panel__title">
                {rolEditId ? 'Editar rol' : 'Crear rol'}
              </h3>
              <button type="button" className="btn btn--ghost btn--sm config-form__cancel" onClick={cancelarRol}>
                Cancelar
              </button>
            </div>

            <label>
              Nombre del rol
              <input
                type="text"
                placeholder="Ej. Operador de caja"
                value={rolForm.nombre}
                onChange={(e) => setRolForm({ ...rolForm, nombre: e.target.value })}
                required
              />
            </label>

            <label>
              Descripción
              <textarea
                rows={2}
                placeholder="Para qué sirve este rol…"
                value={rolForm.descripcion}
                onChange={(e) => setRolForm({ ...rolForm, descripcion: e.target.value })}
              />
            </label>

            <fieldset className="permisos-fieldset">
              <legend>Pantallas permitidas (sidebar)</legend>
              {Object.entries(gruposPantallas).map(([grupo, pantallas]) => (
                <div key={grupo} className="permisos-grupo">
                  <span className="permisos-grupo__titulo">{grupo}</span>
                  <div className="permisos-grid">
                    {pantallas.map((p) => (
                      <label key={p.id} className="permiso-check">
                        <input
                          type="checkbox"
                          checked={rolForm.permisos.includes(p.id)}
                          onChange={() => togglePermisoRol(p.id)}
                        />
                        <span>
                          <span className="permiso-check__icon">{p.icon}</span>
                          {p.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>

            <button type="submit" className="btn btn--primary">
              {rolEditId ? 'Guardar rol' : 'Crear rol'}
            </button>
          </form>
        </div>
      )}

      {tab === 'usuarios' && (
        <div className="config-grid config-grid--wide">
          <div className="panel">
            <div className="panel__head-row">
              <h3 className="panel__title">Usuarios</h3>
              <button type="button" className="btn btn--primary btn--sm" onClick={nuevoUsuario}>
                + Nuevo usuario
              </button>
            </div>
            <p className="text-muted config-hint">
              Cada usuario inicia sesión con su correo y ve solo las pantallas de su rol.
            </p>

            <div className="table-wrap table-wrap--cards">
              <table className="data-table data-table--stack">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>Rol</th>
                    <th>Pantallas</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id}>
                      <td data-label="Nombre">{u.nombre}</td>
                      <td data-label="Correo">{u.email}</td>
                      <td data-label="Rol">{u.rol_nombre}</td>
                      <td data-label="Pantallas">
                        <span className="text-muted usuarios-permisos-mini">
                          {(Array.isArray(u.permisos) ? u.permisos : []).map(labelPermiso).join(', ')}
                        </span>
                      </td>
                      <td data-label="Estado">
                        <span className={`badge ${u.activo !== false ? 'badge--success' : 'badge--warning'}`}>
                          {u.activo !== false ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td data-label="Acciones">
                        <div className="usuarios-tabla-acciones">
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => editarUsuario(u)}
                          >
                            Editar
                          </button>
                          {u.id !== user?.id && (
                            <button
                              type="button"
                              className={`btn btn--sm ${
                                u.activo !== false ? 'btn--warning' : 'btn--success'
                              }`}
                              disabled={toggleUsuarioId === u.id}
                              onClick={() => toggleActivoUsuario(u)}
                            >
                              {toggleUsuarioId === u.id
                                ? '…'
                                : u.activo !== false
                                  ? 'Desactivar'
                                  : 'Activar'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <form
            className={`panel config-form ${userFormVisible ? 'config-form--visible' : ''}`}
            onSubmit={guardarUsuario}
          >
            <div className="config-form__head">
              <h3 className="panel__title">
                {userEditId ? 'Editar usuario' : 'Crear usuario'}
              </h3>
              <button type="button" className="btn btn--ghost btn--sm config-form__cancel" onClick={cancelarUsuario}>
                Cancelar
              </button>
            </div>

            <label>
              Nombre completo
              <input
                type="text"
                value={userForm.nombre}
                onChange={(e) => setUserForm({ ...userForm, nombre: e.target.value })}
                required
              />
            </label>

            <label>
              Correo (inicio de sesión)
              <input
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                required
              />
            </label>

            <label>
              {userEditId ? 'Nueva contraseña (opcional)' : 'Contraseña'}
              <input
                type="password"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                required={!userEditId}
                minLength={6}
              />
            </label>

            <label>
              Rol
              <select
                value={userForm.rol_id}
                onChange={(e) => setUserForm({ ...userForm, rol_id: e.target.value })}
                required
              >
                <option value="">Seleccione un rol…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={userForm.activo}
                onChange={(e) => setUserForm({ ...userForm, activo: e.target.checked })}
              />
              Usuario activo (puede iniciar sesión)
            </label>

            <button type="submit" className="btn btn--primary">
              {userEditId ? 'Guardar usuario' : 'Crear usuario'}
            </button>
          </form>
        </div>
      )}

      <section className="panel info-box">
        <strong>Demo:</strong> Admin <code>admin@demo.com</code> · Caja{' '}
        <code>caja@demo.com</code> (taquilla, entrega, impresión) · Vendedor{' '}
        <code>vendedor@demo.com</code> (solo taquilla). Contraseña: <code>demo123</code>
      </section>
    </Layout>
  );
}
