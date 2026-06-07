import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { TurnoCartulina } from '../components/TurnoCartulina';
import { useAuth } from '../context/AuthContext';
import {
  generarProcesion,
  getCortejosByOrg,
  getTurnosAgrupados,
  subscribeData,
  desactivarProcesion,
  activarProcesion,
  eliminarProcesion,
  duplicarProcesion,
} from '../services/dataService';
import StatusBadge from '../components/StatusBadge';
import {
  validarBrazosPares,
  brazosPorLado,
  construirTurnosConfig,
  turnosElegiblesExtraordinarios,
  repertorioTurnoLista,
} from '../utils/turnoUtils';
import {
  parseArchivoProcesionExcel,
  descargarPlantillaProcesionExcel,
  etiquetaAsignacion,
  reconstruirTurnosPlanExcel,
  inferirBrazosDefaultDesdeBloques,
  contarBrazosTurnosPlan,
} from '../utils/importProcesionUtils';
import { melodiasDeTurno } from '../utils/turnoUtils';

const DEFAULT = {
  totalTurnos: 20,
  brazosDefault: 20,
  brazosExtraordinario: 12,
  precioSalida: 400,
  precioEntrada: 400,
  precioOrdinario: 150,
  precioExtraordinario: 300,
  turnosExtraordinarios: [7, 14, 16],
  repertorioPorTurno: {
    1: { son: 'Marcha fúnebre de salida', alabado: '' },
    7: { son: '', alabado: 'Dulce nombre de Jesús' },
    14: { son: 'La Peregrina', alabado: '' },
    16: { son: '', alabado: 'Gloria a Dios en las alturas' },
    20: { son: 'Entrada solemne', alabado: 'Salve Regina' },
  },
};

const DEMO_FORM = {
  nombre_evento: 'Procesión de Prueba 2026',
  fecha: '2026-07-10',
  descripcion: 'Procesión demo generada desde configuración.',
};

function SeccionTurno({ titulo, descripcion, children }) {
  return (
    <fieldset className="config-seccion">
      <legend>{titulo}</legend>
      {descripcion && <p className="config-seccion__desc">{descripcion}</p>}
      {children}
    </fieldset>
  );
}

function InputBrazos({ value, onChange, id }) {
  const par = validarBrazosPares(Number(value) || 0);
  return (
    <label htmlFor={id}>
      Total de brazos (par)
      <input
        id={id}
        type="number"
        min={2}
        step={2}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <small className={par ? 'hint-ok' : 'hint-error'}>
        {par
          ? `${brazosPorLado(value)} Izquierda + ${brazosPorLado(value)} Derecha`
          : 'Debe ser número par (ej: 20 → 10 y 10)'}
      </small>
    </label>
  );
}

export default function ConfigSaaS() {
  const { organizacionId } = useAuth();
  const [cortejo, setCortejo] = useState(DEMO_FORM);
  const [config, setConfig] = useState(DEFAULT);
  const [procesiones, setProcesiones] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [verCortejoId, setVerCortejoId] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [modoCreacion, setModoCreacion] = useState('manual');
  const [excelImport, setExcelImport] = useState(null);
  const [generando, setGenerando] = useState(false);
  const [duplicandoId, setDuplicandoId] = useState(null);

  const turnosPlanExcel = useMemo(() => {
    if (modoCreacion !== 'excel' || !excelImport?.bloques?.length) return [];
    const { turnosPlan, errores } = reconstruirTurnosPlanExcel(excelImport, config.brazosDefault);
    if (errores?.length) return excelImport.turnosPlan || [];
    return [...turnosPlan].sort((a, b) => a.numero_turno - b.numero_turno);
  }, [modoCreacion, excelImport, config.brazosDefault]);

  const totalBrazosExcel = useMemo(
    () => contarBrazosTurnosPlan(turnosPlanExcel),
    [turnosPlanExcel]
  );

  const preview = useMemo(() => {
    if (modoCreacion === 'excel' && turnosPlanExcel.length) {
      return turnosPlanExcel;
    }
    return construirTurnosConfig(config);
  }, [modoCreacion, turnosPlanExcel, config]);
  const elegiblesExtra = useMemo(
    () => turnosElegiblesExtraordinarios(config.totalTurnos),
    [config.totalTurnos]
  );

  const refreshLista = useCallback(async () => {
    if (!organizacionId) return;
    const cortejosRaw = await getCortejosByOrg(organizacionId, { incluirInactivas: true });
    const lista = await Promise.all(cortejosRaw.map(async (c) => {
      const turnos = await getTurnosAgrupados(c.id, organizacionId);
      const totalBrazos = turnos.reduce(
        (s, t) => s + t.izquierda.length + t.derecha.length,
        0
      );
      return { ...c, turnos, totalTurnos: turnos.length, totalBrazos };
    }));
    setProcesiones(lista);
  }, [organizacionId]);

  useEffect(() => {
    refreshLista();
    return subscribeData(organizacionId, refreshLista);
  }, [organizacionId, refreshLista]);

  useEffect(() => {
    if (resultado?.cortejo?.id) {
      setVerCortejoId(resultado.cortejo.id);
    }
  }, [resultado]);

  useEffect(() => {
    const validos = new Set(elegiblesExtra);
    setConfig((prev) => {
      const filtrados = (prev.turnosExtraordinarios || []).filter((n) => validos.has(n));
      if (filtrados.length === (prev.turnosExtraordinarios || []).length) return prev;
      return { ...prev, turnosExtraordinarios: filtrados };
    });
  }, [elegiblesExtra]);

  useEffect(() => {
    const max = config.totalTurnos;
    setConfig((prev) => {
      const rep = prev.repertorioPorTurno || {};
      const limpio = Object.fromEntries(
        Object.entries(rep).filter(([n]) => Number(n) >= 1 && Number(n) <= max)
      );
      if (Object.keys(limpio).length === Object.keys(rep).length) return prev;
      return { ...prev, repertorioPorTurno: limpio };
    });
  }, [config.totalTurnos]);

  const setConfigField = (campo, valor) => {
    setConfig((prev) => ({ ...prev, [campo]: valor }));
  };

  const updateRepertorio = (numeroTurno, campo, valor) => {
    setConfig((prev) => {
      const actual = prev.repertorioPorTurno?.[numeroTurno] || { son: '', alabado: '' };
      return {
        ...prev,
        repertorioPorTurno: {
          ...prev.repertorioPorTurno,
          [numeroTurno]: { ...actual, [campo]: valor },
        },
      };
    });
  };

  const toggleExtraordinario = (numero) => {
    setConfig((prev) => {
      const actuales = prev.turnosExtraordinarios || [];
      const existe = actuales.includes(numero);
      const turnosExtraordinarios = existe
        ? actuales.filter((n) => n !== numero)
        : [...actuales, numero].sort((a, b) => a - b);
      return { ...prev, turnosExtraordinarios };
    });
  };

  const handleExcelFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');
    const parsed = await parseArchivoProcesionExcel(file, {
      brazosDefault: config.brazosDefault,
    });

    if (parsed.error) {
      setError(parsed.error);
      setExcelImport(null);
      return;
    }

    if (parsed.errores?.length) {
      setError(parsed.errores.join(' '));
      setExcelImport(null);
      return;
    }

    setExcelImport(parsed);

    const brazosInferidos = inferirBrazosDefaultDesdeBloques(parsed.bloques);
    if (brazosInferidos !== config.brazosDefault) {
      setConfig((prev) => ({ ...prev, brazosDefault: brazosInferidos }));
    }

    const previewPlan = reconstruirTurnosPlanExcel(parsed, brazosInferidos).turnosPlan;
    const totalBrazos = contarBrazosTurnosPlan(previewPlan);
    const brazosMsg =
      brazosInferidos !== config.brazosDefault
        ? ` Se detectaron ${brazosInferidos} brazos por turno en el Excel.`
        : '';

    if (parsed.meta?.nombre_evento) {
      setCortejo((prev) => ({
        ...prev,
        nombre_evento: parsed.meta.nombre_evento,
      }));
    }
    if (parsed.meta?.fecha) {
      setCortejo((prev) => ({ ...prev, fecha: parsed.meta.fecha }));
    }

    setOkMsg(
      `Excel cargado: ${parsed.turnosPlan.length} turnos · ${totalBrazos} brazos en total.${brazosMsg}${
        parsed.advertencias?.length ? ` (${parsed.advertencias.length} aviso(s))` : ''
      }`
    );
  };

  const handleGenerar = async (e) => {
    e.preventDefault();
    setError('');
    setOkMsg('');

    if (!organizacionId) {
      setError('No hay organización activa. Vuelve a iniciar sesión.');
      return;
    }

    if (!cortejo.nombre_evento?.trim()) {
      setError('Escribe el nombre del evento.');
      return;
    }

    if (!cortejo.fecha) {
      setError('Selecciona la fecha del evento.');
      return;
    }

    if (modoCreacion === 'excel') {
      if (!excelImport?.bloques?.length) {
        setError('Suba un archivo Excel con los turnos antes de crear la procesión.');
        return;
      }
      if (!validarBrazosPares(Number(config.brazosDefault))) {
        setError('Indique un total de brazos por turno par (ej. 20, 40, 46).');
        return;
      }
      const rebuilt = reconstruirTurnosPlanExcel(excelImport, config.brazosDefault);
      if (rebuilt.errores?.length) {
        setError(rebuilt.errores.join(' '));
        return;
      }
    } else {
      if (config.totalTurnos < 2) {
        setError('Debe haber al menos 2 turnos (salida + entrada).');
        return;
      }

      if (!validarBrazosPares(Number(config.brazosDefault))) {
        setError('El total de brazos por turno debe ser par (mitad izquierda, mitad derecha).');
        return;
      }

      if (
        (config.turnosExtraordinarios?.length || 0) > 0 &&
        !validarBrazosPares(Number(config.brazosExtraordinario))
      ) {
        setError('Los brazos de los turnos extraordinarios también deben ser par.');
        return;
      }
    }

    try {
      setGenerando(true);

      let configEnvio = config;
      if (modoCreacion === 'excel') {
        const rebuilt = reconstruirTurnosPlanExcel(excelImport, config.brazosDefault);
        configEnvio = {
          ...config,
          turnosPlan: rebuilt.turnosPlan,
          fuente: 'excel',
        };
      }

      const res = await generarProcesion(cortejo, configEnvio, organizacionId);
      if (res.error) {
        setError(res.error);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (!res.brazos?.length) {
        setError(
          'La procesión se creó sin espacios (brazos). Verifique el total de brazos por turno e intente de nuevo.'
        );
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setResultado(res);
      setVerCortejoId(res.cortejo.id);
      setOkMsg(
        `¡Procesión "${res.cortejo.nombre_evento}" creada con ${res.turnos.length} turnos y ${res.brazos.length} espacios (brazos)!`
      );
      setExcelImport(null);
      refreshLista();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message || 'Error al crear la procesión.');
    } finally {
      setGenerando(false);
    }
  };

  const handleDesactivar = async (p) => {
    const res = await desactivarProcesion(p.id, organizacionId);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (verCortejoId === p.id) setVerCortejoId(null);
    setOkMsg(`"${p.nombre_evento}" desactivada. Ya no aparece en Taquilla ni Dashboard.`);
    refreshLista();
  };

  const handleActivar = async (p) => {
    const res = await activarProcesion(p.id, organizacionId);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOkMsg(`"${p.nombre_evento}" reactivada.`);
    refreshLista();
  };

  const handleEliminar = async (p) => {
    const confirmar = window.confirm(
      `¿Eliminar permanentemente "${p.nombre_evento}"?\n\nSe borrarán sus ${p.totalTurnos} turnos y ${p.totalBrazos} espacios. Esta acción no se puede deshacer.`
    );
    if (!confirmar) return;

    const res = await eliminarProcesion(p.id, organizacionId);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (verCortejoId === p.id) setVerCortejoId(null);
    setOkMsg(`"${p.nombre_evento}" eliminada permanentemente.`);
    refreshLista();
  };

  const handleDuplicar = async (p) => {
    const nombreDefault = `${p.nombre_evento} (copia)`;
    const nombre = window.prompt(
      `Nombre de la copia de "${p.nombre_evento}":`,
      nombreDefault
    );
    if (nombre === null) return;
    if (!nombre.trim()) {
      setError('Indique un nombre para la copia.');
      return;
    }

    const fechaDefault = p.fecha || new Date().toISOString().slice(0, 10);
    const fecha = window.prompt('Fecha de la copia (AAAA-MM-DD):', fechaDefault);
    if (fecha === null) return;

    setError('');
    setOkMsg(
      `Copiando procesión… ${p.totalTurnos || '?'} turnos, espere varios minutos sin cerrar la pestaña.`
    );
    setDuplicandoId(p.id);
    try {
      const res = await duplicarProcesion(
        p.id,
        { nombre_evento: nombre.trim(), fecha: fecha.trim() || fechaDefault },
        organizacionId
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      setVerCortejoId(res.cortejo.id);
      setOkMsg(
        `Copia "${res.cortejo.nombre_evento}" creada con ${res.turnos.length} turnos y ${res.brazos.length} espacios.`
      );
      refreshLista();
    } finally {
      setDuplicandoId(null);
    }
  };

  const procesionesActivas = procesiones.filter((p) => p.estado !== 'inactiva');
  const procesionesInactivas = procesiones.filter((p) => p.estado === 'inactiva');

  const renderProcesionCard = (p) => (
    <div
      key={p.id}
      className={`procesion-card ${verCortejoId === p.id ? 'procesion-card--active' : ''} ${
        p.estado === 'inactiva' ? 'procesion-card--inactiva' : ''
      }`}
    >
      <div className="procesion-card__info">
        <div className="procesion-card__titulo">
          <strong>{p.nombre_evento}</strong>
          <StatusBadge status={p.estado === 'inactiva' ? 'inactiva' : 'activa'} />
        </div>
        <span>
          {p.fecha
            ? new Date(`${p.fecha}T12:00:00`).toLocaleDateString('es-GT')
            : '—'}
        </span>
        <span className="procesion-card__stats">
          {p.totalTurnos} turnos · {p.totalBrazos} espacios
        </span>
      </div>
      <div className="procesion-card__actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setVerCortejoId(verCortejoId === p.id ? null : p.id)}
        >
          {verCortejoId === p.id ? 'Ocultar' : 'Ver turnos'}
        </button>
        {p.estado !== 'inactiva' && (
          <Link to="/taquilla" className="btn btn--primary btn--sm">
            Taquilla
          </Link>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={duplicandoId === p.id}
          onClick={() => handleDuplicar(p)}
        >
          {duplicandoId === p.id ? 'Copiando…' : 'Duplicar'}
        </button>
        {p.estado === 'inactiva' ? (
          <button type="button" className="btn btn--success btn--sm" onClick={() => handleActivar(p)}>
            Reactivar
          </button>
        ) : (
          <button type="button" className="btn btn--warning btn--sm" onClick={() => handleDesactivar(p)}>
            Desactivar
          </button>
        )}
        <button type="button" className="btn btn--danger btn--sm" onClick={() => handleEliminar(p)}>
          Eliminar
        </button>
      </div>
    </div>
  );

  const procesionVer = procesiones.find((p) => p.id === verCortejoId);
  const ultimoTurno = config.totalTurnos;

  return (
    <Layout title="Configuración" subtitle="Alta de procesión y estructura de turnos">
      {okMsg && (
        <div className="alert alert--success">
          {okMsg}
          <Link to="/taquilla" className="alert__link">Ir a Taquilla →</Link>
        </div>
      )}
      {error && <div className="alert alert--error">{error}</div>}

      <section className="panel">
        <h3 className="panel__title">
          Procesiones activas ({procesionesActivas.length})
        </h3>
        <p className="text-muted config-hint">
          Las activas aparecen en Taquilla, Dashboard e Impresión. Puedes desactivarlas sin borrar datos.
        </p>
        {procesionesActivas.length === 0 ? (
          <p className="text-muted">No hay procesiones activas. Crea una abajo o reactiva una inactiva.</p>
        ) : (
          <div className="procesiones-lista">
            {procesionesActivas.map(renderProcesionCard)}
          </div>
        )}

        {procesionesInactivas.length > 0 && (
          <>
            <h4 className="panel__subtitle">Procesiones inactivas ({procesionesInactivas.length})</h4>
            <p className="text-muted config-hint">
              Ocultas de los listados operativos. Puedes reactivarlas o eliminarlas.
            </p>
            <div className="procesiones-lista procesiones-lista--inactivas">
              {procesionesInactivas.map(renderProcesionCard)}
            </div>
          </>
        )}

        {procesionVer && (
          <div className="procesion-detalle">
            <h4>Turnos de: {procesionVer.nombre_evento}</h4>
            <p className="text-muted config-hint">
              Orden del cortejo: turno 1 = salida del templo · último = entrada.
            </p>
            <div className="turnos-lista turnos-lista--compact">
              {procesionVer.turnos.map((turno) => (
                <TurnoCartulina
                  key={turno.id}
                  turno={turno}
                  selectedBrazo={null}
                  onClickBrazo={() => {}}
                  readOnly
                />
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="config-grid config-grid--wide">
        <form className="panel config-form" onSubmit={handleGenerar} noValidate>
          <h3 className="panel__title">Nueva procesión / cortejo</h3>
          <p className="text-muted config-hint">
            Define cuántos turnos lleva el cortejo. El <strong>turno 1 es la salida</strong> y el{' '}
            <strong>turno {ultimoTurno || '…'} es la entrada</strong>. Los demás son ordinarios, salvo los que marques como extraordinarios.
          </p>

          <label>
            Nombre del evento
            <input
              type="text"
              placeholder="Ej. Procesión Solemne 2026"
              value={cortejo.nombre_evento}
              onChange={(e) => setCortejo({ ...cortejo, nombre_evento: e.target.value })}
            />
          </label>

          <label>
            Fecha
            <input
              type="date"
              value={cortejo.fecha}
              onChange={(e) => setCortejo({ ...cortejo, fecha: e.target.value })}
            />
          </label>

          <label>
            Descripción
            <textarea
              rows={2}
              value={cortejo.descripcion}
              onChange={(e) => setCortejo({ ...cortejo, descripcion: e.target.value })}
            />
          </label>

          <div className="modo-creacion-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={modoCreacion === 'manual'}
              className={`modo-creacion-tab ${modoCreacion === 'manual' ? 'modo-creacion-tab--active' : ''}`}
              onClick={() => setModoCreacion('manual')}
            >
              Diseño manual
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={modoCreacion === 'excel'}
              className={`modo-creacion-tab ${modoCreacion === 'excel' ? 'modo-creacion-tab--active' : ''}`}
              onClick={() => setModoCreacion('excel')}
            >
              Importar Excel
            </button>
          </div>

          {modoCreacion === 'excel' ? (
            <SeccionTurno
              titulo="Programa de turnos (Excel)"
              descripcion={
                <>
                  Columnas: <strong>Turno</strong>, <strong>Melodía</strong>,{' '}
                  <strong>Asignacion de turno</strong>, <strong>Ofrenda</strong>. Varias filas con
                  la misma columna Turno = varias melodías. Asignación: disponible, reservado (no
                  vender) o mixto (ej. reservado 20 brazos, venta 26).
                </>
              }
            >
              <div className="import-toolbar">
                <label className="btn btn--ghost import-upload-btn">
                  Subir Excel (.xlsx)
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelFile} hidden />
                </label>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => descargarPlantillaProcesionExcel()}
                >
                  Descargar plantilla
                </button>
              </div>

              <label>
                Brazos por turno (aplica a todos los turnos del Excel)
                <input
                  type="number"
                  min={2}
                  step={2}
                  value={config.brazosDefault}
                  onChange={(e) => setConfigField('brazosDefault', Number(e.target.value))}
                />
                <small className="field-hint">
                  Para turnos que dicen solo &quot;Disponible para la venta&quot; se usa este total.
                  Si el Excel indica cantidades (ej. 20 reservados + 26 venta), ese turno usa la suma
                  del Excel. Al importar se detecta automáticamente (ej. 46).
                </small>
              </label>

              {turnosPlanExcel.length > 0 && (
                <p className="config-hint">
                  <strong>Vista previa:</strong> {turnosPlanExcel.length} turnos ·{' '}
                  <strong>{totalBrazosExcel.toLocaleString('es-GT')} brazos</strong> en total
                </p>
              )}

              {excelImport?.advertencias?.length > 0 && (
                <ul className="import-advertencias">
                  {excelImport.advertencias.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}

              {turnosPlanExcel.length > 0 && (
                <div className="table-wrap import-preview-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Turno</th>
                        <th>Tipo</th>
                        <th>Melodía(s)</th>
                        <th>Asignación</th>
                        <th>Brazos</th>
                        <th>Ofrenda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {turnosPlanExcel.map((t) => (
                        <tr key={`${t.numero_turno}-${t.etiqueta}`}>
                          <td>{t.numero_turno}</td>
                          <td>{t.etiqueta}</td>
                          <td>{t.tipo_turno}</td>
                          <td className="import-cell-melodia">
                            {melodiasDeTurno(t).length > 0 ? (
                              <ul className="import-melodias-lista">
                                {melodiasDeTurno(t).map((m) => (
                                  <li key={`${t.numero_turno}-${m}`}>{m}</li>
                                ))}
                              </ul>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{etiquetaAsignacion(t.asignacion)}</td>
                          <td>{t.total_brazos}</td>
                          <td>Q{t.precio}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SeccionTurno>
          ) : (
            <>
          <SeccionTurno
            titulo="Cantidad de turnos"
            descripcion={`Con ${config.totalTurnos} turnos: #1 Salida · #${ultimoTurno} Entrada · ${elegiblesExtra.length} posiciones intermedias.`}
          >
            <label>
              Total de turnos en el cortejo
              <input
                type="number"
                min={2}
                max={50}
                value={config.totalTurnos}
                onChange={(e) => setConfigField('totalTurnos', Number(e.target.value))}
              />
            </label>
            <div className="orden-turnos-banner">
              <span className="orden-turnos-banner__item orden-turnos-banner__item--salida">
                Turno 1 → Salida
              </span>
              <span className="orden-turnos-banner__flecha">···</span>
              <span className="orden-turnos-banner__item orden-turnos-banner__item--entrada">
                Turno {ultimoTurno} → Entrada
              </span>
            </div>
          </SeccionTurno>

          <SeccionTurno
            titulo="Brazos y ofrendas base"
            descripcion="Aplica a salida, entrada y turnos ordinarios. Los extraordinarios pueden tener otro total de brazos."
          >
            <div className="form-row">
              <InputBrazos
                id="brazos-default"
                value={config.brazosDefault}
                onChange={(v) => setConfigField('brazosDefault', v)}
              />
              <label>
                Ofrenda salida (turno 1) Q
                <input
                  type="number"
                  min={0}
                  value={config.precioSalida}
                  onChange={(e) => setConfigField('precioSalida', Number(e.target.value))}
                />
              </label>
              <label>
                Ofrenda entrada (turno {ultimoTurno}) Q
                <input
                  type="number"
                  min={0}
                  value={config.precioEntrada}
                  onChange={(e) => setConfigField('precioEntrada', Number(e.target.value))}
                />
              </label>
              <label>
                Ofrenda ordinario Q
                <input
                  type="number"
                  min={0}
                  value={config.precioOrdinario}
                  onChange={(e) => setConfigField('precioOrdinario', Number(e.target.value))}
                />
              </label>
            </div>
          </SeccionTurno>

          <SeccionTurno
            titulo="Turnos extraordinarios"
            descripcion="Marca en qué número de turno van (no puede ser el 1 ni el último). Ejemplo: 7, 14 y 16 de 20."
          >
            <div className="form-row">
              <label>
                Ofrenda extraordinario Q
                <input
                  type="number"
                  min={0}
                  value={config.precioExtraordinario}
                  onChange={(e) => setConfigField('precioExtraordinario', Number(e.target.value))}
                />
              </label>
              <InputBrazos
                id="brazos-extra"
                value={config.brazosExtraordinario}
                onChange={(v) => setConfigField('brazosExtraordinario', v)}
              />
            </div>

            <p className="extra-picker-summary">
              Seleccionados: <strong>{config.turnosExtraordinarios.length}</strong>
              {config.turnosExtraordinarios.length > 0 && (
                <> — turnos {config.turnosExtraordinarios.join(', ')}</>
              )}
            </p>

            {elegiblesExtra.length === 0 ? (
              <p className="text-muted">Con solo 2 turnos no hay posiciones para extraordinarios.</p>
            ) : (
              <div className="extra-picker-grid" role="group" aria-label="Posiciones extraordinarias">
                {elegiblesExtra.map((n) => {
                  const marcado = config.turnosExtraordinarios.includes(n);
                  return (
                    <label
                      key={n}
                      className={`extra-picker-chip ${marcado ? 'extra-picker-chip--on' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => toggleExtraordinario(n)}
                      />
                      <span>#{n}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </SeccionTurno>

          <SeccionTurno
            titulo="Son y alabado por turno"
            descripcion="Indica qué pieza musical o alabado corresponde a cada turno. La taquilla lo mostrará al vendedor."
          >
            <div className="repertorio-tabla-wrap">
              <table className="repertorio-tabla">
                <thead>
                  <tr>
                    <th>Turno</th>
                    <th>Tipo</th>
                    <th>Son (opcional)</th>
                    <th>Alabado (opcional)</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((t) => {
                    const rep = config.repertorioPorTurno?.[t.numero_turno] || {
                      son: '',
                      alabado: '',
                    };
                    return (
                      <tr key={t.numero_turno}>
                        <td>
                          <strong>#{t.numero_turno}</strong>
                        </td>
                        <td>
                          <span className={`preview-tipo preview-tipo--${t.tipo_turno.toLowerCase()}`}>
                            {t.etiqueta || t.tipo_turno}
                          </span>
                        </td>
                        <td>
                          <input
                            type="text"
                            placeholder="Ej. La Peregrina"
                            value={rep.son}
                            onChange={(e) => updateRepertorio(t.numero_turno, 'son', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            placeholder="Ej. Dulce nombre de Jesús"
                            value={rep.alabado}
                            onChange={(e) => updateRepertorio(t.numero_turno, 'alabado', e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SeccionTurno>
            </>
          )}

          <button type="submit" className="btn btn--primary btn--block" disabled={generando}>
            {generando ? 'Creando procesión…' : 'Crear procesión'}
          </button>
        </form>

        <div className="panel">
          <h3 className="panel__title">Vista previa antes de crear</h3>
          <p className="text-muted preview-summary">
            {preview.length} turnos ·{' '}
            {preview.reduce((s, t) => s + t.total_brazos, 0)} espacios totales
            {modoCreacion === 'manual' && (
              <> · {config.turnosExtraordinarios.length} extraordinario(s)</>
            )}
            {modoCreacion === 'excel' && turnosPlanExcel.length > 0 && (
              <> · desde Excel · {totalBrazosExcel.toLocaleString('es-GT')} brazos</>
            )}
          </p>
          <div className="preview-turnos">
            {preview.map((t) => (
              <div key={t.numero_turno} className="preview-turno">
                <div className="preview-turno__head">
                  <strong>Turno #{t.numero_turno}</strong>
                  <span className={`preview-tipo preview-tipo--${t.tipo_turno.toLowerCase()}`}>
                    {t.etiqueta || t.tipo_turno}
                  </span>
                  <span>Q{t.precio}</span>
                </div>
                <div className="preview-turno__cuerpo">
                  <span>{brazosPorLado(t.total_brazos)} Izq</span>
                  <span className="preview-turno__centro">◆</span>
                  <span>{brazosPorLado(t.total_brazos)} Der</span>
                </div>
                {repertorioTurnoLista(t).length > 0 && (
                  <div className="preview-turno__repertorio">
                    {repertorioTurnoLista(t).map((r) => (
                      <span key={r.tipo}>
                        <strong>{r.tipo}:</strong> {r.texto}
                      </span>
                    ))}
                  </div>
                )}
                {t.asignacion && (
                  <div className="preview-turno__asignacion text-muted">
                    {etiquetaAsignacion(t.asignacion)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
