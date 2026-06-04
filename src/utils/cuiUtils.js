/** CUI Guatemala: 13 dígitos numéricos. */

export const CUI_DIGITS = 13;

export function normalizarCui(value) {
  return String(value || '').replace(/\D/g, '').slice(0, CUI_DIGITS);
}

export function isValidCui(value) {
  const d = normalizarCui(value);
  return d.length === CUI_DIGITS;
}

export function formatCuiDisplay(value) {
  const d = normalizarCui(value);
  if (d.length <= 4) return d;
  if (d.length <= 9) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 9)} ${d.slice(9)}`;
}
