import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import {
  getCortejosByOrg,
  getResumenApartados,
  aplicarImportApartadosMock,
  subscribeMock,
} from '../services/mockService';
import {
  PLANTILLA_COLUMNAS,
  parseArchivoImport,
  descargarPlantilla,
  descargarPlantillaExcel,
} from '../utils/importReservasUtils';

export default function ConfigImportReservas() {
  const { organizacionId, user } = useAuth();
  const [cortejoId, setCortejoId] = useState('');
  const [cortejos, setCortejos] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [preview, setPreview] = useState([]);
  const [resultadoImport, setResultadoImport] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [procesando, setProcesando] = useState(false);

  const refresh = useCallback(() => {
    if (!organizacionId) return;
    const lista = getCortejosByOrg(organizacionId);
    setCortejos(lista);
    setCortejoId((prev) => {
      if (prev && lista.some((c) => c.id === prev)) return prev;
      return lista[0]?.id || '';
    });
  }, [organizacionId]);

  useEffect(() => {
    refresh();
    return subscribeMock(refresh);
  }, [refresh]);

  useEffect(() => {
    if (cortejoId && organizacionId) {
      setResumen(getResumenApartados(cortejoId, organizacionId));
    }
  }, [cortejoId, organizacionId]);

  const handleArchivo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setResultadoImport(null);
    setProcesando(true);
    try {
      const parsed = await parseArchivoImport(file);
      if (parsed.error) {
        setError(parsed.error);
        setPreview([]);
        return;
      }
      if (parsed.filas.length === 0) {
        setError('No se encontraron filas de datos en el archivo.');
        setPreview([]);
        return;
      }
      setPreview(parsed.filas);
      setOkMsg(`${parsed.filas.length} fila(s) leídas. Revise la vista previa y confirme.`);
      setTimeout(() => setOkMsg(''), 5000);
    } catch (err) {
      setError(err.message || 'Error al leer el archivo');
    } finally {
      setProcesando(false);
    }
  };

  const handleAplicar = () => {
    if (!cortejoId) {
      setError('Seleccione una procesión.');
      return;
    }
    if (preview.length === 0) {
      setError('Suba un archivo primero.');
      return;
    }
    setError('');
    const res = aplicarImportApartadosMock(cortejoId, organizacionId, preview, {
      usuarioId: user?.id,
    });
    setResultadoImport(res);
    setOkMsg(
      `Importación lista: ${res.ok} apartado(s), ${res.omitidos} omitido(s) de ${res.total}.`
    );
    setPreview([]);
    setResumen(getResumenApartados(cortejoId, organizacionId));
    setTimeout(() => setOkMsg(''), 6000);
  };

  const totalApartados = resumen.reduce((s, r) => s + r.apartados, 0);

  return (
    <Layout
      title="Apartados por Excel"
      subtitle="Marque brazos reservados y asigne persona (datos opcionales, como en taquilla)"
    >
      {okMsg && <div className="alert alert--success">{okMsg}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="import-toolbar panel">
        <label>
          Procesión
          <select value={cortejoId} onChange={(e) => setCortejoId(e.target.value)}>
            {cortejos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre_evento}
              </option>
            ))}
          </select>
        </label>
        <div className="import-toolbar__actions">
          <button type="button" className="btn btn--ghost" onClick={descargarPlantilla}>
            Plantilla CSV
          </button>
          <button type="button" className="btn btn--ghost" onClick={descargarPlantillaExcel}>
            Plantilla Excel
          </button>
          <label className="btn btn--primary import-upload-btn">
            {procesando ? 'Leyendo…' : 'Subir Excel o CSV'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleArchivo}
              disabled={procesando}
            />
          </label>
        </div>
      </div>

      <section className="panel">
        <h3 className="panel__title">Columnas de la plantilla</h3>
        <p className="text-muted config-hint">
          Obligatorias: <strong>Turno</strong>, <strong>Brazo</strong>, <strong>Lado</strong>{' '}
          (Izquierda o Derecha). El resto puede ir vacío si solo desea apartar el espacio.
        </p>
        <div className="table-wrap">
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Columna</th>
                <th>Obligatoria</th>
                <th>Ejemplo</th>
              </tr>
            </thead>
            <tbody>
              {PLANTILLA_COLUMNAS.map((col) => (
                <tr key={col.key}>
                  <td>{col.label}</td>
                  <td>{col.obligatorio ? 'Sí' : 'No'}</td>
                  <td className="text-muted">{col.ejemplo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {preview.length > 0 && (
        <section className="panel">
          <div className="panel__head-row">
            <h3 className="panel__title">Vista previa ({preview.length} filas)</h3>
            <button type="button" className="btn btn--primary" onClick={handleAplicar}>
              Aplicar apartados a la procesión
            </button>
          </div>
          <div className="table-wrap import-preview-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Turno</th>
                  <th>Brazo</th>
                  <th>Lado</th>
                  <th>Asignado</th>
                  <th>WhatsApp</th>
                  <th>Correo</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((f, i) => (
                  <tr key={`${f.filaExcel}-${i}`}>
                    <td>{f.filaExcel}</td>
                    <td>{f.turno}</td>
                    <td>{f.brazo}</td>
                    <td>{f.lado}</td>
                    <td>{f.nombre || <em className="text-muted">—</em>}</td>
                    <td>{f.whatsapp || '—'}</td>
                    <td>{f.correo || '—'}</td>
                    <td>{f.notas || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {resultadoImport && (
        <section className="panel">
          <h3 className="panel__title">Resultado de la importación</h3>
          <p>
            <strong>{resultadoImport.ok}</strong> aplicados ·{' '}
            <strong>{resultadoImport.omitidos}</strong> omitidos
          </p>
          <div className="import-resultados">
            {resultadoImport.resultados.map((r) => (
              <div
                key={`${r.fila}-${r.mensaje}`}
                className={`import-resultado ${r.ok ? 'import-resultado--ok' : 'import-resultado--err'}`}
              >
                Fila {r.fila}: {r.mensaje}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <h3 className="panel__title">
          Apartados actuales por turno ({totalApartados} espacios)
        </h3>
        <p className="text-muted config-hint">
          Los espacios importados aparecen en <strong>amarillo (reservado)</strong> en Taquilla.
          Puede completar la venta desde taquilla con los datos del cargador.
        </p>
        {resumen.length === 0 ? (
          <p className="text-muted">Seleccione una procesión.</p>
        ) : (
          <div className="resumen-apartados">
            {resumen.map((item) => (
              <div key={item.turno.id} className="resumen-apartados__turno">
                <div className="resumen-apartados__head">
                  <strong>
                    Turno #{item.turno.numero_turno} —{' '}
                    {item.turno.etiqueta || item.turno.tipo_turno}
                  </strong>
                  <span className="text-muted">
                    {item.apartados} apartados · {item.vendidos} vendidos · {item.libres}{' '}
                    libres
                  </span>
                </div>
                {item.detalle.length === 0 ? (
                  <p className="text-muted resumen-apartados__vacio">Sin apartados en este turno</p>
                ) : (
                  <ul className="resumen-apartados__lista">
                    {item.detalle.map((d) => (
                      <li key={d.brazo.id}>
                        Brazo {d.brazo.numero_brazo} {d.brazo.lado}:{' '}
                        <strong>{d.etiqueta}</strong>
                        {d.brazo.apartado_notas && (
                          <span className="text-muted"> — {d.brazo.apartado_notas}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}
