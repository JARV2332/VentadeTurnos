import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import {
  getCortejosByOrg,
  getResumenApartados,
  getTurnosAgrupados,
  aplicarImportApartados,
  quitarApartados,
  subscribeData,
} from '../services/dataService';
import ManualApartadoForm from '../components/ManualApartadoForm';
import {
  filasGeneralesApartados,
  listaTurnosConApartados,
  todosBrazoIdsApartados,
} from '../utils/apartadosDisplayUtils';
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
  const [turnos, setTurnos] = useState([]);
  const [preview, setPreview] = useState([]);
  const [formatoImport, setFormatoImport] = useState(null);
  const [advertenciasImport, setAdvertenciasImport] = useState([]);
  const [filasOmitidas, setFilasOmitidas] = useState([]);
  const [resultadoImport, setResultadoImport] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [aplicacionOk, setAplicacionOk] = useState(null);
  const [quitandoId, setQuitandoId] = useState(null);
  const [busquedaApartados, setBusquedaApartados] = useState('');
  const [seleccionLiberar, setSeleccionLiberar] = useState('');
  const [cantidadesLiberar, setCantidadesLiberar] = useState({});

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
    getTurnosAgrupados(cortejoId, organizacionId).then((data) =>
      setTurnos(Array.isArray(data) ? data : [])
    );
  }, [cortejoId, organizacionId]);

  const refreshResumen = async () => {
    if (!cortejoId || !organizacionId) return;
    const [data, turnosData] = await Promise.all([
      getResumenApartados(cortejoId, organizacionId),
      getTurnosAgrupados(cortejoId, organizacionId),
    ]);
    setResumen(Array.isArray(data) ? data : []);
    setTurnos(Array.isArray(turnosData) ? turnosData : []);
  };

  const handleQuitarApartados = async ({ brazoIds, turnoId, confirmMsg, accionId }) => {
    if (!cortejoId || !organizacionId) return;
    if (!window.confirm(confirmMsg)) return;

    setError('');
    setOkMsg('');
    setQuitandoId(accionId);
    try {
      const res = await quitarApartados(organizacionId, cortejoId, { brazoIds, turnoId });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOkMsg(res.mensaje || `${res.ok} apartado(s) liberado(s).`);
      await refreshResumen();
    } catch (err) {
      setError(err.message || 'No se pudo quitar el apartado');
    } finally {
      setQuitandoId(null);
    }
  };

  const handleQuitarBrazo = (d, item) => {
    handleQuitarApartados({
      brazoIds: [d.brazo.id],
      confirmMsg: `¿Quitar apartado del brazo ${d.brazo.numero_brazo} ${d.brazo.lado} (turno #${item.turno.numero_turno}, ${d.etiqueta})? El espacio quedará disponible en Taquilla.`,
      accionId: d.brazo.id,
    });
  };

  const handleQuitarFila = (f) => {
    handleQuitarParcial(f, f.cantidad);
  };

  const claveFilaApartado = (f) => `${f.turnoId}-${f.nombre}-${f.dpi}`;

  const cantidadParaFila = (f) => {
    const key = claveFilaApartado(f);
    const raw = cantidadesLiberar[key];
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) return 1;
    return Math.min(n, f.cantidad);
  };

  const setCantidadParaFila = (f, valor) => {
    const key = claveFilaApartado(f);
    const n = Math.max(1, Math.min(Number(valor) || 1, f.cantidad));
    setCantidadesLiberar((prev) => ({ ...prev, [key]: n }));
  };

  const handleQuitarParcial = (f, cantidad) => {
    const n = Math.min(Math.max(1, Number(cantidad) || 1), f.cantidad);
    const brazosOrdenados = [...f.brazos].sort(
      (a, b) => a.numero - b.numero || a.lado.localeCompare(b.lado, 'es')
    );
    const ids = brazosOrdenados.slice(0, n).map((b) => b.id);
    const brazosTxt = brazosOrdenados
      .slice(0, n)
      .map((b) => `${b.numero} ${b.lado[0]}`)
      .join(', ');

    handleQuitarApartados({
      brazoIds: ids,
      confirmMsg:
        n >= f.cantidad
          ? `¿Liberar ${n} espacio(s) de ${f.nombre} en turno #${f.turnoNum}? Quedarán disponibles en Taquilla.`
          : `¿Liberar ${n} de ${f.cantidad} espacio(s) de ${f.nombre} en turno #${f.turnoNum} (${brazosTxt})? El resto sigue apartado.`,
      accionId: `parcial-${f.turnoId}-${f.nombre}-${f.dpi}-${n}`,
    });
  };

  const handleQuitarTurno = (item) => {
    handleQuitarApartados({
      turnoId: item.turno.id,
      confirmMsg: `¿Liberar todas las reservas del turno #${item.turno.numero_turno} — ${item.turno.etiqueta || item.turno.tipo_turno} (${item.apartados} espacio(s))? Quedarán disponibles en Taquilla. No afecta ventas pagadas.`,
      accionId: `turno-${item.turno.id}`,
    });
  };

  const handleQuitarTodos = () => {
    const brazoIds = todosBrazoIdsApartados(resumen);
    if (!brazoIds.length) return;
    handleQuitarApartados({
      brazoIds,
      confirmMsg: `¿Liberar TODAS las ${brazoIds.length} reserva(s) de esta procesión? Los espacios quedarán disponibles en Taquilla. No se tocan turnos ya vendidos.`,
      accionId: 'todos-apartados',
    });
  };

  const handleArchivo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setResultadoImport(null);
    setAplicacionOk(null);
    setAdvertenciasImport([]);
    setFilasOmitidas([]);
    setLeyendo(true);
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
      setAdvertenciasImport(parsed.advertencias || []);
      setFilasOmitidas(parsed.errores || []);
      const stats = resumenFilasImport(parsed.filas, parsed.formato);
      const omitMsg =
        (parsed.errores?.length || 0) > 0
          ? ` ${parsed.errores.length} fila(s) omitida(s) por datos incompletos.`
          : '';
      const advMsg =
        (parsed.advertencias?.length || 0) > 0
          ? ` ${parsed.advertencias.length} aviso(s) (DPI/cantidad ajustados).`
          : '';
      setOkMsg(
        parsed.formato === 'listado'
          ? `Archivo leído: ${stats.personas} persona(s) · ${stats.espacios} espacio(s) en vista previa.${omitMsg}${advMsg} Revise abajo y pulse «Aplicar apartados» — todavía NO se guarda en Taquilla.`
          : `${parsed.filas.length} fila(s) leídas.${omitMsg} Revise y pulse «Aplicar apartados».`
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message || 'Error al leer el archivo');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLeyendo(false);
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
    setOkMsg('');
    setAplicacionOk(null);
    setAplicando(true);
    try {
      const res = await aplicarImportApartados(cortejoId, organizacionId, preview, {
        usuarioId: user?.id,
      });
      setResultadoImport(res);
      setAplicacionOk({
        apartados: res.ok,
        omitidos: res.omitidos,
        total: res.total,
      });
      setOkMsg('');
      setPreview([]);
      setFormatoImport(null);
      setAdvertenciasImport([]);
      setFilasOmitidas([]);
      setResumen(await getResumenApartados(cortejoId, organizacionId));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message || 'Error al aplicar apartados');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setAplicando(false);
    }
  };

  const totalApartados = (resumen || []).reduce((s, r) => s + (r.apartados || 0), 0);
  const statsPreview = resumenFilasImport(preview, formatoImport);
  const filasGenerales = filasGeneralesApartados(resumen);
  const turnosApartados = useMemo(() => listaTurnosConApartados(resumen), [resumen]);

  const turnoSeleccionado = useMemo(
    () => turnosApartados.find((t) => t.turnoId === seleccionLiberar) || null,
    [turnosApartados, seleccionLiberar]
  );

  useEffect(() => {
    if (!turnosApartados.length) {
      setSeleccionLiberar('');
      return;
    }
    const valido = turnosApartados.some((t) => t.turnoId === seleccionLiberar);
    if (!valido && seleccionLiberar !== '__todos__') {
      setSeleccionLiberar(turnosApartados[0].turnoId);
    }
  }, [turnosApartados, seleccionLiberar]);

  const handleLiberarSeleccion = () => {
    if (seleccionLiberar === '__todos__') {
      handleQuitarTodos();
      return;
    }
    if (turnoSeleccionado?.resumenItem) {
      handleQuitarTurno(turnoSeleccionado.resumenItem);
    }
  };

  const filasGeneralesFiltradas = useMemo(() => {
    const q = busquedaApartados.trim().toLowerCase();
    if (!q) return filasGenerales;
    const qDigits = q.replace(/\D/g, '');
    return filasGenerales.filter((f) => {
      const nombre = (f.nombre || '').toLowerCase();
      const dpi = String(f.dpi || '').replace(/\D/g, '');
      const turno = String(f.turnoNum);
      const honor = (f.turnoEtiqueta || '').toLowerCase();
      return (
        nombre.includes(q) ||
        honor.includes(q) ||
        turno.includes(q) ||
        (qDigits.length >= 3 && dpi.includes(qDigits))
      );
    });
  }, [filasGenerales, busquedaApartados]);

  return (
    <Layout
      title="Apartados"
      subtitle="Manual o Excel — turno y devoto(a) visibles en Taquilla"
    >
      {aplicacionOk && (
        <div className="alert alert--success">
          <strong>¡Apartados aplicados correctamente!</strong>
          <br />
          Se marcaron <strong>{aplicacionOk.apartados}</strong> espacio(s) en la procesión
          {aplicacionOk.omitidos > 0 && (
            <> · <strong>{aplicacionOk.omitidos}</strong> omitido(s)</>
          )}
          . Ya puede verlos en Taquilla (amarillo/ámbar con el nombre del devoto).
          <Link to="/taquilla" className="alert__link"> Ir a Taquilla →</Link>
        </div>
      )}
      {okMsg && !aplicacionOk && (
        <div className="alert alert--info">{okMsg}</div>
      )}
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
            {leyendo ? 'Leyendo archivo…' : 'Subir Excel / CSV'}
            <input
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              onChange={handleArchivo}
              disabled={leyendo || aplicando}
            />
          </label>
        </div>
      </div>

      <ManualApartadoForm
        cortejoId={cortejoId}
        organizacionId={organizacionId}
        user={user}
        turnos={turnos}
        onAplicado={refreshResumen}
      />

      <section className="panel">
        <h3 className="panel__title">Importar desde Excel (opcional)</h3>
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
              disabled={leyendo || aplicando}
            >
              {aplicando ? 'Aplicando apartados…' : 'Aplicar apartados a la procesión'}
            </button>
          </div>
          {aplicando && (
            <p className="text-muted config-hint import-aplicando-hint">
              Guardando apartados en la procesión… con muchas filas puede tardar un minuto. No cierre
              esta página hasta ver el mensaje verde de confirmación arriba.
            </p>
          )}
          {(advertenciasImport.length > 0 || filasOmitidas.length > 0) && (
            <div className="import-avisos">
              {filasOmitidas.length > 0 && (
                <details className="import-avisos__block">
                  <summary>{filasOmitidas.length} fila(s) omitida(s) del Excel</summary>
                  <ul>
                    {filasOmitidas.map((msg) => (
                      <li key={msg}>{msg}</li>
                    ))}
                  </ul>
                </details>
              )}
              {advertenciasImport.length > 0 && (
                <details className="import-avisos__block" open>
                  <summary>{advertenciasImport.length} aviso(s) — filas importadas con ajustes</summary>
                  <ul>
                    {advertenciasImport.slice(0, 30).map((msg) => (
                      <li key={msg}>{msg}</li>
                    ))}
                    {advertenciasImport.length > 30 && (
                      <li className="text-muted">… y {advertenciasImport.length - 30} más</li>
                    )}
                  </ul>
                </details>
              )}
            </div>
          )}
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

      {totalApartados > 0 && (
        <section className="panel apartados-liberar-select">
          <h3 className="panel__title">Liberar reservas por turno</h3>
          <p className="text-muted config-hint">
            Elija un turno y libere todos sus espacios reservados sin pago: apartados (Excel/manual)
            y reservas de Taquilla que quedaron colgadas. Los vendidos no aparecen aquí.
          </p>
          <div className="apartados-liberar-select__fila">
            <label className="apartados-liberar-select__label">
              Turno a liberar
              <select
                value={seleccionLiberar}
                onChange={(e) => setSeleccionLiberar(e.target.value)}
                disabled={Boolean(quitandoId)}
              >
                {turnosApartados.map((t) => (
                  <option key={t.turnoId} value={t.turnoId}>
                    Turno #{t.numero} · {t.honor} — {t.reservadosLabel}
                  </option>
                ))}
                <option value="__todos__">
                  Liberar TODAS las reservas ({totalApartados})
                </option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn--danger"
              disabled={Boolean(quitandoId) || !seleccionLiberar}
              onClick={handleLiberarSeleccion}
            >
              {quitandoId
                ? 'Liberando…'
                : seleccionLiberar === '__todos__'
                  ? 'Liberar todos'
                  : 'Liberar turno seleccionado'}
            </button>
          </div>
          {turnoSeleccionado && seleccionLiberar !== '__todos__' && (
            <p className="text-muted apartados-liberar-select__preview">
              {turnoSeleccionado.tipoLabel} · {turnoSeleccionado.apartados} espacio(s)
              {turnoSeleccionado.nombresPreview
                ? ` · ${turnoSeleccionado.nombresPreview}`
                : ''}
            </p>
          )}
        </section>
      )}

      <section className="panel">
        <h3 className="panel__title">
          Listado por devoto(a) ({totalApartados} espacio(s))
        </h3>
        <p className="text-muted config-hint">
          Opcional: busque por nombre o DPI y libere por persona (1, N o todos sus espacios en ese
          turno).
        </p>

        <div className="apartados-busqueda">
          <label>
            Buscar por nombre, DPI o turno
            <input
              type="search"
              value={busquedaApartados}
              onChange={(e) => setBusquedaApartados(e.target.value)}
              placeholder="Ej. García, 1234567890123, turno 7"
            />
          </label>
          {busquedaApartados.trim() && (
            <span className="text-muted apartados-busqueda__meta">
              {filasGeneralesFiltradas.length} resultado(s)
            </span>
          )}
        </div>

        {filasGenerales.length === 0 ? (
          <p className="text-muted">No hay apartados registrados en esta procesión.</p>
        ) : filasGeneralesFiltradas.length === 0 ? (
          <p className="text-muted">Ningún apartado coincide con la búsqueda.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table data-table--compact apartados-general-table">
              <thead>
                <tr>
                  <th>Turno</th>
                  <th>Honor / tipo</th>
                  <th>Devoto(a)</th>
                  <th>DPI</th>
                  <th>Cant.</th>
                  <th>Brazos</th>
                  <th>Liberar</th>
                </tr>
              </thead>
              <tbody>
                {filasGeneralesFiltradas.map((f) => {
                  const filaKey = claveFilaApartado(f);
                  const cantSel = cantidadParaFila(f);
                  const liberando = quitandoId?.startsWith(`parcial-${filaKey}-`);

                  return (
                  <tr key={`${filaKey}-${f.brazos.map((b) => b.id).join('-')}`}>
                    <td>
                      <strong>#{f.turnoNum}</strong>
                    </td>
                    <td>{f.turnoEtiqueta}</td>
                    <td>
                      <strong>{f.nombre}</strong>
                    </td>
                    <td>{f.dpi || <em className="text-muted">sin DPI</em>}</td>
                    <td>{f.cantidad}</td>
                    <td className="text-muted">
                      {f.brazos.map((b) => `${b.numero} ${b.lado[0]}`).join(', ')}
                    </td>
                    <td>
                      <div className="apartados-liberar-acciones">
                        {f.cantidad > 1 && (
                          <label className="apartados-liberar-cant">
                            Cant.
                            <input
                              type="number"
                              min={1}
                              max={f.cantidad}
                              value={cantSel}
                              disabled={Boolean(quitandoId)}
                              onChange={(e) => setCantidadParaFila(f, e.target.value)}
                            />
                          </label>
                        )}
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm btn--danger-text"
                          disabled={Boolean(quitandoId)}
                          onClick={() => handleQuitarParcial(f, cantSel)}
                        >
                          {liberando
                            ? 'Liberando…'
                            : f.cantidad > 1
                              ? `Liberar ${cantSel}`
                              : 'Liberar'}
                        </button>
                        {f.cantidad > 1 && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={Boolean(quitandoId)}
                            onClick={() => handleQuitarFila(f)}
                          >
                            {quitandoId === `parcial-${filaKey}-${f.cantidad}`
                              ? 'Liberando…'
                              : `Todos (${f.cantidad})`}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h3 className="panel__title">
          Detalle por turno ({totalApartados} espacios)
        </h3>
        <p className="text-muted config-hint">
          Los espacios importados aparecen en <strong>amarillo (apartado)</strong> en Taquilla con el
          nombre del devoto(a). Puede completar la venta desde taquilla al hacer clic, o quitar el
          apartado si fue un error.
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
                    {item.apartados} reservado(s)
                    {(item.reservas_taquilla || 0) > 0 && (item.apartados_formales || 0) > 0
                      ? ` (${item.apartados_formales} apartado(s), ${item.reservas_taquilla} taquilla)`
                      : (item.reservas_taquilla || 0) > 0
                        ? ` (${item.reservas_taquilla} taquilla)`
                        : ''}
                    {' · '}
                    {item.vendidos} vendidos · {item.libres} libres
                  </span>
                  {item.apartados > 0 && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm btn--danger-text"
                      disabled={Boolean(quitandoId)}
                      onClick={() => handleQuitarTurno(item)}
                    >
                      {quitandoId === `turno-${item.turno.id}`
                        ? 'Quitando…'
                        : 'Quitar turno completo'}
                    </button>
                  )}
                </div>
                {(item.detalle || []).length === 0 ? (
                  <p className="text-muted resumen-apartados__vacio">Sin reservas en este turno</p>
                ) : (
                  <ul className="resumen-apartados__lista">
                    {(item.detalle || []).map((d) => (
                      <li key={d.brazo.id} className="resumen-apartados__item">
                        <span>
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
                        </span>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm btn--danger-text"
                          disabled={Boolean(quitandoId)}
                          onClick={() => handleQuitarBrazo(d, item)}
                        >
                          {quitandoId === d.brazo.id ? '…' : 'Liberar'}
                        </button>
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
