import React from 'react';
import StatusBadge from './StatusBadge';
import { repertorioTurnoLista } from '../utils/turnoUtils';
import { etiquetaAsignado } from '../utils/importReservasUtils';

const ESTADO_CLASS = {
  disponible: 'espacio--disponible',
  reservado: 'espacio--reservado',
  vendido: 'espacio--vendido',
};

export default function EspacioBrazo({ brazo, selected, onClick, readOnly = false }) {
  const vendido = brazo.estado === 'vendido';
  const asignado = etiquetaAsignado(brazo, brazo.cargador);
  const esApartado = brazo.reserva_apartado && brazo.estado === 'reservado';
  const displayNombre =
    asignado && asignado !== 'Apartado'
      ? asignado.split(' ').slice(0, 2).join(' ')
      : esApartado
        ? 'Apartado'
        : null;
  const titleParts = [
    `Brazo ${brazo.numero_brazo} ${brazo.lado}`,
    brazo.estado,
    asignado ? `→ ${asignado}` : '',
    brazo.apartado_notas ? `(${brazo.apartado_notas})` : '',
  ].filter(Boolean);

  return (
    <button
      type="button"
      className={`espacio-brazo ${ESTADO_CLASS[brazo.estado] || ''} ${
        brazo.reserva_apartado ? 'espacio-brazo--apartado' : ''
      } ${selected ? 'espacio-brazo--selected' : ''} ${
        readOnly ? 'espacio-brazo--readonly' : ''
      }`}
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

export function TurnoCartulina({ turno, selectedBrazo, selectedBrazoIds, onClickBrazo, readOnly = false }) {
  const idsEnCarrito = Array.isArray(selectedBrazoIds) ? selectedBrazoIds : [];
  const isSelected = (id) =>
    idsEnCarrito.includes(id) || selectedBrazo?.id === id;
  const formatQ = (n) =>
    new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n);
  const repertorio = repertorioTurnoLista(turno);
  const izquierda = Array.isArray(turno?.izquierda) ? turno.izquierda : [];
  const derecha = Array.isArray(turno?.derecha) ? turno.derecha : [];

  return (
    <article className="turno-cartulina">
      <header className="turno-cartulina__header">
        <div>
          <span className="turno-cartulina__num">Turno #{turno.numero_turno}</span>
          <span className="turno-cartulina__tipo">{turno.etiqueta || turno.tipo_turno}</span>
        </div>
        <div className="turno-cartulina__meta">
          <StatusBadge status={turno.tipo_turno} />
          <span className="turno-cartulina__precio">{formatQ(turno.precio)}</span>
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

      <div className="turno-cartulina__cuerpo">
        <div className="turno-columna turno-columna--izq">
          <span className="turno-columna__label">Izquierda</span>
          <div className="turno-columna__lista">
            {izquierda.map((b) => (
              <EspacioBrazo
                key={b.id}
                brazo={b}
                selected={isSelected(b.id)}
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
            {turno.derecha.map((b) => (
              <EspacioBrazo
                key={b.id}
                brazo={b}
                selected={isSelected(b.id)}
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
