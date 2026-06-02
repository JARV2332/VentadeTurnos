import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PANTALLAS } from '../config/permisos';

const LABEL_CORTO = {
  dashboard: 'Inicio',
  taquilla: 'Taquilla',
  entrega: 'Entrega',
  caja: 'Caja',
  impresion: 'Imprimir',
  config: 'Procesiones',
  config_correo: 'Correo',
  usuarios: 'Usuarios',
  import_reservas: 'Apartados',
};

export default function MobileNav() {
  const { hasPermiso } = useAuth();
  const navItems = PANTALLAS.filter((p) => hasPermiso(p.id));

  if (navItems.length === 0) return null;

  return (
    <nav className="mobile-nav" aria-label="Navegación principal">
      <div className="mobile-nav__scroll">
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
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
      </div>
    </nav>
  );
}
