import React, { useState, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import BoletaCard from '../components/BoletaCard';
import QrScanner from '../components/QrScanner';
import StatusBadge from '../components/StatusBadge';
import EntregaEstadoMenu from '../components/EntregaEstadoMenu';
import { textoEstadoEntrega } from '../components/EntregaConfirmForm';
import { useAuth } from '../context/AuthContext';
import { buscarBoletaPorCodigo, revertirEntregaBrazo } from '../services/dataService';
import { extraerCodigoBoleta } from '../utils/boletaUtils';

/**
 * Corrección de estado de entrega (supervisor / coordinación).
 * No lista pendientes — solo busca por código y permite revertir entregas erróneas.
 */
export default function AjusteEntrega() {
  const { organizacionId, organizacion } = useAuth();
  const validacionRef = useRef(null);
  const [codigoManual, setCodigoManual] = useState('');
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [scannerOn, setScannerOn] = useState(true);
  const [revirtiendoId, setRevirtiendoId] = useState(null);

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

  const handleScan = useCallback((decoded) => {
    buscar(decoded);
    setScannerOn(false);
  }, [buscar]);

  const handleRevertirPendiente = async () => {
    const brazoId = resultado?.brazo?.id;
    if (!brazoId) return;

    setError('');
    setRevirtiendoId(brazoId);
    const res = await revertirEntregaBrazo(brazoId, organizacionId);
    setRevirtiendoId(null);

    if (res.error) {
      setError(res.error);
      return;
    }

    setOkMsg('Turno marcado como pendiente de entrega.');
    setResultado({ ...resultado, brazo: res.data });
  };

  const yaEntregado = resultado?.brazo?.estado_entrega === 'entregado';
  const estadoEntregaTxt = textoEstadoEntrega(resultado?.brazo);

  return (
    <Layout
      title="Ajuste de entregas"
      subtitle="Corrija entregas registradas por error (requiere permiso de supervisor)"
    >
      {okMsg && <div className="alert alert--success">{okMsg}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="entrega-layout entrega-layout--solo">
        <section className="panel panel--compact entrega-scan">
          <h3 className="panel__title panel__title--sm">Buscar turno</h3>
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
                {yaEntregado ? (
                  <StatusBadge status="entregado" />
                ) : (
                  <StatusBadge status="pendiente_entrega" />
                )}
                <span>{estadoEntregaTxt || 'Pendiente de entrega física'}</span>
              </div>

              <BoletaCard
                organizacion={organizacion}
                cortejo={resultado.cortejo}
                turno={resultado.turno}
                cargador={resultado.cargador}
                brazo={resultado.brazo}
                showEntrega
              />

              {yaEntregado ? (
                <EntregaEstadoMenu
                  brazo={resultado.brazo}
                  onRevertirPendiente={handleRevertirPendiente}
                  loading={revirtiendoId === resultado.brazo.id}
                  disabled={Boolean(revirtiendoId)}
                />
              ) : (
                <div className="info-box info-box--compact">
                  Este turno ya está <strong>pendiente de entrega</strong>. Use la pantalla{' '}
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
