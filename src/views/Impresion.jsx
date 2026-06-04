import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import BoletaCard from '../components/BoletaCard';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import {
  getBrazosByOrg,
  getCortejosByOrg,
  getCargadorById,
  getTurnoById,
  subscribeData,
} from '../services/dataService';

export default function Impresion() {
  const { organizacion, organizacionId, hasPermiso } = useAuth();
  const [ventas, setVentas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detalle, setDetalle] = useState({ cargador: null, turno: null, cortejo: null });

  useEffect(() => {
    const refresh = async () => {
      const vendidos = (await getBrazosByOrg(organizacionId)).filter((b) => b.estado === 'vendido');
      setVentas(vendidos);
      setSelected((prev) => prev || vendidos[0] || null);
    };
    refresh();
    return subscribeData(organizacionId, refresh);
  }, [organizacionId]);

  useEffect(() => {
    (async () => {
      if (!selected) {
        setDetalle({ cargador: null, turno: null, cortejo: null });
        return;
      }
      const cargador = await getCargadorById(selected.cargador_id);
      const turno = await getTurnoById(selected.turno_id);
      const cortejos = await getCortejosByOrg(organizacionId);
      const cortejo = cortejos.find((c) => c.id === turno?.cortejo_id) || null;
      setDetalle({ cargador, turno, cortejo });
    })();
  }, [selected, organizacionId]);

  if (!selected) {
    return (
      <Layout title="Impresión de boletas" subtitle="Boleta con QR para validación y entrega">
        <p className="text-muted">No hay ventas confirmadas para imprimir.</p>
      </Layout>
    );
  }

  const { cargador, turno, cortejo } = detalle;

  const handlePrint = () => window.print();

  return (
    <Layout title="Impresión de boletas" subtitle="Imprima la boleta con QR — también se envía por correo">
      <div className="impresion-controls no-print">
        <label>
          Seleccionar boleta
          <select
            value={selected.id}
            onChange={(e) => setSelected(ventas.find((v) => v.id === e.target.value))}
          >
            {ventas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.codigo_boleta_qr} — Turno {v.numero_turno} Brazo {v.numero_brazo}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--primary" onClick={handlePrint}>
          Imprimir boleta
        </button>
        {(hasPermiso('config_recibo') || hasPermiso('config_correo')) && (
          <Link to="/config/recibo" className="btn btn--ghost">
            Diseño del recibo
          </Link>
        )}
      </div>

      <div className="impresion-boleta print-area">
        <BoletaCard
          organizacion={organizacion}
          cargador={cargador}
          brazo={selected}
          turno={turno}
          cortejo={cortejo}
        />
        <p className="text-muted impresion-hint no-print">
          Estado entrega: <StatusBadge status={selected.estado_entrega} />
        </p>
      </div>

      <p className="impresion-print-tip no-print">
        Al imprimir o guardar PDF: desactive <strong>Encabezados y pies de página</strong>, active{' '}
        <strong>Gráficos en segundo plano</strong> y elija <strong>Guardar como PDF</strong>.
      </p>
    </Layout>
  );
}
