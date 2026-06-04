import React, { useState } from 'react';
import { CANVAS_RECIBO, ELEMENTOS_RECIBO, getDefaultLayout } from '../../constants/reciboLayout';
import DraggableBlock from './DraggableBlock';
import ReciboBlockContent, { elementoVisible } from './ReciboBlockContent';
import { formatPrecio } from '../../utils/boletaUtils';

/**
 * Lienzo editable: arrastrar bloques y redimensionar desde la esquina.
 */
export default function ReciboCanvasEditor({
  cfg,
  layout,
  onLayoutChange,
  organizacion,
  cortejo,
  turno,
  cargador,
  brazo,
}) {
  const [selectedId, setSelectedId] = useState('titulo');
  const formato = cfg.formato || 'termico_80';
  const canvas = layout?.canvas || CANVAS_RECIBO[formato];
  const elementos = layout?.elementos || getDefaultLayout(formato).elementos;

  const titulo =
    cfg.titulo_personalizado?.trim() ||
    (cfg.mostrar_nombre_org !== false ? organizacion?.nombre_oficial : '') ||
    'Boleta de turno';
  const codigo = brazo?.codigo_boleta_qr;
  const precio = formatPrecio(brazo?.precio_pagado ?? turno?.precio);

  const updateElement = (id, patch) => {
    onLayoutChange({
      ...layout,
      version: 1,
      canvas,
      elementos: {
        ...elementos,
        [id]: { ...elementos[id], ...patch },
      },
    });
  };

  const resetLayout = () => {
    if (!window.confirm('¿Restaurar posiciones y tamaños por defecto para este formato?')) return;
    onLayoutChange(getDefaultLayout(formato));
  };

  return (
    <div className="recibo-editor-wrap">
      <div className="recibo-editor-toolbar">
        <span className="text-muted recibo-editor-hint">
          Arrastre cada bloque · Redimensione desde la esquina ↘
        </span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={resetLayout}>
          Restaurar diseño
        </button>
      </div>

      <div
        className="recibo-canvas"
        style={{
          width: canvas.width,
          height: canvas.height,
          '--recibo-primary': cfg.color_primario || '#6366f1',
        }}
        onClick={() => setSelectedId(null)}
      >
        {ELEMENTOS_RECIBO.map(({ id, label }) => {
          const pos = elementos[id];
          if (!pos) return null;
          const visible = elementoVisible(id, cfg);
          const showInEditor = visible || id === 'logo' || id === 'pie' || id === 'qr';

          if (!showInEditor && id !== 'titulo') return null;

          return (
            <DraggableBlock
              key={id}
              id={id}
              label={label}
              x={pos.x}
              y={pos.y}
              w={pos.w}
              h={pos.h}
              canvasW={canvas.width}
              canvasH={canvas.height}
              selected={selectedId === id}
              onSelect={setSelectedId}
              onChange={(patch) => updateElement(id, patch)}
              editMode
            >
              <ReciboBlockContent
                elementId={id}
                cfg={cfg}
                titulo={titulo}
                organizacion={organizacion}
                cortejo={cortejo}
                turno={turno}
                cargador={cargador}
                brazo={brazo}
                codigo={codigo}
                precio={precio}
                boxW={pos.w}
                boxH={pos.h}
              />
            </DraggableBlock>
          );
        })}
      </div>
    </div>
  );
}
