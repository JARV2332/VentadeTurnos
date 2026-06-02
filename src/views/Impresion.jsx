import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import BoletaCard from '../components/BoletaCard';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import {
  getBrazosByOrg,
  getCortejosByOrg,
  getStore,
  subscribeMock,
} from '../services/mockService';

export default function Impresion() {
  const { organizacion, organizacionId } = useAuth();
  const [ventas, setVentas] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const refresh = () => {
      const vendidos = getBrazosByOrg(organizacionId).filter((b) => b.estado === 'vendido');
      setVentas(vendidos);
      setSelected((prev) => prev || vendidos[0] || null);
    };
    refresh();
    return subscribeMock(refresh);
  }, [organizacionId]);

  if (!selected) {
    return (
      <Layout title="Impresión de boletas" subtitle="Boleta con QR para validación y entrega">
        <p className="text-muted">No hay ventas confirmadas para imprimir.</p>
      </Layout>
    );
  }

  const cargador = getStore().cargadores.find((c) => c.id === selected.cargador_id);
  const turno = getStore().turnos.find((t) => t.id === selected.turno_id);
  const cortejo = getCortejosByOrg(organizacionId).find((c) => c.id === turno?.cortejo_id);

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
                Turno #{v.numero_turno} · {v.codigo_boleta_qr}
                {v.estado_entrega === 'entregado' ? ' (entregado)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--primary" onClick={handlePrint}>
          Imprimir boleta
        </button>
      </div>

      <div className="print-area">
        {selected.estado_entrega === 'entregado' && (
          <div className="no-print" style={{ marginBottom: '1rem' }}>
            <StatusBadge status="entregado" />
          </div>
        )}
        <BoletaCard
          organizacion={organizacion}
          cortejo={cortejo}
          turno={turno}
          cargador={cargador}
          brazo={selected}
          showEntrega
        />
      </div>
    </Layout>
  );
}
