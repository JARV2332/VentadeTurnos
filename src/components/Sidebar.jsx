import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PANTALLAS } from '../config/permisos';

export default function Sidebar() {
  const { organizacion, rolNombre, logout, hasPermiso } = useAuth();
  const navigate = useNavigate();

  const navItems = PANTALLAS.filter((p) => hasPermiso(p.id));

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__logo">VT</div>
        <div>
          <strong>ventadeturnos</strong>
          <small>SaaS Universal</small>
        </div>
      </div>

      <div className="sidebar__org">
        <span className="sidebar__org-label">Organización activa</span>
        <p className="sidebar__org-name">{organizacion?.nombre_oficial}</p>
        <span className="badge badge--info">{rolNombre}</span>
      </div>

      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) =>
              `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
            }
          >
            <span className="sidebar__icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <button type="button" className="sidebar__logout" onClick={handleLogout}>
        Cerrar sesión
      </button>
    </aside>
  );
}
