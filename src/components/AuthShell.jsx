import React from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import AppFooter from './AppFooter';

/**
 * Layout compartido para pantallas de acceso (login, recuperar contraseña, etc.)
 */
export default function AuthShell({ title, subtitle, children, backTo = '/' }) {
  return (
    <div className="landing-page">
      <div className="landing landing--auth-only">
        <div className="landing__hero landing__hero--compact">
          <BrandLogo variant="hero" className="landing__brand" />
          <h1 className="landing__title landing__title--compact">{title}</h1>
          {subtitle && <p className="landing__desc landing__desc--compact">{subtitle}</p>}
        </div>

        <div className="landing__auth">
          <div className="auth-card">
            <BrandLogo variant="icon" className="auth-card__brand-icon" />
            {children}
            <p className="auth-back-link">
              <Link to={backTo}>← Volver al inicio de sesión</Link>
            </p>
          </div>
        </div>
      </div>
      <AppFooter className="app-footer--landing" />
    </div>
  );
}
