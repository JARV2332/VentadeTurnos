import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PANTALLAS } from '../config/permisos';
import BrandLogo from './BrandLogo';

export default function Sidebar({ mobileOpen = false, onClose }) {
  const { organizacion, rolNombre, logout, hasPermiso, esSuperAdmin } = useAuth();
  const navigate = useNavigate();

  const navItems = PANTALLAS.filter((p) => {
    if (p.id === 'config_recibo') {
      return hasPermiso('config_recibo') || hasPermiso('config_correo');
    }
    return hasPermiso(p.id);
  });

  const handleLogout = async () => {
    onClose?.();
    await logout();
    navigate('/');
  };

  const handleNav = () => {
    onClose?.();
  };

  return (
    <aside className={`sidebar${mobileOpen ? ' sidebar--open' : ''}`}>
      <div className="sidebar__brand">
        <BrandLogo variant="wordmark" className="sidebar__brand-logo" />
      </div>

      <div className="sidebar__org">
        <span className="sidebar__org-label">
          {esSuperAdmin && !organizacion ? 'Plataforma' : 'Organización activa'}
        </span>
        <p className="sidebar__org-name">
          {organizacion?.nombre_oficial ||
            (esSuperAdmin ? 'ventadeturnos.com' : '—')}
        </p>
        <span className="badge badge--info">{rolNombre}</span>
      </div>

      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            onClick={handleNav}
            className={({ isActive }) =>
              `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
            }
          >
            <span className="sidebar__icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <NavLink
        to="/perfil"
        onClick={handleNav}
        className={({ isActive }) =>
          `sidebar__link sidebar__link--perfil ${isActive ? 'sidebar__link--active' : ''}`
        }
      >
        <span className="sidebar__icon">◉</span>
        Mi perfil
      </NavLink>

      <button type="button" className="sidebar__logout" onClick={handleLogout}>
        Cerrar sesión
      </button>
    </aside>
  );
}
