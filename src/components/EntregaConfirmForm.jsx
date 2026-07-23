import React from 'react';
import { advertirTypoCorreo } from '../utils/emailValidation';

/**
 * Formulario compacto: entrega directa o a tercero + opción de correo al devoto.
 */
export default function EntregaConfirmForm({
  cargador,
  esTercero,
  onEsTerceroChange,
  receptorNombre,
  onReceptorNombreChange,
  enviarCorreo,
  onEnviarCorreoChange,
  onSubmit,
  loading,
  disabled,
}) {
  const tieneCorreo = Boolean(cargador?.correo?.trim());
  const avisoTypo = tieneCorreo ? advertirTypoCorreo(cargador.correo) : null;

  return (
    <form
      className="entrega-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <fieldset className="entrega-form__opciones" disabled={disabled || loading}>
        <legend className="entrega-form__legend">Datos de entrega</legend>

        <label className="entrega-form__check">
          <input
            type="checkbox"
            checked={esTercero}
            onChange={(e) => onEsTerceroChange(e.target.checked)}
          />
          <span>
            <strong>Entrega a un tercero</strong>
            <small>Persona distinta al devoto(a) titular recibe el turno</small>
          </span>
        </label>

        {esTercero && (
          <label className="entrega-form__field">
            Nombre de quien recibe
            <input
              type="text"
              value={receptorNombre}
              onChange={(e) => onReceptorNombreChange(e.target.value)}
              placeholder="Nombre completo del tercero"
              required
              autoComplete="name"
            />
          </label>
        )}

        <label className={`entrega-form__check ${!tieneCorreo ? 'entrega-form__check--disabled' : ''}`}>
          <input
            type="checkbox"
            checked={enviarCorreo && tieneCorreo}
            disabled={!tieneCorreo}
            onChange={(e) => onEnviarCorreoChange(e.target.checked)}
          />
          <span>
            <strong>Enviar correo al devoto(a)</strong>
            <small>
              {tieneCorreo
                ? `Confirmación a ${cargador.correo}`
                : 'Sin correo registrado — no se puede notificar'}
            </small>
          </span>
        </label>

        {avisoTypo && (
          <p className="entrega-form__warn" role="alert">
            {avisoTypo}
          </p>
        )}
      </fieldset>

      <button
        type="submit"
        className="btn btn--primary btn--block entrega-form__submit"
        disabled={disabled || loading || (esTercero && !receptorNombre.trim())}
      >
        {loading ? 'Confirmando…' : 'Confirmar entrega del turno'}
      </button>
    </form>
  );
}

/** Texto de estado tras entrega (directa o tercero). */
export function textoEstadoEntrega(brazo) {
  if (!brazo?.entregado_en) return null;
  const fecha = new Date(brazo.entregado_en).toLocaleString('es-GT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (brazo.entregado_a_tercero && brazo.entregado_receptor_nombre?.trim()) {
    return `Entregado a ${brazo.entregado_receptor_nombre.trim()} (tercero) — ${fecha}`;
  }
  return `Entregado personalmente — ${fecha}`;
}
