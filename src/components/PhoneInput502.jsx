import React from 'react';
import { localDigitsFromGtPhone, fullGtPhoneFromLocal, GT_LOCAL_DIGITS } from '../utils/phoneGtUtils';

/**
 * Campo teléfono con +502 fijo; el usuario solo escribe 8 dígitos.
 */
export default function PhoneInput502({
  label,
  value = '',
  onChange,
  required = false,
  placeholder = '12345678',
  hint,
}) {
  const local = localDigitsFromGtPhone(value);

  const handleChange = (e) => {
    const nextLocal = e.target.value.replace(/\D/g, '').slice(0, GT_LOCAL_DIGITS);
    onChange(fullGtPhoneFromLocal(nextLocal));
  };

  return (
    <label className="phone-input-502">
      <span className="phone-input-502__label">{label}</span>
      <div className="phone-prefix-field">
        <span className="phone-prefix-field__prefix" aria-hidden="true">
          +502
        </span>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          className="phone-prefix-field__input"
          placeholder={placeholder}
          value={local}
          onChange={handleChange}
          required={required}
          maxLength={GT_LOCAL_DIGITS}
          aria-label={`${label} sin prefijo`}
        />
      </div>
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}
