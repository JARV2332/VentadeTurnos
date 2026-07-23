const TYPO_DOMINIOS = [
  { pattern: /@gmaii\./i, sugerencia: 'gmail.com' },
  { pattern: /@gmial\./i, sugerencia: 'gmail.com' },
  { pattern: /@gmal\./i, sugerencia: 'gmail.com' },
  { pattern: /@gmail\.con$/i, sugerencia: 'gmail.com' },
  { pattern: /@hotmal\./i, sugerencia: 'hotmail.com' },
];

/** Devuelve aviso si el correo parece tener un typo común en el dominio. */
export function advertirTypoCorreo(correo) {
  const val = String(correo || '').trim();
  if (!val) return null;
  for (const { pattern, sugerencia } of TYPO_DOMINIOS) {
    if (pattern.test(val)) {
      return `El correo "${val}" parece mal escrito (¿${sugerencia}?). Revise la ficha del devoto antes de enviar.`;
    }
  }
  return null;
}
