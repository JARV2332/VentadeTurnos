import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import {
  getCortejosByOrg,
  getResumenApartados,
  aplicarImportApartados,
  subscribeData,
} from '../services/dataService';
import {
  PLANTILLA_LISTADO_COLUMNAS,
  PLANTILLA_COLUMNAS,
  parseArchivoImport,
  descargarPlantillaListado,
  descargarPlantillaCoordenadas,
  resumenFilasImport,
} from '../utils/importReservasUtils';

export default function ConfigImportReservas() {
  const { organizacionId, user } = useAuth();
  const [cortejoId, setCortejoId] = useState('');
  const [cortejos, setCortejos] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [preview, setPreview] = useState([]);
  const [formatoImport, setFormatoImport] = useState(null);
  const [resultadoImport, setResultadoImport] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [procesando, setProcesando] = useState(false);

  const refresh = useCallback(async () => {
    if (!organizacionId) return;
    const lista = await getCortejosByOrg(organizacionId);
    setCortejos(lista);
    setCortejoId((prev) => {
      if (prev && lista.some((c) => c.id === prev)) return prev;
      return lista[0]?.id || '';
    });
  }, [organizacionId]);

  useEffect(() => {
    refresh();
    return subscribeData(organizacionId, refresh);
  }, [refresh, organizacionId]);

  useEffect(() => {
    if (!cortejoId || !organizacionId) return;
    getResumenApartados(cortejoId, organizacionId).then((data) =>
      setResumen(Array.isArray(data) ? data : [])
    );
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
        setFormatoImport(null);
        return;
      }
      if (parsed.filas.length === 0) {
        setError('No se encontraron filas de datos en el archivo.');
        setPreview([]);
        setFormatoImport(null);
        return;
      }
      setPreview(parsed.filas);
      setFormatoImport(parsed.formato);
      const stats = resumenFilasImport(parsed.filas, parsed.formato);
      setOkMsg(
        parsed.formato === 'listado'
          ? `${stats.personas} persona(s) · ${stats.espacios} espacio(s) a apartar. Revise y confirme.`
          : `${parsed.filas.length} fila(s) leídas. Revise la vista previa y confirme.`
      );
      setTimeout(() => setOkMsg(''), 6000);
    } catch (err) {
      setError(err.message || 'Error al leer el archivo');
    } finally {
      setProcesando(false);
    }
  };

  const handleAplicar = async () => {
    if (!cortejoId) {
      setError('Seleccione una procesión.');
      return;
    }
    if (preview.length === 0) {
      setError('Suba un archivo primero.');
      return;
    }
    setError('');
    setProcesando(true);
    try {
      const res = await aplicarImportApartados(cortejoId, organizacionId, preview, {
        usuarioId: user?.id,
      });
      setResultadoImport(res);
      setOkMsg(
        `Importación lista: ${res.ok} espacio(s) apartado(s), ${res.omitidos} omitido(s).`
      );
      setPreview([]);
      setFormatoImport(null);
      setResumen(await getResumenApartados(cortejoId, organizacionId));
      setTimeout(() => setOkMsg(''), 6000);
    } catch (err) {
      setError(err.message || 'Error al aplicar apartados');
    } finally {
      setProcesando(false);
    }
  };

  const totalApartados = (resumen || []).reduce((s, r) => s + (r.apartados || 0), 0);
  const statsPreview = resumenFilasImport(preview, formatoImport);

  return (
    <Layout
      title="Apartados por Excel"
      subtitle="Listado de devotos con turno apartado — se muestran en Taquilla con su nombre"
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
          <button type="button" className="btn btn--ghost" onClick={descargarPlantillaListado}>
            Plantilla Excel
          </button>
          <button type="button" className="btn btn--ghost" onClick={descargarPlantillaCoordenadas}>
            Plantilla por brazo (legacy)
          </button>
          <label className="btn btn--primary import-upload-btn">
            {procesando ? 'Leyendo…' : 'Subir Excel / CSV'}
            <input
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              onChange={handleArchivo}
              disabled={procesando}
            />
          </label>
        </div>
      </div>

      <section className="panel">
        <h3 className="panel__title">Formato del listado (recomendado)</h3>
        <p className="text-muted config-hint">
          Una fila por devoto(a). El <strong>DPI es opcional</strong> — si aún no lo tienen, déjelo
          vacío; el apartado se hace con apellido y nombre. Si traen DPI válido (13 dígitos), se
          registra o actualiza al devoto. Los espacios se asignan solos al turno indicado.
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
              {PLANTILLA_LISTADO_COLUMNAS.map((col) => (
                <tr key={col.key}>
                  <td>{col.label}</td>
                  <td>{col.obligatorio ? 'Sí' : 'No'}</td>
                  <td className="text-muted">{col.ejemplo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted config-hint">
          <strong>Turno</strong> puede ser número (<code>7</code>), texto (<code>Turno 7</code>) o
          nombre del turno (<code>Honor Salida</code>).
        </p>
      </section>

      <section className="panel">
        <h3 className="panel__title">Formato por coordenada (opcional)</h3>
        <p className="text-muted config-hint">
          Si necesita apartar un brazo exacto: Turno + Brazo + Lado.
        </p>
        <div className="table-wrap">
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Columna</th>
                <th>Obligatoria</th>
              </tr>
            </thead>
            <tbody>
              {PLANTILLA_COLUMNAS.filter((c) => c.obligatorio).map((col) => (
                <tr key={col.key}>
                  <td>{col.label}</td>
                  <td>Sí</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {preview.length > 0 && (
        <section className="panel">
          <div className="panel__head-row">
            <h3 className="panel__title">
              Vista previa
              {formatoImport === 'listado'
                ? ` — ${statsPreview.personas} persona(s) · ${statsPreview.espacios} espacio(s)`
                : ` (${preview.length} filas)`}
            </h3>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleAplicar}
              disabled={procesando}
            >
              {procesando ? 'Aplicando…' : 'Aplicar apartados a la procesión'}
            </button>
          </div>
          <div className="table-wrap import-preview-table">
            {formatoImport === 'listado' ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>DPI</th>
                    <th>Apellido</th>
                    <th>Nombre</th>
                    <th>Cantidad</th>
                    <th>Turno</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((f, i) => (
                    <tr key={`${f.filaExcel}-${i}`}>
                      <td>{f.filaExcel}</td>
                      <td>{f.dpi || <em className="text-muted">sin DPI</em>}</td>
                      <td>{f.apellido}</td>
                      <td>{f.nombre}</td>
                      <td>{f.cantidad}</td>
                      <td>{f.turno}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Turno</th>
                    <th>Brazo</th>
                    <th>Lado</th>
                    <th>Asignado</th>
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
                      <td>{f.nombre_completo || f.nombre || <em className="text-muted">—</em>}</td>
                      <td>{f.notas || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {resultadoImport && (
        <section className="panel">
          <h3 className="panel__title">Resultado de la importación</h3>
          <p>
            <strong>{resultadoImport.ok}</strong> espacios apartados ·{' '}
            <strong>{resultadoImport.omitidos}</strong> omitidos
          </p>
          <div className="import-resultados">
            {(resultadoImport.resultados || []).map((r) => (
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
          Los espacios importados aparecen en <strong>amarillo (apartado)</strong> en Taquilla con el
          nombre del devoto(a). Puede completar la venta desde taquilla al hacer clic.
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
                    {item.apartados} apartados · {item.vendidos} vendidos · {item.libres} libres
                  </span>
                </div>
                {(item.detalle || []).length === 0 ? (
                  <p className="text-muted resumen-apartados__vacio">Sin apartados en este turno</p>
                ) : (
                  <ul className="resumen-apartados__lista">
                    {(item.detalle || []).map((d) => (
                      <li key={d.brazo.id}>
                        Brazo {d.brazo.numero_brazo} {d.brazo.lado}:{' '}
                        <strong>{d.etiqueta}</strong>
                        {d.cargador?.cui_o_identificacion && (
                          <span className="text-muted">
                            {' '}
                            — DPI {d.cargador.cui_o_identificacion}
                          </span>
                        )}
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
