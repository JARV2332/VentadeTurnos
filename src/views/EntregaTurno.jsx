import React, { useState, useCallback } from 'react';
import Layout from '../components/Layout';
import BoletaCard from '../components/BoletaCard';
import QrScanner from '../components/QrScanner';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import {
  buscarBoletaPorCodigo,
  marcarEntregado,
} from '../services/dataService';
import { extraerCodigoBoleta } from '../utils/boletaUtils';

export default function EntregaTurno() {
  const { organizacionId, organizacion, user } = useAuth();
  const [codigoManual, setCodigoManual] = useState('');
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [scannerOn, setScannerOn] = useState(true);

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
  }, [organizacionId]);

  const handleScan = useCallback((decoded) => {
    buscar(decoded);
    setScannerOn(false);
  }, [buscar]);

  const handleEntregar = async () => {
    if (!resultado?.brazo) return;
    setError('');
    const res = await marcarEntregado(resultado.brazo.id, organizacionId, user?.authUserId || user?.id);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOkMsg(`Turno entregado correctamente a ${resultado.cargador?.nombre_completo} (devoto(a)).`);
    setResultado({
      ...resultado,
      brazo: res.data,
    });
  };

  const yaEntregado = resultado?.brazo?.estado_entrega === 'entregado';

  return (
    <Layout
      title="Entrega de turnos"
      subtitle="Escanee el QR de la boleta para validar y entregar el turno físico"
    >
      {okMsg && <div className="alert alert--success">{okMsg}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="entrega-grid">
        <section className="panel">
          <h3 className="panel__title">Escanear QR</h3>
          {scannerOn ? (
            <QrScanner onScan={handleScan} active={scannerOn} />
          ) : (
            <div className="entrega-scanner-off">
              <p className="text-muted">Escaneo pausado tras lectura exitosa.</p>
              <button type="button" className="btn btn--ghost" onClick={() => setScannerOn(true)}>
                Activar cámara de nuevo
              </button>
            </div>
          )}

          <div className="entrega-manual">
            <label>
              O ingrese el código manualmente
              <input
                type="text"
                placeholder="VT-DEMO0001"
                value={codigoManual}
                onChange={(e) => setCodigoManual(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && buscar(codigoManual)}
              />
            </label>
            <button type="button" className="btn btn--primary" onClick={() => buscar(codigoManual)}>
              Validar boleta
            </button>
          </div>
        </section>

        <section className="panel">
          <h3 className="panel__title">Resultado de validación</h3>

          {!resultado ? (
            <p className="text-muted">
              Escanee o ingrese el código QR de la boleta para verificar que la compra es válida
              y proceder con la entrega del turno de cartulina.
            </p>
          ) : (
            <>
              <div className="entrega-status">
                {yaEntregado ? (
                  <StatusBadge status="entregado" />
                ) : (
                  <StatusBadge status="pendiente_entrega" />
                )}
                <span>
                  {yaEntregado
                    ? `Entregado el ${new Date(resultado.brazo.entregado_en).toLocaleString('es-GT')}`
                    : 'Pago confirmado — pendiente de entrega física'}
                </span>
              </div>

              <BoletaCard
                organizacion={organizacion}
                cortejo={resultado.cortejo}
                turno={resultado.turno}
                cargador={resultado.cargador}
                brazo={resultado.brazo}
                showEntrega
              />

              {!yaEntregado && (
                <button type="button" className="btn btn--primary btn--block entrega-btn" onClick={handleEntregar}>
                  Confirmar entrega del turno
                </button>
              )}

              {yaEntregado && (
                <div className="info-box">
                  Este turno ya fue entregado. No es necesario volver a procesarlo.
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </Layout>
  );
}
