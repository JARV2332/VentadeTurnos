import React, { useState, useCallback, useRef, useMemo } from 'react';
import Layout from '../components/Layout';
import BoletaCard from '../components/BoletaCard';
import BoletaContraseñaTurno from '../components/BoletaContraseñaTurno';
import QrScanner from '../components/QrScanner';
import StatusBadge from '../components/StatusBadge';
import EntregaEstadoMenu from '../components/EntregaEstadoMenu';
import { textoEstadoEntrega } from '../components/EntregaConfirmForm';
import { useAuth } from '../context/AuthContext';
import { buscarBoletaPorCodigo, revertirEntregaBrazos } from '../services/dataService';
import { extraerCodigoBoleta } from '../utils/boletaUtils';
import {
  itemsDesdeResultado,
  resumenEntregaItems,
  brazosEntregadosEnItems,
} from '../utils/entregaItemsUtils';
import { codigoReciboDisplay } from '../utils/compraUtils';
import { invalidateBoletaCachePorBrazos } from '../utils/boletaLookupCache';

/**
 * Corrección de estado de entrega (supervisor / coordinación).
 * Soporta recibos multi-turno (VR-): revierte todos los turnos entregados del recibo.
 */
export default function AjusteEntrega() {
  const { organizacionId, organizacion } = useAuth();
  const validacionRef = useRef(null);
  const [codigoManual, setCodigoManual] = useState('');
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [scannerOn, setScannerOn] = useState(true);
  const [revirtiendo, setRevirtiendo] = useState(false);

  const items = useMemo(() => itemsDesdeResultado(resultado), [resultado]);
  const resumen = useMemo(() => resumenEntregaItems(items), [items]);
  const entregados = useMemo(() => brazosEntregadosEnItems(items), [items]);
  const esMulti = items.length > 1;
  const codigoRecibo = useMemo(
    () => (resultado ? codigoReciboDisplay(resultado.compra, items.map((i) => i.brazo)) : ''),
    [resultado, items]
  );

  const buscar = useCallback(async (texto) => {
    setError('');
    setOkMsg('');
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
    requestAnimationFrame(() => {
      validacionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [organizacionId]);

  const handleScan = useCallback(
    (decoded) => {
      buscar(decoded);
    },
    [buscar]
  );

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

  const handleRevertirPendiente = async () => {
    const ids = entregados.map((i) => i.brazo.id);
    if (!ids.length) return;

    setError('');
    setRevirtiendo(true);
    const res = await revertirEntregaBrazos(ids, organizacionId);
    setRevirtiendo(false);

    if (res.error) {
      if (res.brazos?.length) actualizarResultadoConBrazos(res.brazos);
      setError(res.error);
      return;
    }

    const brazosActualizados = res.brazos || (Array.isArray(res.data) ? res.data : [res.data]);
    actualizarResultadoConBrazos(brazosActualizados);
    invalidateBoletaCachePorBrazos(organizacionId, items.map((i) => i.brazo), resultado?.compra);

    const n = brazosActualizados.length;
    setOkMsg(
      n === 1
        ? 'Turno marcado como pendiente de entrega.'
        : `${n} turnos del recibo marcados como pendientes de entrega.`
    );
  };

  const hayEntregados = entregados.length > 0;
  const estadoEntregaTxt = esMulti
    ? resumen.todosEntregados
      ? `Recibo ${codigoRecibo} — todos entregados (${resumen.total} turno(s))`
      : resumen.entregados > 0
        ? `${resumen.entregados} de ${resumen.total} entregados — ${resumen.pendientes} pendiente(s)`
        : `${resumen.total} turno(s) en recibo ${codigoRecibo} — pendientes de entrega`
    : textoEstadoEntrega(resultado?.brazo) || 'Pendiente de entrega física';

  return (
    <Layout
      title="Ajuste de entregas"
      subtitle="Corrija entregas registradas por error (requiere permiso de supervisor)"
    >
      {okMsg && <div className="alert alert--success">{okMsg}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="entrega-layout entrega-layout--solo">
        <section className="panel panel--compact entrega-scan">
          <h3 className="panel__title panel__title--sm">Buscar boleta</h3>
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
              Buscar
            </button>
          </div>
        </section>

        <section className="panel panel--compact" ref={validacionRef}>
          <h3 className="panel__title panel__title--sm">Estado y corrección</h3>

          {!resultado ? (
            <p className="text-muted entrega-empty">
              Busque la boleta para ver su estado y, si fue entregada por error, volverla a{' '}
              <strong>pendiente de entrega</strong>.
            </p>
          ) : (
            <>
              <div className="entrega-status entrega-status--compact">
                {resumen.todosEntregados ? (
                  <StatusBadge status="entregado" />
                ) : resumen.entregados > 0 ? (
                  <StatusBadge status="pendiente_entrega" />
                ) : (
                  <StatusBadge status="pendiente_entrega" />
                )}
                <span>{estadoEntregaTxt}</span>
              </div>

              {esMulti ? (
                <div className="entrega-recibo-multi">
                  <div className="entrega-recibo-multi__viewport">
                    <BoletaContraseñaTurno
                      organizacion={organizacion}
                      cortejo={resultado.cortejo}
                      turno={items[0]?.turno}
                      brazo={items[0]?.brazo}
                      items={items}
                      compra={resultado.compra}
                      cargador={resultado.cargador}
                    />
                  </div>
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

              {hayEntregados ? (
                <EntregaEstadoMenu
                  brazo={entregados[0]?.brazo || resultado.brazo}
                  cantidadARevertir={entregados.length}
                  totalRecibo={resumen.total}
                  esReciboMulti={esMulti}
                  onRevertirPendiente={handleRevertirPendiente}
                  loading={revirtiendo}
                  disabled={revirtiendo}
                />
              ) : (
                <div className="info-box info-box--compact">
                  {esMulti
                    ? `Los ${resumen.total} turnos de este recibo están pendientes de entrega. Use `
                    : 'Este turno ya está '}
                  <strong>Entrega turnos</strong> para confirmar la entrega al devoto.
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </Layout>
  );
}
