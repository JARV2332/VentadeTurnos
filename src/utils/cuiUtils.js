/** CUI Guatemala: 13 dígitos numéricos. */

export const CUI_DIGITS = 13;

export function normalizarCui(value) {
  return String(value || '').replace(/\D/g, '').slice(0, CUI_DIGITS);
}

export function isValidCui(value) {
  const d = normalizarCui(value);
  return d.length === CUI_DIGITS;
}

/** Normaliza DPI desde Excel (número, texto, vacío, guiones). */
export function normalizarDpiImport(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { dpi: '', advertencia: null };

  const lowered = raw.toLowerCase();
  if (/^(n\/a|na|sin dpi|pendiente|-+|–+|—+)$/.test(lowered)) {
    return { dpi: '', advertencia: null };
  }

  let digits = String(value).replace(/\D/g, '');
  if (!digits) return { dpi: '', advertencia: null };

  if (digits.length === 13) return { dpi: digits, advertencia: null };

  if (digits.length === 14) {
    const recortado = digits.slice(0, 13);
    return {
      dpi: recortado,
      advertencia: `DPI "${raw}" tenía 14 dígitos — se usó ${recortado}.`,
    };
  }

  if (digits.length < 13) {
    const padded = digits.padStart(13, '0');
    return {
      dpi: padded,
      advertencia: `DPI "${raw}" se completó con ceros: ${padded}.`,
    };
  }

  return {
    dpi: '',
    advertencia: `DPI "${raw}" no reconocido — se importa solo con nombre.`,
  };
}

export function parseCantidadImport(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { cantidad: 1, advertencia: 'Cantidad vacía — se usó 1.' };
  const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
  if (!n || n < 1) return { cantidad: null, advertencia: null };
  return { cantidad: n, advertencia: null };
}

export function formatCuiDisplay(value) {
  const d = normalizarCui(value);
  if (d.length <= 4) return d;
  if (d.length <= 9) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 9)} ${d.slice(9)}`;
}
