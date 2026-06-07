import React, { useState } from 'react';
import { combinarNombreDevoto } from '../utils/importReservasUtils';
import { aplicarImportApartados } from '../services/dataService';
import { normalizarCui, isValidCui } from '../utils/cuiUtils';

const FORM_LISTADO = {
  apellido: '',
  nombre: '',
  dpi: '',
  cantidad: '1',
  turnoId: '',
};

const FORM_INDIVIDUAL = {
  turnoId: '',
  brazo: '',
  lado: 'Izquierda',
  apellido: '',
  nombre: '',
  dpi: '',
  notas: '',
};

export default function ManualApartadoForm({ cortejoId, organizacionId, user, turnos, onAplicado }) {
  const [modo, setModo] = useState('listado');
  const [listado, setListado] = useState(FORM_LISTADO);
  const [individual, setIndividual] = useState(FORM_INDIVIDUAL);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const turnoSeleccionado = (turnos || []).find((t) => t.id === (modo === 'listado' ? listado.turnoId : individual.turnoId));

  const labelTurno = (t) =>
    `#${t.numero_turno} — ${t.etiqueta || t.tipo_turno}`;

  const handleApartar = async (e) => {
    e.preventDefault();
    setError('');
    setOkMsg('');

    if (!cortejoId) {
      setError('Seleccione una procesión.');
      return;
    }

    let fila;

    if (modo === 'listado') {
      const apellido = listado.apellido.trim();
      const nombre = listado.nombre.trim();
      const nombreCompleto = combinarNombreDevoto(apellido, nombre);
      const cantidad = Number(listado.cantidad);

      if (!apellido && !nombre) {
        setError('Indique apellido o nombre del devoto(a).');
        return;
      }
      if (!listado.turnoId || !turnoSeleccionado) {
        setError('Seleccione el turno.');
        return;
      }
      if (!Number.isFinite(cantidad) || cantidad < 1) {
        setError('La cantidad debe ser al menos 1.');
        return;
      }

      const dpiNorm = normalizarCui(listado.dpi);
      if (listado.dpi.trim() && !isValidCui(dpiNorm)) {
        setError('DPI inválido (13 dígitos). Déjelo vacío si no lo tiene.');
        return;
      }

      fila = {
        modo: 'listado',
        filaExcel: 0,
        apellido,
        nombre,
        nombre_completo: nombreCompleto,
        dpi: dpiNorm || '',
        cui: dpiNorm || '',
        cantidad,
        turno: String(turnoSeleccionado.numero_turno),
      };
    } else {
      const apellido = individual.apellido.trim();
      const nombre = individual.nombre.trim();
      const nombreCompleto = combinarNombreDevoto(apellido, nombre);
      const numeroBrazo = Number(individual.brazo);

      if (!apellido && !nombre) {
        setError('Indique apellido o nombre del devoto(a).');
        return;
      }
      if (!individual.turnoId || !turnoSeleccionado) {
        setError('Seleccione el turno.');
        return;
      }
      if (!Number.isFinite(numeroBrazo) || numeroBrazo < 1) {
        setError('Indique el número de brazo.');
        return;
      }

      const dpiNorm = normalizarCui(individual.dpi);
      if (individual.dpi.trim() && !isValidCui(dpiNorm)) {
        setError('DPI inválido (13 dígitos). Déjelo vacío si no lo tiene.');
        return;
      }

      fila = {
        modo: 'coordenadas',
        filaExcel: 0,
        turno: String(turnoSeleccionado.numero_turno),
        brazo: String(numeroBrazo),
        lado: individual.lado,
        apellido,
        nombre,
        nombre_completo: nombreCompleto,
        dpi: dpiNorm || '',
        cui: dpiNorm || '',
        notas: individual.notas.trim() || '',
      };
    }

    setGuardando(true);
    try {
      const res = await aplicarImportApartados(cortejoId, organizacionId, [fila], {
        usuarioId: user?.id,
      });
      const detalle = res.resultados?.[0];
      if (detalle?.ok) {
        setOkMsg(detalle.mensaje);
        if (modo === 'listado') {
          setListado((prev) => ({ ...FORM_LISTADO, turnoId: prev.turnoId }));
        } else {
          setIndividual((prev) => ({ ...FORM_INDIVIDUAL, turnoId: prev.turnoId }));
        }
        onAplicado?.(res);
      } else {
        setError(detalle?.mensaje || 'No se pudo apartar el espacio.');
      }
    } catch (err) {
      setError(err.message || 'Error al apartar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="panel manual-apartado">
      <h3 className="panel__title">Apartar manualmente (sin Excel)</h3>
      <p className="text-muted config-hint">
        Registre apartados uno a uno o por cantidad en un turno. Se verán en Taquilla en amarillo con
        el nombre, igual que si vinieran del Excel.
      </p>

      <div className="manual-apartado__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={modo === 'listado'}
          className={modo === 'listado' ? 'manual-apartado__tab manual-apartado__tab--active' : 'manual-apartado__tab'}
          onClick={() => setModo('listado')}
        >
          Por turno (cantidad)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={modo === 'individual'}
          className={modo === 'individual' ? 'manual-apartado__tab manual-apartado__tab--active' : 'manual-apartado__tab'}
          onClick={() => setModo('individual')}
        >
          Por brazo (individual)
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {okMsg && <div className="alert alert--success">{okMsg}</div>}

      <form className="manual-apartado__form" onSubmit={handleApartar}>
        {modo === 'listado' ? (
          <div className="form-row form-row--3 manual-apartado__grid">
            <label>
              Apellido *
              <input
                type="text"
                value={listado.apellido}
                onChange={(e) => setListado((p) => ({ ...p, apellido: e.target.value }))}
                placeholder="Pérez"
              />
            </label>
            <label>
              Nombre *
              <input
                type="text"
                value={listado.nombre}
                onChange={(e) => setListado((p) => ({ ...p, nombre: e.target.value }))}
                placeholder="Juan Carlos"
              />
            </label>
            <label>
              DPI (opcional)
              <input
                type="text"
                inputMode="numeric"
                value={listado.dpi}
                onChange={(e) => setListado((p) => ({ ...p, dpi: e.target.value }))}
                placeholder="1234567890101"
              />
            </label>
            <label>
              Cantidad *
              <input
                type="number"
                min={1}
                value={listado.cantidad}
                onChange={(e) => setListado((p) => ({ ...p, cantidad: e.target.value }))}
              />
            </label>
            <label className="manual-apartado__turno">
              Turno *
              <select
                value={listado.turnoId}
                onChange={(e) => setListado((p) => ({ ...p, turnoId: e.target.value }))}
              >
                <option value="">Seleccione…</option>
                {(turnos || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {labelTurno(t)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="form-row form-row--3 manual-apartado__grid">
            <label className="manual-apartado__turno">
              Turno *
              <select
                value={individual.turnoId}
                onChange={(e) => setIndividual((p) => ({ ...p, turnoId: e.target.value }))}
              >
                <option value="">Seleccione…</option>
                {(turnos || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {labelTurno(t)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Brazo *
              <input
                type="number"
                min={1}
                value={individual.brazo}
                onChange={(e) => setIndividual((p) => ({ ...p, brazo: e.target.value }))}
                placeholder="3"
              />
            </label>
            <label>
              Lado *
              <select
                value={individual.lado}
                onChange={(e) => setIndividual((p) => ({ ...p, lado: e.target.value }))}
              >
                <option value="Izquierda">Izquierda</option>
                <option value="Derecha">Derecha</option>
              </select>
            </label>
            <label>
              Apellido *
              <input
                type="text"
                value={individual.apellido}
                onChange={(e) => setIndividual((p) => ({ ...p, apellido: e.target.value }))}
              />
            </label>
            <label>
              Nombre *
              <input
                type="text"
                value={individual.nombre}
                onChange={(e) => setIndividual((p) => ({ ...p, nombre: e.target.value }))}
              />
            </label>
            <label>
              DPI (opcional)
              <input
                type="text"
                inputMode="numeric"
                value={individual.dpi}
                onChange={(e) => setIndividual((p) => ({ ...p, dpi: e.target.value }))}
              />
            </label>
            <label className="manual-apartado__notas">
              Notas
              <input
                type="text"
                value={individual.notas}
                onChange={(e) => setIndividual((p) => ({ ...p, notas: e.target.value }))}
                placeholder="Hermandad, observación…"
              />
            </label>
          </div>
        )}

        <div className="manual-apartado__actions">
          <button type="submit" className="btn btn--primary" disabled={guardando || !(turnos || []).length}>
            {guardando ? 'Apartando…' : 'Apartar ahora'}
          </button>
        </div>
      </form>
    </section>
  );
}
