/**
 * Fecha del evento (cortejo) + hora estimada por turno.
 */

export function fechaEventoKey(fecha) {
  if (!fecha) return null;
  const raw = String(fecha);
  const iso = raw.includes('T') ? raw.slice(0, 10) : raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return iso;
}

export function formatFechaEvento(fecha) {
  const key = fechaEventoKey(fecha);
  if (!key) return '—';
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('es-GT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

export function formatFechaEventoCorta(fecha) {
  const key = fechaEventoKey(fecha);
  if (!key) return '—';
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('es-GT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dt);
}

/** Normaliza input type="time" o TIME de Postgres a HH:MM:SS */
export function normalizarHoraInput(val) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  if (!s) return null;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{1,2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}

export function parseHoraMinutos(hora) {
  const n = normalizarHoraInput(hora);
  if (!n) return null;
  const [h, m] = n.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function minutosAHoraStr(totalMinutos) {
  const mins = ((totalMinutos % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

/** Hora del turno n (base 0) = horaInicio + n * minutosEntre */
export function calcularHoraTurno(horaInicio, minutosEntre, indice) {
  const base = parseHoraMinutos(horaInicio);
  if (base === null) return null;
  const gap = Math.max(0, Number(minutosEntre) || 0);
  return minutosAHoraStr(base + indice * gap);
}

export function formatHoraDisplay(hora) {
  const n = normalizarHoraInput(hora);
  if (!n) return '—';
  const [h, m] = n.split(':');
  const dt = new Date(2000, 0, 1, Number(h), Number(m));
  return new Intl.DateTimeFormat('es-GT', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(dt);
}

export function combinarFechaHoraTurno(fechaEvento, horaEstimada) {
  const f = formatFechaEventoCorta(fechaEvento);
  const h = formatHoraDisplay(horaEstimada);
  if (f === '—' && h === '—') return '—';
  if (h === '—') return f;
  if (f === '—') return h;
  return `${f} · ${h}`;
}

export function formatTimestampGt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}
