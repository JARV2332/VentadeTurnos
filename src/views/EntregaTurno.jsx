import React, { useState, useCallback, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import BoletaCard from '../components/BoletaCard';
import QrScanner from '../components/QrScanner';
import StatusBadge from '../components/StatusBadge';
import EntregaConfirmForm, { textoEstadoEntrega } from '../components/EntregaConfirmForm';
import { useAuth } from '../context/AuthContext';
import {
  buscarBoletaPorCodigo,
  marcarEntregado,
  getCargadorById,
} from '../services/dataService';
import { enviarCorreoEntregaConfirmada } from '../services/emailService';
import { extraerCodigoBoleta } from '../utils/boletaUtils';

export default function EntregaTurno() {
  const { organizacionId, organizacion, user } = useAuth();
  const validacionRef = useRef(null);
  const [codigoManual, setCodigoManual] = useState('');
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [avisoCorreoMsg, setAvisoCorreoMsg] = useState('');
  const [scannerOn, setScannerOn] = useState(true);
  const [entregandoId, setEntregandoId] = useState(null);

  const [esTercero, setEsTercero] = useState(false);
  const [receptorNombre, setReceptorNombre] = useState('');
  const [enviarCorreo, setEnviarCorreo] = useState(true);

  useEffect(() => {
    setEsTercero(false);
    setReceptorNombre('');
    setEnviarCorreo(Boolean(resultado?.cargador?.correo?.trim()));
  }, [resultado?.brazo?.id, resultado?.cargador?.correo]);

  const scrollAValidacion = () => {
    requestAnimationFrame(() => {
      validacionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const buscar = useCallback(async (texto) => {
    setError('');
    setOkMsg('');
    setAvisoCorreoMsg('');
    const codigo = extraerCodigoBoleta(texto);
    if (!codigo) {
      setError('Código QR no válido.');
      setResultado(null);
      return;
    }

    const res = await buscarBoletaPorCodigo(organizacionId, codigo);
    if (res.error) {
      setError(res.error);
      setResultado(null);
      return;
    }
    setResultado(res);
    setCodigoManual(codigo);
    scrollAValidacion();
  }, [organizacionId]);

  const handleScan = useCallback((decoded) => {
    buscar(decoded);
    setScannerOn(false);
  }, [buscar]);

  const handleEntregar = async () => {
    const brazoId = resultado?.brazo?.id;
    if (!brazoId) return;
    if (esTercero && !receptorNombre.trim()) {
      setError('Indique el nombre de quien recibe el turno (tercero).');
      return;
    }

    setError('');
    setOkMsg('');
    setAvisoCorreoMsg('');
    setEntregandoId(brazoId);

    const opts = {
      entregado_a_tercero: esTercero,
      entregado_receptor_nombre: esTercero ? receptorNombre.trim() : null,
    };

    const res = await marcarEntregado(brazoId, organizacionId, user?.authUserId || user?.id, opts);
    if (res.error) {
      setEntregandoId(null);
      setError(res.error);
      return;
    }

    const brazoActualizado = res.data;
    let cargador = resultado?.cargador;
    if (!cargador?.correo?.trim() && brazoActualizado?.cargador_id) {
      cargador = (await getCargadorById(brazoActualizado.cargador_id)) || cargador;
    }

    if (enviarCorreo) {
      if (!cargador?.correo?.trim()) {
        setAvisoCorreoMsg('No se envió correo: el devoto(a) no tiene email registrado.');
      } else {
        const mail = await enviarCorreoEntregaConfirmada({
          organizacionId,
          organizacion,
          cargador,
          brazo: brazoActualizado,
          turno: resultado?.turno,
          cortejo: resultado?.cortejo,
          entregado_a_tercero: esTercero,
          entregado_receptor_nombre: opts.entregado_receptor_nombre,
          entregado_en: brazoActualizado?.entregado_en,
          forzarEnvio: true,
        });
        if (mail.ok) {
          setAvisoCorreoMsg(`Correo de confirmación enviado a ${mail.destinatario}.`);
        } else if (mail.omitido) {
          setAvisoCorreoMsg(mail.motivo || 'Correo omitido por configuración.');
        } else {
          setAvisoCorreoMsg(mail.error || 'No se pudo enviar el correo de confirmación.');
        }
      }
    }

    setEntregandoId(null);

    const nombre = cargador?.nombre_completo || 'devoto(a)';
    if (esTercero) {
      setOkMsg(
        `Turno entregado a ${receptorNombre.trim()} (tercero), titular ${nombre}.`
      );
    } else {
      setOkMsg(`Turno entregado a ${nombre}.`);
    }

    setResultado({
      ...resultado,
      brazo: brazoActualizado,
    });
  };

  const yaEntregado = resultado?.brazo?.estado_entrega === 'entregado';
  const estadoEntregaTxt = textoEstadoEntrega(resultado?.brazo);

  return (
    <Layout
      title="Entrega de turnos"
      subtitle="Escanee el QR o ingrese el código para validar y entregar"
    >
      {okMsg && <div className="alert alert--success">{okMsg}</div>}
      {avisoCorreoMsg && (
        <div
          className={`alert ${avisoCorreoMsg.includes('enviado a') ? 'alert--success' : 'alert--warning'}`}
        >
          {avisoCorreoMsg}
        </div>
      )}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="entrega-layout entrega-layout--solo">
        <section className="panel panel--compact entrega-scan">
          <h3 className="panel__title panel__title--sm">Escanear o validar</h3>
          {scannerOn ? (
            <QrScanner onScan={handleScan} active={scannerOn} />
          ) : (
            <div className="entrega-scanner-off">
              <p className="text-muted">Escaneo pausado.</p>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setScannerOn(true)}>
                Activar cámara
              </button>
            </div>
          )}

          <div className="entrega-manual entrega-manual--inline">
            <input
              type="text"
              placeholder="Código VT-… o VR-…"
              value={codigoManual}
              onChange={(e) => setCodigoManual(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && buscar(codigoManual)}
              aria-label="Código de boleta"
            />
            <button type="button" className="btn btn--primary btn--sm" onClick={() => buscar(codigoManual)}>
              Validar
            </button>
          </div>
        </section>

        <section className="panel panel--compact" ref={validacionRef}>
          <h3 className="panel__title panel__title--sm">Validación y entrega</h3>

          {!resultado ? (
            <p className="text-muted entrega-empty">
              Escanee el QR de la boleta o ingrese el código manualmente para confirmar la entrega.
            </p>
          ) : (
            <>
              <div className="entrega-status entrega-status--compact">
                {yaEntregado ? (
                  <StatusBadge status="entregado" />
                ) : (
                  <StatusBadge status="pendiente_entrega" />
                )}
                <span>{estadoEntregaTxt || 'Pago confirmado — pendiente de entrega física'}</span>
              </div>

              <BoletaCard
                organizacion={organizacion}
                cortejo={resultado.cortejo}
                turno={resultado.turno}
                cargador={resultado.cargador}
                brazo={resultado.brazo}
                showEntrega
              />

              {!yaEntregado ? (
                <EntregaConfirmForm
                  cargador={resultado.cargador}
                  esTercero={esTercero}
                  onEsTerceroChange={setEsTercero}
                  receptorNombre={receptorNombre}
                  onReceptorNombreChange={setReceptorNombre}
                  enviarCorreo={enviarCorreo}
                  onEnviarCorreoChange={setEnviarCorreo}
                  onSubmit={handleEntregar}
                  loading={entregandoId === resultado.brazo.id}
                  disabled={Boolean(entregandoId)}
                />
              ) : (
                <div className="info-box info-box--compact">
                  Turno ya entregado. Si fue un error, un supervisor puede corregirlo en{' '}
                  <strong>Ajuste de entregas</strong>.
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </Layout>
  );
}
