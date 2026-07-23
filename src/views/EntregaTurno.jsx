import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Layout from '../components/Layout';
import BoletaCard from '../components/BoletaCard';
import BoletaContraseñaTurno from '../components/BoletaContraseñaTurno';
import QrScanner from '../components/QrScanner';
import StatusBadge from '../components/StatusBadge';
import EntregaConfirmForm, { textoEstadoEntrega } from '../components/EntregaConfirmForm';
import { useAuth } from '../context/AuthContext';
import {
  buscarBoletaPorCodigo,
  getCargadorById,
  marcarEntregado,
} from '../services/dataService';
import { confirmarEntregaServidor } from '../services/entregaApi';
import { enviarCorreoEntregaConfirmada } from '../services/emailService';
import { extraerCodigoBoleta } from '../utils/boletaUtils';
import {
  itemsDesdeResultado,
  brazosPendientesEntrega,
  resumenEntregaItems,
} from '../utils/entregaItemsUtils';
import { codigoReciboDisplay } from '../utils/compraUtils';

export default function EntregaTurno() {
  const { organizacionId, organizacion, user } = useAuth();
  const validacionRef = useRef(null);
  const [codigoManual, setCodigoManual] = useState('');
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [avisoCorreoMsg, setAvisoCorreoMsg] = useState('');
  const [scannerOn, setScannerOn] = useState(true);
  const [entregando, setEntregando] = useState(false);

  const [esTercero, setEsTercero] = useState(false);
  const [receptorNombre, setReceptorNombre] = useState('');
  const [enviarCorreo, setEnviarCorreo] = useState(true);

  const items = useMemo(() => itemsDesdeResultado(resultado), [resultado]);
  const resumen = useMemo(() => resumenEntregaItems(items), [items]);
  const pendientes = useMemo(() => brazosPendientesEntrega(items), [items]);
  const esMulti = items.length > 1;
  const codigoRecibo = useMemo(
    () => (resultado ? codigoReciboDisplay(resultado.compra, items.map((i) => i.brazo)) : ''),
    [resultado, items]
  );

  useEffect(() => {
    setEsTercero(false);
    setReceptorNombre('');
    setEnviarCorreo(Boolean(resultado?.cargador?.correo?.trim()));
  }, [resultado?.brazo?.id, resultado?.cargador?.correo, resultado?.compra?.id]);

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

  const actualizarResultadoConBrazos = (brazosActualizados) => {
    const map = Object.fromEntries(brazosActualizados.map((b) => [b.id, b]));
    const itemsNuevos = items.map((item) => ({
      ...item,
      brazo: map[item.brazo.id] || item.brazo,
    }));
    setResultado({
      ...resultado,
      items: itemsNuevos,
      brazos: itemsNuevos.map((i) => i.brazo),
      brazo: itemsNuevos[0]?.brazo || resultado.brazo,
    });
  };

  const handleEntregar = async () => {
    if (!pendientes.length) return;
    if (esTercero && !receptorNombre.trim()) {
      setError('Indique el nombre de quien recibe el turno (tercero).');
      return;
    }

    setError('');
    setOkMsg('');
    setAvisoCorreoMsg('');
    setEntregando(true);

    const brazoIds = pendientes.map((i) => i.brazo.id);
    const opts = {
      entregado_a_tercero: esTercero,
      entregado_receptor_nombre: esTercero ? receptorNombre.trim() : null,
    };
    const quiereCorreo = enviarCorreo && Boolean(resultado?.cargador?.correo?.trim());

    const resApi = await confirmarEntregaServidor({
      organizacionId,
      brazoIds,
      entregado_a_tercero: esTercero,
      entregado_receptor_nombre: opts.entregado_receptor_nombre,
      enviarCorreo: quiereCorreo,
    });

    let brazosActualizados = [];
    let correoResult = null;

    if (resApi.error && resApi.error.includes('API de entrega no configurada')) {
      for (const id of brazoIds) {
        const res = await marcarEntregado(id, organizacionId, user?.authUserId || user?.id, opts);
        if (res.error) {
          setEntregando(false);
          setError(
            brazosActualizados.length
              ? `${res.error} (${brazosActualizados.length} de ${brazoIds.length} ya entregados)`
              : res.error
          );
          if (brazosActualizados.length) actualizarResultadoConBrazos(brazosActualizados);
          return;
        }
        brazosActualizados.push(res.data);
      }
      if (quiereCorreo && brazosActualizados[0]) {
        let cargador = resultado?.cargador;
        const b0 = brazosActualizados[0];
        if (!cargador?.correo?.trim() && b0?.cargador_id) {
          cargador = (await getCargadorById(b0.cargador_id)) || cargador;
        }
        correoResult = await enviarCorreoEntregaConfirmada({
          organizacionId,
          organizacion,
          cargador,
          brazo: b0,
          turno: pendientes[0]?.turno || resultado?.turno,
          cortejo: resultado?.cortejo,
          entregado_a_tercero: esTercero,
          entregado_receptor_nombre: opts.entregado_receptor_nombre,
          entregado_en: b0?.entregado_en,
          forzarEnvio: true,
        });
      }
    } else if (resApi.error) {
      setEntregando(false);
      if (resApi.brazos?.length) actualizarResultadoConBrazos(resApi.brazos);
      setError(resApi.error);
      return;
    } else {
      brazosActualizados = resApi.brazos || [];
      correoResult = resApi.correo;
    }

    if (quiereCorreo && correoResult) {
      if (correoResult.ok) {
        let msg = `Correo de confirmación enviado a ${correoResult.destinatario}.`;
        if (correoResult.advertencia) msg += ` ${correoResult.advertencia}`;
        setAvisoCorreoMsg(msg);
      } else if (correoResult.omitido) {
        setAvisoCorreoMsg(correoResult.motivo || 'Correo omitido.');
      } else {
        let msg = correoResult.error || 'No se pudo enviar el correo de confirmación.';
        if (correoResult.advertencia) msg += ` ${correoResult.advertencia}`;
        setAvisoCorreoMsg(msg);
      }
    } else if (quiereCorreo && !correoResult) {
      setAvisoCorreoMsg('No se envió correo: el devoto(a) no tiene email registrado.');
    }

    setEntregando(false);
    actualizarResultadoConBrazos(brazosActualizados);

    const nombre = resultado?.cargador?.nombre_completo || 'devoto(a)';
    const n = brazosActualizados.length;
    const turnoLabel = n === 1 ? 'Turno entregado' : `${n} turnos entregados`;

    if (esTercero) {
      setOkMsg(`${turnoLabel} a ${receptorNombre.trim()} (tercero), titular ${nombre}.`);
    } else {
      setOkMsg(`${turnoLabel} a ${nombre}.`);
    }
  };

  const estadoEntregaTxt = esMulti
    ? resumen.todosEntregados
      ? `Recibo ${codigoRecibo} — todos entregados`
      : resumen.entregados > 0
        ? `${resumen.entregados} de ${resumen.total} entregados — ${resumen.pendientes} pendiente(s)`
        : `${resumen.total} turno(s) en recibo ${codigoRecibo} — pendientes de entrega`
    : textoEstadoEntrega(resultado?.brazo) || 'Pago confirmado — pendiente de entrega física';

  return (
    <Layout
      title="Entrega de turnos"
      subtitle="Escanee el QR o ingrese el código para validar y entregar"
    >
      {okMsg && <div className="alert alert--success">{okMsg}</div>}
      {avisoCorreoMsg && (
        <div
          className={`alert ${avisoCorreoMsg.includes('enviado a') && !avisoCorreoMsg.includes('parece') && !avisoCorreoMsg.includes('error') ? 'alert--success' : 'alert--warning'}`}
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
              placeholder="Código VR-… o VT-…"
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
                {resumen.todosEntregados ? (
                  <StatusBadge status="entregado" />
                ) : (
                  <StatusBadge status="pendiente_entrega" />
                )}
                <span>{estadoEntregaTxt}</span>
              </div>

              {esMulti ? (
                <div className="entrega-recibo-multi">
                  <BoletaContraseñaTurno
                    organizacion={organizacion}
                    cortejo={resultado.cortejo}
                    turno={items[0]?.turno}
                    brazo={items[0]?.brazo}
                    items={items}
                    compra={resultado.compra}
                    cargador={resultado.cargador}
                  />
                  <p className="entrega-recibo-multi__estados">
                    {items.length} turno(s) ·{' '}
                    {items.map((item) => (
                      <StatusBadge
                        key={item.brazo.id}
                        status={
                          item.brazo.estado_entrega === 'entregado'
                            ? 'entregado'
                            : 'pendiente_entrega'
                        }
                      />
                    ))}
                  </p>
                </div>
              ) : (
                <BoletaCard
                  organizacion={organizacion}
                  cortejo={resultado.cortejo}
                  turno={resultado.turno}
                  cargador={resultado.cargador}
                  brazo={resultado.brazo}
                  showEntrega
                />
              )}

              {resumen.hayPendientes ? (
                <EntregaConfirmForm
                  cargador={resultado.cargador}
                  esTercero={esTercero}
                  onEsTerceroChange={setEsTercero}
                  receptorNombre={receptorNombre}
                  onReceptorNombreChange={setReceptorNombre}
                  enviarCorreo={enviarCorreo}
                  onEnviarCorreoChange={setEnviarCorreo}
                  onSubmit={handleEntregar}
                  loading={entregando}
                  disabled={entregando}
                  cantidadTurnos={pendientes.length}
                />
              ) : (
                <div className="info-box info-box--compact">
                  {esMulti
                    ? 'Todos los turnos de este recibo ya fueron entregados. Si hubo un error, un supervisor puede corregirlo en '
                    : 'Turno ya entregado. Si fue un error, un supervisor puede corregirlo en '}
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
