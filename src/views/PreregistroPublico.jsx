import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppFooter from '../components/AppFooter';
import PhoneInput502 from '../components/PhoneInput502';
import { isValidCui, normalizarCui } from '../utils/cuiUtils';
import { isValidGtWhatsapp } from '../utils/phoneGtUtils';

const EMPTY = {
  nombre_completo: '',
  cui_o_identificacion: '',
  whatsapp: '',
  correo: '',
  telefono_emergencia: '',
  website: '',
};

export default function PreregistroPublico() {
  const { orgSlug } = useParams();
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [yaRegistrado, setYaRegistrado] = useState(false);
  const [orgInfo, setOrgInfo] = useState(null);
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!orgSlug) {
      setCargando(false);
      setError('Enlace incompleto. Solicite el enlace correcto a su organización.');
      return undefined;
    }

    let cancel = false;
    (async () => {
      try {
        const res = await fetch(`/api/public-preregistro?org=${encodeURIComponent(orgSlug)}`);
        const json = await res.json().catch(() => ({}));
        if (cancel) return;
        if (!res.ok) {
          setError(json.error || 'Organización no encontrada');
          setOrgInfo(null);
          return;
        }
        setOrgInfo(json.organizacion || null);
        setConfig(json.config || null);
        if (json.config && json.config.activo === false) {
          setError('El preregistro no está disponible en este momento.');
        }
      } catch {
        if (!cancel) setError('No se pudo cargar la página');
      } finally {
        if (!cancel) setCargando(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [orgSlug]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const enviar = useCallback(
    async (e) => {
      e?.preventDefault();
      setError('');
      setExito('');
      setYaRegistrado(false);

      if (config?.activo === false) {
        setError('El preregistro no está disponible en este momento.');
        return;
      }

      const nombre = form.nombre_completo.trim();
      const cui = normalizarCui(form.cui_o_identificacion);
      const correo = form.correo.trim().toLowerCase();

      if (nombre.length < 3) {
        setError('Ingrese su nombre completo.');
        return;
      }
      if (!isValidCui(cui)) {
        setError('Ingrese un DPI/CUI válido (13 dígitos).');
        return;
      }
      if (!isValidGtWhatsapp(form.whatsapp)) {
        setError('WhatsApp inválido (+502 y 8 dígitos).');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        setError('Ingrese un correo electrónico válido.');
        return;
      }

      setEnviando(true);
      try {
        const res = await fetch('/api/public-preregistro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org: orgSlug,
            nombre_completo: nombre,
            cui_o_identificacion: cui,
            whatsapp: form.whatsapp,
            correo,
            telefono_emergencia: form.telefono_emergencia,
            website: form.website,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 409 && (json.ya_registrado || json.codigo === 'DPI_YA_REGISTRADO')) {
          setYaRegistrado(true);
          setExito(
            json.error ||
              'Este DPI ya está preregistrado. En taquilla indiquen su DPI para continuar.'
          );
          setForm(EMPTY);
          return;
        }
        if (res.status === 429) {
          setError(json.error || 'Hay mucha demanda. Espere un minuto e intente de nuevo.');
          return;
        }
        if (!res.ok) {
          setError(json.error || 'No se pudo completar el preregistro.');
          return;
        }
        setYaRegistrado(false);
        setExito(json.mensaje || 'Preregistro guardado.');
        setForm(EMPTY);
      } catch {
        setError('No se pudo completar el preregistro. Intente más tarde.');
      } finally {
        setEnviando(false);
      }
    },
    [config?.activo, form, orgSlug]
  );

  const nombreOrg = orgInfo?.nombre_oficial || 'Su organización';
  const color = config?.color_primario || '#1d4ed8';
  const formDeshabilitado = cargando || config?.activo === false || Boolean(exito);

  return (
    <div className="boleta-publica preregistro-publico">
      <header className="boleta-publica__head">
        <div className="boleta-publica__brand" style={{ ['--preregistro-accent']: color }}>
          {config?.logo_url ? (
            <img
              src={config.logo_url}
              alt=""
              className="preregistro-publico__logo"
            />
          ) : null}
          <p className="boleta-publica__hint">{nombreOrg}</p>
          <h1 className="mis-turnos-publico__titulo">{config?.titulo || 'Preregistro'}</h1>
        </div>
      </header>

      <main className="boleta-publica__main mis-turnos-publico__main">
        {cargando && <p className="text-muted">Cargando…</p>}

        {!cargando && error && !orgInfo && (
          <div className="alert alert--error boleta-publica__alert">{error}</div>
        )}

        {!cargando && orgInfo && (
          <section className="mis-turnos-publico__formulario preregistro-publico__card">
            {config?.mensaje && (
              <p className="mis-turnos-publico__intro">{config.mensaje}</p>
            )}

            {exito ? (
              <div className={`alert ${yaRegistrado ? 'alert--info' : 'alert--success'}`}>
                <p>{exito}</p>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setExito('');
                    setError('');
                    setYaRegistrado(false);
                  }}
                >
                  Registrar otra persona
                </button>
              </div>
            ) : (
              <form className="preregistro-publico__form" onSubmit={enviar}>
                {error && <div className="alert alert--error">{error}</div>}

                <label>
                  Nombre completo
                  <input
                    type="text"
                    value={form.nombre_completo}
                    onChange={(e) => setField('nombre_completo', e.target.value)}
                    autoComplete="name"
                    required
                    disabled={formDeshabilitado}
                    placeholder="Como aparece en el DPI"
                  />
                </label>

                <label>
                  DPI / CUI
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.cui_o_identificacion}
                    onChange={(e) => setField('cui_o_identificacion', normalizarCui(e.target.value))}
                    autoComplete="off"
                    required
                    maxLength={13}
                    disabled={formDeshabilitado}
                    placeholder="13 dígitos"
                  />
                </label>

                <PhoneInput502
                  label="WhatsApp"
                  value={form.whatsapp}
                  onChange={(v) => setField('whatsapp', v)}
                  required
                />

                <label>
                  Correo electrónico
                  <input
                    type="email"
                    value={form.correo}
                    onChange={(e) => setField('correo', e.target.value)}
                    autoComplete="email"
                    required
                    disabled={formDeshabilitado}
                    placeholder="para enviar boletas"
                  />
                </label>

                <PhoneInput502
                  label="Teléfono de emergencia (opcional)"
                  value={form.telefono_emergencia}
                  onChange={(v) => setField('telefono_emergencia', v)}
                />

                {/* honeypot */}
                <label className="preregistro-publico__hp" aria-hidden="true">
                  Sitio web
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.website}
                    onChange={(e) => setField('website', e.target.value)}
                  />
                </label>

                <button
                  type="submit"
                  className="btn btn--primary btn--block"
                  disabled={enviando || formDeshabilitado}
                >
                  {enviando ? 'Enviando…' : 'Enviar preregistro'}
                </button>
              </form>
            )}

            <p className="mis-turnos-publico__share text-muted">
              ¿Ya compró turnos?{' '}
              <Link to={`/mis-turnos/${orgSlug}`}>Consulte sus boletas con DPI</Link>
            </p>
          </section>
        )}
      </main>

      <AppFooter />
    </div>
  );
}
