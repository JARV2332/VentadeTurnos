import React from 'react';
import StatusBadge from './StatusBadge';
import { repertorioTurnoLista } from '../utils/turnoUtils';
import { combinarFechaHoraTurno } from '../utils/turnoHorarioUtils';
import { etiquetaAsignado } from '../utils/importReservasUtils';
import { resumenApartadosTurno } from '../utils/apartadosDisplayUtils';
import { esReservaTaquillaExpirada } from '../utils/reservasTaquillaUtils';

/** Prioridad visual: vendido > apartado formal > reserva taquilla > disponible */
function claseEstadoVisualBrazo(brazo) {
  if (esReservaTaquillaExpirada(brazo)) return 'espacio--disponible';
  switch (brazo.estado) {
    case 'vendido':
      return 'espacio--vendido';
    case 'disponible':
      return 'espacio--disponible';
    case 'reservado':
      return brazo.reserva_apartado ? 'espacio--apartado' : 'espacio--reservado';
    default:
      return '';
  }
}

export default function EspacioBrazo({ brazo, selected, destacado, onClick, readOnly = false }) {
  const reservaExpirada = esReservaTaquillaExpirada(brazo);
  const vendido = brazo.estado === 'vendido';
  const asignado = etiquetaAsignado(brazo, brazo.cargador);
  const esApartado = brazo.estado === 'reservado' && brazo.reserva_apartado && !reservaExpirada;
  const estadoLegible =
    brazo.estado === 'vendido'
      ? 'Vendido'
      : reservaExpirada
        ? 'Libre (reserva expirada)'
      : esApartado
        ? 'Apartado'
        : brazo.estado === 'reservado'
          ? 'Reserva taquilla'
          : brazo.estado;
  const displayNombre =
    asignado && asignado !== 'Apartado'
      ? asignado.split(' ').slice(0, 2).join(' ')
      : esApartado
        ? 'Apartado'
        : null;
  const titleParts = [
    `Brazo ${brazo.numero_brazo} ${brazo.lado}`,
    estadoLegible,
    asignado ? `→ ${asignado}` : '',
    brazo.apartado_notas ? `(${brazo.apartado_notas})` : '',
  ].filter(Boolean);

  return (
    <button
      type="button"
      className={`espacio-brazo ${claseEstadoVisualBrazo(brazo)} ${selected ? 'espacio-brazo--selected' : ''} ${
        destacado ? 'espacio-brazo--destacado' : ''
      } ${readOnly ? 'espacio-brazo--readonly' : ''}`}
      onClick={() => !readOnly && onClick(brazo)}
      disabled={vendido || readOnly}
      title={titleParts.join(' · ')}
    >
      <span className="espacio-brazo__num">{brazo.numero_brazo}</span>
      {displayNombre && brazo.estado !== 'disponible' && (
        <span className="espacio-brazo__asignado" title={asignado || undefined}>
          {displayNombre}
        </span>
      )}
    </button>
  );
}

export function TurnoCartulina({
  turno,
  selectedBrazo,
  selectedBrazoIds,
  brazosDestacadosIds,
  onClickBrazo,
  readOnly = false,
  onEdit,
  fechaEvento,
}) {
  const idsEnCarrito = Array.isArray(selectedBrazoIds) ? selectedBrazoIds : [];
  const idsDestacados = Array.isArray(brazosDestacadosIds) ? brazosDestacadosIds : [];
  const isSelected = (id) =>
    idsEnCarrito.includes(id) || selectedBrazo?.id === id;
  const isDestacado = (id) => idsDestacados.includes(id);
  const formatQ = (n) =>
    new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n);
  const repertorio = repertorioTurnoLista(turno);
  const izquierda = Array.isArray(turno?.izquierda) ? turno.izquierda : [];
  const derecha = Array.isArray(turno?.derecha) ? turno.derecha : [];
  const apartadosResumen = resumenApartadosTurno(turno);

  return (
    <article className="turno-cartulina">
      <header className="turno-cartulina__header">
        <div>
          <span className="turno-cartulina__num">Turno #{turno.numero_turno}</span>
          <span className="turno-cartulina__tipo">{turno.etiqueta || turno.tipo_turno}</span>
        </div>
        <div className="turno-cartulina__meta">
          <StatusBadge status={turno.tipo_turno} />
          {(turno.hora_estimada || fechaEvento) && (
            <span className="turno-cartulina__horario" title="Fecha y hora estimada">
              {combinarFechaHoraTurno(fechaEvento, turno.hora_estimada)}
            </span>
          )}
          <span className="turno-cartulina__precio">{formatQ(turno.precio)}</span>
          {onEdit && (
            <button
              type="button"
              className="btn btn--ghost btn--sm turno-cartulina__edit"
              onClick={() => onEdit(turno)}
            >
              Editar
            </button>
          )}
        </div>
      </header>

      {repertorio.length > 0 && (
        <div className="turno-cartulina__repertorio" aria-label="Repertorio del turno">
          {repertorio.map((item) => (
            <span key={item.tipo} className="turno-repertorio-item">
              <span className="turno-repertorio-item__tipo">{item.tipo}</span>
              <span className="turno-repertorio-item__texto">{item.texto}</span>
            </span>
          ))}
        </div>
      )}

      {apartadosResumen.length > 0 && (
        <div className="turno-cartulina__apartados" aria-label="Apartados en este turno">
          <span className="turno-cartulina__apartados-label">Apartados:</span>
          {apartadosResumen.map((a) => (
            <span key={a.nombre} className="turno-cartulina__apartado-chip" title={a.nombre}>
              {a.nombre}
              {a.cantidad > 1 ? ` (×${a.cantidad})` : ''}
            </span>
          ))}
        </div>
      )}

      <div className="turno-cartulina__cuerpo">
        <div className="turno-columna turno-columna--izq">
          <span className="turno-columna__label">Izquierda</span>
          <div className="turno-columna__lista">
            {izquierda.map((b) => (
              <EspacioBrazo
                key={b.id}
                brazo={b}
                selected={isSelected(b.id)}
                destacado={isDestacado(b.id)}
                onClick={readOnly ? () => {} : onClickBrazo}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>

        <div className="turno-cartulina__eje">
          <div className="turno-eje__barra" />
          <span className="turno-eje__num">{turno.numero_turno}</span>
          <div className="turno-eje__barra" />
        </div>

        <div className="turno-columna turno-columna--der">
          <span className="turno-columna__label">Derecha</span>
          <div className="turno-columna__lista">
            {derecha.map((b) => (
              <EspacioBrazo
                key={b.id}
                brazo={b}
                selected={isSelected(b.id)}
                destacado={isDestacado(b.id)}
                onClick={readOnly ? () => {} : onClickBrazo}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      </div>

      <footer className="turno-cartulina__footer">
        {izquierda.length} + {derecha.length} brazos
        ({turno.izquierda.length} por lado)
      </footer>
    </article>
  );
}
