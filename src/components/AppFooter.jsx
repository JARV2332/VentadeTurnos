import React from 'react';
import {
  APP_NAME,
  DEVELOPER_NAME,
  CONTACT_EMAIL,
  contactMailtoUrl,
} from '../constants/appBranding';

export default function AppFooter({ className = '' }) {
  const year = new Date().getFullYear();

  return (
    <footer
      className={`app-footer no-print ${className}`.trim()}
      role="contentinfo"
    >
      <p className="app-footer__copy">
        © {year} {APP_NAME}. Todos los derechos reservados.
      </p>
      <p className="app-footer__dev">
        Development by <strong>{DEVELOPER_NAME}</strong>
      </p>
      <p className="app-footer__contact">
        <a href={contactMailtoUrl()} className="app-footer__link">
          Contáctanos
        </a>
        <span className="app-footer__sep" aria-hidden="true">
          ·
        </span>
        <a href={contactMailtoUrl()} className="app-footer__email">
          {CONTACT_EMAIL}
        </a>
      </p>
    </footer>
  );
}
