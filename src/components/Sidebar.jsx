import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '◫' },
  { to: '/taquilla', label: 'Taquilla', icon: '▦' },
  { to: '/entrega', label: 'Entrega turnos', icon: '⎔' },
  { to: '/caja', label: 'Caja', icon: '◈' },
  { to: '/impresion', label: 'Impresión', icon: '▣' },
  { to: '/config', label: 'Procesiones', icon: '⚙', admin: true },
  { to: '/config/correo', label: 'Correo y boletas', icon: '✉', admin: true },
];

export default function Sidebar() {
  const { organizacion, rol, logout } = useAuth();
  const navigate = useNavigate();

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
        <span className="badge badge--info">{rol}</span>
      </div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.filter((item) => !item.admin || rol === 'administrador').map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
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
