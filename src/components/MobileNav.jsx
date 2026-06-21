import React, { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PANTALLAS } from '../config/permisos';
import MobileMenuSheet from './MobileMenuSheet';

const LABEL_CORTO = {
  dashboard: 'Inicio',
  taquilla: 'Taquilla',
  entrega: 'Entrega',
  caja: 'Caja',
  impresion: 'Imprimir',
  devotos: 'Devotos',
  config: 'Procesiones',
  config_correo: 'Correo',
  config_recibo: 'Recibos',
  usuarios: 'Usuarios',
  import_reservas: 'Apartados',
  plataforma: 'Asociaciones',
};

const PRIMARY_ORDER = ['taquilla', 'entrega', 'caja', 'dashboard'];

function sortByPrimaryOrder(items) {
  return [...items].sort((a, b) => {
    const ia = PRIMARY_ORDER.indexOf(a.id);
    const ib = PRIMARY_ORDER.indexOf(b.id);
    const pa = ia === -1 ? 999 : ia;
    const pb = ib === -1 ? 999 : ib;
    return pa - pb;
  });
}

export default function MobileNav() {
  const { hasPermiso } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = useMemo(
    () =>
      PANTALLAS.filter((p) => {
        if (p.id === 'config_recibo') {
          return hasPermiso('config_recibo') || hasPermiso('config_correo');
        }
        return hasPermiso(p.id);
      }),
    [hasPermiso]
  );

  const { primaryItems, overflowItems, showMas } = useMemo(() => {
    const sorted = sortByPrimaryOrder(navItems);
    if (sorted.length <= 4) {
      return { primaryItems: sorted, overflowItems: [], showMas: false };
    }
    return {
      primaryItems: sorted.slice(0, 4),
      overflowItems: sorted.slice(4),
      showMas: true,
    };
  }, [navItems]);

  const masActivo = useMemo(
    () =>
      showMas &&
      (overflowItems.some((item) => location.pathname.startsWith(item.path)) ||
        location.pathname.startsWith('/perfil')),
    [showMas, overflowItems, location.pathname]
  );

  if (navItems.length === 0) return null;

  return (
    <>
      <nav className="mobile-nav" aria-label="Navegación principal">
        <div className="mobile-nav__bar">
          {primaryItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/dashboard'}
              className={({ isActive }) =>
                `mobile-nav__link ${isActive ? 'mobile-nav__link--active' : ''}`
              }
            >
              <span className="mobile-nav__icon" aria-hidden>{item.icon}</span>
              <span className="mobile-nav__label">
                {LABEL_CORTO[item.id] || item.label}
              </span>
            </NavLink>
          ))}
          {showMas && (
            <button
              type="button"
              className={`mobile-nav__link mobile-nav__link--mas ${menuOpen || masActivo ? 'mobile-nav__link--active' : ''}`}
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
            >
              <span className="mobile-nav__icon" aria-hidden>⋯</span>
              <span className="mobile-nav__label">Más</span>
            </button>
          )}
          {!showMas && (
            <NavLink
              to="/perfil"
              className={({ isActive }) =>
                `mobile-nav__link ${isActive ? 'mobile-nav__link--active' : ''}`
              }
            >
              <span className="mobile-nav__icon" aria-hidden>◉</span>
              <span className="mobile-nav__label">Perfil</span>
            </NavLink>
          )}
        </div>
      </nav>

      {showMas && (
        <MobileMenuSheet
          items={overflowItems}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </>
  );
}
