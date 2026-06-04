import React from 'react';
import { ELEMENTOS_RECIBO } from '../../constants/reciboLayout';
import DraggableBlock from './DraggableBlock';
import ReciboBlockContent, { elementoVisible } from './ReciboBlockContent';

/** Recibo con posiciones guardadas (impresión / correo). */
export default function ReciboCanvasPrint({
  cfg,
  layout,
  organizacion,
  cortejo,
  turno,
  cargador,
  brazo,
  titulo,
  codigo,
  precio,
  showEntrega,
  className = '',
  compact = false,
}) {
  const canvas = layout?.canvas;
  const elementos = layout?.elementos;
  if (!canvas || !elementos) return null;

  const scale = compact ? 0.85 : 1;

  return (
    <article
      className={`boleta-recibo boleta-recibo--canvas boleta-recibo--${cfg.formato} ${className}`.trim()}
      style={{
        '--recibo-primary': cfg.color_primario || '#6366f1',
        width: canvas.width * scale,
        height: canvas.height * scale,
      }}
      data-formato={cfg.formato}
    >
      <div
        className="recibo-canvas recibo-canvas--print"
        style={{
          width: canvas.width,
          height: canvas.height,
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
        }}
      >
        {ELEMENTOS_RECIBO.map(({ id }) => {
          const pos = elementos[id];
          if (!pos) return null;
          if (id === 'qr' && !codigo) return null;
          if (id !== 'titulo' && id !== 'qr' && !elementoVisible(id, cfg)) return null;

          return (
            <DraggableBlock
              key={id}
              id={id}
              x={pos.x}
              y={pos.y}
              w={pos.w}
              h={pos.h}
              canvasW={canvas.width}
              canvasH={canvas.height}
              editMode={false}
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
                showEntrega={showEntrega}
                boxW={pos.w}
                boxH={pos.h}
              />
            </DraggableBlock>
          );
        })}
      </div>
    </article>
  );
}
