import React, { useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PANTALLAS, puedeVerPantalla } from '../config/permisos';
import BrandLogo from './BrandLogo';

const ORDEN_GRUPOS = ['Plataforma', 'Operación', 'Reportes', 'Administración'];

export default function Sidebar({ mobileOpen = false, onClose }) {
  const { organizacion, rolNombre, logout, hasPermiso, esSuperAdmin } = useAuth();
  const navigate = useNavigate();

  const navItems = PANTALLAS.filter((p) => {
    if (p.id === 'config_recibo') {
      return hasPermiso('config_recibo') || hasPermiso('config_correo');
    }
    return puedeVerPantalla(hasPermiso, p);
  });

  const navPorGrupo = useMemo(() => {
    const map = new Map();
    navItems.forEach((item) => {
      const g = item.grupo || 'Otros';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(item);
    });
    return ORDEN_GRUPOS.filter((g) => map.has(g)).map((g) => [g, map.get(g)]);
  }, [navItems]);

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
        {navPorGrupo.map(([grupo, items]) => (
          <div key={grupo} className="sidebar__section">
            <span className="sidebar__section-label">{grupo}</span>
            {items.map((item) => (
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
          </div>
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
