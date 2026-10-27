/** Sexo del devoto: M = masculino, F = femenino. */

export const SEXO_OPCIONES = [
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Femenino' },
];

export function normalizarSexo(valor) {
  const raw = String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (raw === 'm' || raw === 'masculino' || raw === 'hombre' || raw === 'caballero') return 'M';
  if (raw === 'f' || raw === 'femenino' || raw === 'mujer' || raw === 'dama') return 'F';
  return '';
}

export function isValidSexo(valor) {
  return valor === 'M' || valor === 'F';
}

export function etiquetaSexo(valor) {
  if (valor === 'M') return 'Masculino';
  if (valor === 'F') return 'Femenino';
  return '—';
}
