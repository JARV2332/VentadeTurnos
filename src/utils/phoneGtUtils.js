/** Teléfonos Guatemala: prefijo +502, 8 dígitos locales. */

export const GT_PHONE_PREFIX = '502';
export const GT_LOCAL_DIGITS = 8;

/** Solo los 8 dígitos después del 502 (para mostrar en el input). */
export function localDigitsFromGtPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith(GT_PHONE_PREFIX)) {
    return digits.slice(GT_PHONE_PREFIX.length, GT_PHONE_PREFIX.length + GT_LOCAL_DIGITS);
  }
  return digits.slice(0, GT_LOCAL_DIGITS);
}

/** Arma número completo 502XXXXXXXX para guardar en BD. */
export function fullGtPhoneFromLocal(localInput) {
  const local = String(localInput || '').replace(/\D/g, '').slice(0, GT_LOCAL_DIGITS);
  if (!local) return '';
  return `${GT_PHONE_PREFIX}${local}`;
}

export function isValidGtWhatsapp(fullDigits) {
  const d = String(fullDigits || '').replace(/\D/g, '');
  return d.length === GT_PHONE_PREFIX.length + GT_LOCAL_DIGITS && d.startsWith(GT_PHONE_PREFIX);
}
