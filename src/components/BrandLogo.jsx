import React from 'react';

const ICON = `${process.env.PUBLIC_URL}/logo-icon.svg`;
const FULL = `${process.env.PUBLIC_URL}/logo-full.svg`;

export default function BrandLogo({
  variant = 'icon',
  className = '',
  alt = 'Ventadeturnos.com',
}) {
  if (variant === 'hero') {
    return (
      <div className={`brand-logo brand-logo--hero ${className}`.trim()} aria-label={alt}>
        <img src={ICON} alt="" className="brand-logo__hero-icon" aria-hidden />
        <p className="brand-logo__hero-name">
          <strong>ventadeturnos</strong>
          <span>.com</span>
        </p>
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <img
        src={FULL}
        alt={alt}
        className={`brand-logo brand-logo--full ${className}`.trim()}
      />
    );
  }

  if (variant === 'wordmark') {
    return (
      <span className={`brand-logo brand-logo--wordmark ${className}`.trim()}>
        <img src={ICON} alt="" className="brand-logo__icon" aria-hidden />
        <span className="brand-logo__text">
          <strong>ventadeturnos</strong>
          <small>SaaS Universal</small>
        </span>
      </span>
    );
  }

  return (
    <img
      src={ICON}
      alt={alt}
      className={`brand-logo brand-logo--icon ${className}`.trim()}
    />
  );
}
