import React, { useRef, useCallback } from 'react';

const MIN_W = 40;
const MIN_H = 24;

/**
 * Bloque arrastrable y redimensionable (esquina inferior derecha).
 */
export default function DraggableBlock({
  id,
  label,
  x,
  y,
  w,
  h,
  canvasW,
  canvasH,
  selected,
  onSelect,
  onChange,
  children,
  editMode = true,
}) {
  const dragRef = useRef(null);

  const clamp = useCallback(
    (nx, ny, nw, nh) => {
      const width = Math.max(MIN_W, Math.min(nw, canvasW - nx));
      const height = Math.max(MIN_H, Math.min(nh, canvasH - ny));
      const posX = Math.max(0, Math.min(nx, canvasW - width));
      const posY = Math.max(0, Math.min(ny, canvasH - height));
      return { x: posX, y: posY, w: width, h: height };
    },
    [canvasW, canvasH]
  );

  const startDrag = (e) => {
    if (!editMode || e.button !== 0) return;
    if (e.target.closest('.recibo-block__resize')) return;
    e.preventDefault();
    onSelect(id);
    const startX = e.clientX;
    const startY = e.clientY;
    const ox = x;
    const oy = y;

    const onMove = (ev) => {
      const nx = ox + (ev.clientX - startX);
      const ny = oy + (ev.clientY - startY);
      onChange(clamp(nx, ny, w, h));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startResize = (e) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(id);
    const startX = e.clientX;
    const startY = e.clientY;
    const ow = w;
    const oh = h;

    const onMove = (ev) => {
      const nw = ow + (ev.clientX - startX);
      const nh = oh + (ev.clientY - startY);
      onChange(clamp(x, y, nw, nh));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (!editMode) {
    return (
      <div
        className="recibo-block recibo-block--print"
        style={{ left: x, top: y, width: w, height: h }}
      >
        <div className="recibo-block__content">{children}</div>
      </div>
    );
  }

  return (
    <div
      ref={dragRef}
      role="button"
      tabIndex={0}
      className={`recibo-block ${selected ? 'recibo-block--selected' : ''}`}
      style={{ left: x, top: y, width: w, height: h }}
      onPointerDown={startDrag}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
    >
      <span className="recibo-block__label">{label}</span>
      <div className="recibo-block__content">{children}</div>
      <span
        className="recibo-block__resize"
        title="Arrastre para cambiar tamaño"
        onPointerDown={startResize}
      />
    </div>
  );
}
