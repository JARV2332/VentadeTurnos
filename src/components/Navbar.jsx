import React from 'react';
import { useAuth } from '../context/AuthContext';
import { MOCK_MODE } from '../config/supabaseClient';

export default function Navbar({ title, subtitle, onMenuToggle, menuOpen = false }) {
  const { user } = useAuth();

  return (
    <header className="navbar">
      {onMenuToggle && (
        <button
          type="button"
          className="navbar__menu-btn"
          onClick={onMenuToggle}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      )}
      <div className="navbar__head">
        <h1 className="navbar__title">{title}</h1>
        {subtitle && <p className="navbar__subtitle">{subtitle}</p>}
      </div>
      <div className="navbar__actions">
        {MOCK_MODE && <span className="navbar__pill navbar__pill--mock">Modo demo</span>}
        <div className="navbar__user">
          <span className="navbar__avatar">{user?.nombre?.[0] || user?.email?.[0]?.toUpperCase()}</span>
          <div>
            <strong>{user?.nombre || user?.email}</strong>
            <small>Sesión activa</small>
          </div>
        </div>
      </div>
    </header>
  );
}
