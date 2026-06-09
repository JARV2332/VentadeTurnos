import { getCortejosByOrg, getTurnosByIds } from './dataService';
import { enviarBoletaPorCorreo } from './emailService';
import { dormir } from '../utils/reenvioMasivoUtils';
import { codigoReciboDisplay } from '../utils/compraUtils';

export async function precargarDatosReenvio(organizacionId, recibos) {
  const turnoIds = [];
  (recibos || []).forEach((r) => {
    r.brazos.forEach((b) => {
      if (b.turno_id) turnoIds.push(b.turno_id);
    });
  });
  const [turnosMap, cortejos] = await Promise.all([
    getTurnosByIds(turnoIds),
    getCortejosByOrg(organizacionId),
  ]);
  const cortejosMap = Object.fromEntries((cortejos || []).map((c) => [c.id, c]));
  return { turnosMap, cortejosMap };
}

function prepararEnvioRecibo(recibo, { cargadoresPorId, turnosMap, cortejosMap }) {
  const cargador = cargadoresPorId[recibo.brazos[0]?.cargador_id] || null;
  const items = recibo.brazos.map((b) => ({
    brazo: b,
    turno: turnosMap[b.turno_id] || null,
  }));
  const cortejoId = items[0]?.turno?.cortejo_id;
  const cortejo = cortejoId ? cortejosMap[cortejoId] || null : null;
  return {
    cargador,
    items,
    cortejo,
    compra: recibo.compra,
    brazo: recibo.brazos[0],
  };
}

function etiquetaRecibo(recibo, cargadoresPorId) {
  const nombre =
    cargadoresPorId[recibo.brazos[0]?.cargador_id]?.nombre_completo?.trim() || 'Sin nombre';
  const codigo = codigoReciboDisplay(recibo.compra, recibo.brazos);
  return `${nombre} — ${codigo}`;
}

/**
 * Reenvía boletas/recibos uno por uno con pausa entre envíos (evita bloqueo de Gmail).
 */
export async function ejecutarReenvioMasivo({
  organizacionId,
  organizacion,
  recibos,
  cargadoresPorId,
  delaySegundos = 5,
  onProgress,
  signal,
}) {
  const lista = recibos || [];
  const { turnosMap, cortejosMap } = await precargarDatosReenvio(organizacionId, lista);
  const resultados = { ok: [], error: [], cancelado: false };

  for (let i = 0; i < lista.length; i += 1) {
    if (signal?.cancelled) {
      resultados.cancelado = true;
      break;
    }

    const recibo = lista[i];
    const prep = prepararEnvioRecibo(recibo, { cargadoresPorId, turnosMap, cortejosMap });
    const etiqueta = etiquetaRecibo(recibo, cargadoresPorId);

    onProgress?.({
      fase: 'enviando',
      indice: i + 1,
      total: lista.length,
      etiqueta,
      destinatario: prep.cargador?.correo,
    });

    const res = await enviarBoletaPorCorreo({
      organizacionId,
      organizacion,
      cargador: prep.cargador,
      brazo: prep.brazo,
      turno: prep.items[0]?.turno,
      cortejo: prep.cortejo,
      items: prep.items,
      compra: prep.compra,
      forzarEnvio: true,
    });

    const entrada = {
      reciboId: recibo.id,
      etiqueta,
      destinatario: prep.cargador?.correo,
      nombre: prep.cargador?.nombre_completo?.trim() || '',
      codigo: codigoReciboDisplay(recibo.compra, recibo.brazos),
      cargadorId: prep.cargador?.id || null,
    };

    if (res.ok) {
      resultados.ok.push({ ...entrada, demo: res.demo });
    } else {
      resultados.error.push({
        ...entrada,
        error: res.error || res.motivo || 'No se pudo enviar',
      });
    }

    onProgress?.({
      fase: i < lista.length - 1 ? 'espera' : 'fin',
      indice: i + 1,
      total: lista.length,
      etiqueta,
      ultimoResultado: res.ok ? 'ok' : 'error',
      resultados,
    });

    if (i < lista.length - 1 && !signal?.cancelled) {
      await dormir(Math.max(0, delaySegundos) * 1000);
    }
  }

  onProgress?.({ fase: 'fin', resultados });
  return resultados;
}
