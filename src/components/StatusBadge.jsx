import React from 'react';

const ESTADO_MAP = {
  disponible: { label: 'Disponible', className: 'badge--disponible' },
  reservado: { label: 'Reservado', className: 'badge--reservado' },
  vendido: { label: 'Vendido', className: 'badge--vendido' },
  pendiente_entrega: { label: 'Pendiente entrega', className: 'badge--reservado' },
  entregado: { label: 'Entregado', className: 'badge--activa' },
  activa: { label: 'Activa', className: 'badge--activa' },
  inactiva: { label: 'Inactiva', className: 'badge--cerrada' },
  cerrada: { label: 'Cerrada', className: 'badge--cerrada' },
  Ordinario: { label: 'Ordinario', className: 'badge--neutral' },
  Entrada: { label: 'Entrada', className: 'badge--info' },
  Salida: { label: 'Salida', className: 'badge--info' },
  Extraordinario: { label: 'Extraordinario', className: 'badge--premium' },
  Especial: { label: 'Especial', className: 'badge--info' },
  Honor: { label: 'Honor', className: 'badge--premium' },
  Destacado: { label: 'Destacado', className: 'badge--info' },
};

export default function StatusBadge({ status }) {
  const config = ESTADO_MAP[status] || { label: status, className: 'badge--neutral' };
  return <span className={`badge ${config.className}`}>{config.label}</span>;
}
