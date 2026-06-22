import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import EditDevotoModal from '../components/EditDevotoModal';
import { useAuth } from '../context/AuthContext';
import {
  getCargadoresByOrg,
  createDevoto,
  updateDevoto,
  deleteDevoto,
  subscribeData,
} from '../services/dataService';
import { TERMINO_DEVOTO } from '../constants/terminologia';

function normalizarBusqueda(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatTelefonoGt(valor) {
  if (!valor) return '—';
  const d = String(valor).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('502')) {
    return `+502 ${d.slice(3, 7)} ${d.slice(7)}`;
  }
  if (d.length === 8) {
    return `+502 ${d.slice(0, 4)} ${d.slice(4)}`;
  }
  return valor;
}

export default function Devotos() {
  const { organizacionId } = useAuth();
  const [devotos, setDevotos] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [devotoSeleccionado, setDevotoSeleccionado] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [eliminandoId, setEliminandoId] = useState(null);

  const refresh = useCallback(async () => {
    const lista = await getCargadoresByOrg(organizacionId);
    setDevotos(Array.isArray(lista) ? lista : []);
  }, [organizacionId]);

  useEffect(() => {
    refresh();
    return subscribeData(organizacionId, refresh);
  }, [organizacionId, refresh]);

  const devotosFiltrados = useMemo(() => {
    const q = normalizarBusqueda(busqueda);
    const lista = [...(devotos || [])].sort((a, b) =>
      (a.nombre_completo || '').localeCompare(b.nombre_completo || '', 'es')
    );
    if (!q) return lista;
    return lista.filter((d) => {
      const nombre = normalizarBusqueda(d.nombre_completo);
      const cui = normalizarBusqueda(d.cui_o_identificacion);
      const correo = normalizarBusqueda(d.correo);
      const wa = normalizarBusqueda(d.whatsapp);
      return nombre.includes(q) || cui.includes(q) || correo.includes(q) || wa.includes(q);
    });
  }, [devotos, busqueda]);

  const abrirCrear = () => {
    setErrorGuardar('');
    setDevotoSeleccionado(null);
    setModalAbierto(true);
  };

  const abrirEditar = (devoto) => {
    setErrorGuardar('');
    setDevotoSeleccionado(devoto);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    if (guardando) return;
    setModalAbierto(false);
    setDevotoSeleccionado(null);
    setErrorGuardar('');
  };

  const handleGuardar = async (datos) => {
    setErrorGuardar('');
    setGuardando(true);
    const esEdicion = Boolean(devotoSeleccionado?.id);
    try {
      const res = esEdicion
        ? await updateDevoto(organizacionId, devotoSeleccionado.id, datos)
        : await createDevoto(organizacionId, datos);
      if (res.error) {
        setErrorGuardar(res.error);
        return;
      }
      setModalAbierto(false);
      setDevotoSeleccionado(null);
      setOkMsg(
        esEdicion
          ? `Datos de ${res.data.nombre_completo} actualizados.`
          : `${res.data.nombre_completo} registrado(a).`
      );
      await refresh();
      setTimeout(() => setOkMsg(''), 5000);
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (devoto) => {
    if (
      !window.confirm(
        `¿Eliminar a ${devoto.nombre_completo}? Solo es posible si no tiene turnos vendidos o apartados.`
      )
    ) {
      return;
    }
    setErrorMsg('');
    setEliminandoId(devoto.id);
    try {
      const res = await deleteDevoto(organizacionId, devoto.id);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      setOkMsg(`${res.nombre || devoto.nombre_completo} eliminado(a).`);
      await refresh();
      setTimeout(() => setOkMsg(''), 5000);
    } finally {
      setEliminandoId(null);
    }
  };

  if (devotos === null) {
    return (
      <Layout title="Devotos" subtitle={`Registro de ${TERMINO_DEVOTO.toLowerCase()}s`}>
        <Loader text="Cargando devotos..." />
      </Layout>
    );
  }

  return (
    <Layout
      title="Devotos"
      subtitle={`Crear, editar o eliminar ${TERMINO_DEVOTO.toLowerCase()}s de la organización`}
    >
      {okMsg && <div className="alert alert--success">{okMsg}</div>}
      {errorMsg && <div className="alert alert--error">{errorMsg}</div>}

      <section className="panel devotos-panel">
        <div className="devotos-panel__head">
          <label className="devotos-panel__busqueda">
            Buscar
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre, CUI, correo o WhatsApp…"
              autoComplete="off"
            />
          </label>
          <button type="button" className="btn btn--primary" onClick={abrirCrear}>
            Nuevo devoto(a)
          </button>
        </div>
        <p className="text-muted config-hint">
          {devotosFiltrados.length} de {devotos.length} registrado(s). El CUI es único por devoto;
          teléfono y correo pueden repetirse. Los cambios se reflejan en boletas, correos y entrega.{' '}
          <Link to="/consulta-turnos">Consultar turnos asignados →</Link>
        </p>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>CUI / DPI</th>
                <th>WhatsApp</th>
                <th>Correo</th>
                <th>Emergencia</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {devotosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted">
                    {busqueda ? 'Sin resultados para la búsqueda.' : 'Aún no hay devotos registrados.'}
                  </td>
                </tr>
              ) : (
                devotosFiltrados.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.nombre_completo}</strong>
                    </td>
                    <td>
                      <code>{d.cui_o_identificacion || '—'}</code>
                    </td>
                    <td>{formatTelefonoGt(d.whatsapp)}</td>
                    <td>{d.correo || '—'}</td>
                    <td>{formatTelefonoGt(d.telefono_emergencia)}</td>
                    <td className="devotos-panel__acciones">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => abrirEditar(d)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm btn--danger-text"
                        disabled={eliminandoId === d.id}
                        onClick={() => handleEliminar(d)}
                      >
                        {eliminandoId === d.id ? 'Eliminando…' : 'Eliminar'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <EditDevotoModal
        abierto={modalAbierto}
        devoto={devotoSeleccionado}
        guardando={guardando}
        errorGuardar={errorGuardar}
        onGuardar={handleGuardar}
        onCerrar={cerrarModal}
      />
    </Layout>
  );
}
