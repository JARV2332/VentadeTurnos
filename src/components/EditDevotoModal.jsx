import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import PhoneInput502 from './PhoneInput502';
import { normalizarCui, isValidCui, CUI_DIGITS } from '../utils/cuiUtils';
import { TERMINO_DEVOTO } from '../constants/terminologia';

function devotoToForm(devoto) {
  return {
    nombre_completo: devoto?.nombre_completo || '',
    cui_o_identificacion: normalizarCui(devoto?.cui_o_identificacion || ''),
    whatsapp: devoto?.whatsapp || '',
    correo: devoto?.correo || '',
    telefono_emergencia: devoto?.telefono_emergencia || '',
  };
}

export default function EditDevotoModal({
  abierto,
  devoto,
  guardando,
  errorGuardar,
  onGuardar,
  onCerrar,
}) {
  const esEdicion = Boolean(devoto?.id);
  const visible = abierto ?? Boolean(devoto);
  const [form, setForm] = useState(devotoToForm(null));
  const [errorLocal, setErrorLocal] = useState('');

  useEffect(() => {
    if (visible) {
      setForm(devotoToForm(devoto));
      setErrorLocal('');
    }
  }, [visible, devoto]);

  useEffect(() => {
    if (!visible || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (!visible || typeof document === 'undefined') return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorLocal('');
    if (!form.nombre_completo?.trim()) {
      setErrorLocal('Ingrese el nombre.');
      return;
    }
    if (!isValidCui(form.cui_o_identificacion)) {
      setErrorLocal('Ingrese un CUI válido (13 dígitos).');
      return;
    }
    onGuardar(form);
  };

  return createPortal(
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !guardando) onCerrar();
      }}
    >
      <div
        className="modal-edit-turno modal-edit-turno--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-devoto-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-devoto-titulo" className="modal-edit-turno__titulo">
          {esEdicion
            ? `Editar datos del ${TERMINO_DEVOTO.toLowerCase()}`
            : `Nuevo ${TERMINO_DEVOTO.toLowerCase()}`}
        </h2>
        <p className="text-muted config-hint">
          {esEdicion
            ? 'Los cambios se reflejan en boletas, correos y entrega. No modifica ventas ya anuladas. Teléfono y correo pueden repetirse entre devotos; el CUI es único.'
            : 'Registre los datos del devoto(a). El CUI es único; teléfono y correo pueden repetirse entre personas distintas.'}
        </p>

        {(errorLocal || errorGuardar) && (
          <div className="alert alert--error">{errorLocal || errorGuardar}</div>
        )}

        <form className="config-form modal-edit-turno__form" onSubmit={handleSubmit}>
          <label>
            Nombre completo
            <input
              type="text"
              value={form.nombre_completo}
              onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })}
              required
              autoFocus
            />
          </label>

          <label>
            CUI / DPI
            <input
              type="text"
              inputMode="numeric"
              maxLength={CUI_DIGITS}
              value={form.cui_o_identificacion}
              onChange={(e) =>
                setForm({ ...form, cui_o_identificacion: normalizarCui(e.target.value) })
              }
              required
            />
          </label>

          <PhoneInput502
            label="WhatsApp"
            value={form.whatsapp}
            onChange={(val) => setForm({ ...form, whatsapp: val })}
            required
            hint="Solo los 8 números; el +502 ya está incluido"
          />

          <label>
            Correo electrónico
            <input
              type="email"
              placeholder="devoto@correo.com"
              value={form.correo}
              onChange={(e) => setForm({ ...form, correo: e.target.value })}
            />
          </label>

          <PhoneInput502
            label="Teléfono emergencia (opcional)"
            value={form.telefono_emergencia}
            onChange={(val) => setForm({ ...form, telefono_emergencia: val })}
            hint="Opcional"
          />

          <div className="modal-edit-turno__actions">
            <button type="button" className="btn btn--ghost" disabled={guardando} onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={guardando}>
              {guardando
                ? 'Guardando…'
                : esEdicion
                  ? 'Guardar cambios'
                  : 'Registrar devoto(a)'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
