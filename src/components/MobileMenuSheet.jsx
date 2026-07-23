import React, { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LABEL_CORTO = {
  dashboard: 'Inicio',
  taquilla: 'Taquilla',
  entrega: 'Entrega',
  ajuste_entrega: 'Ajuste entrega',
  caja: 'Caja',
  impresion: 'Impresión',
  devotos: 'Devotos',
  config: 'Procesiones',
  config_correo: 'Correo',
  config_recibo: 'Recibos',
  usuarios: 'Usuarios',
  import_reservas: 'Apartados',
  plataforma: 'Asociaciones',
};

export default function MobileMenuSheet({ items, open, onClose }) {
  const { organizacion, rolNombre, logout, esSuperAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const handleNav = () => {
    onClose();
  };

  const handleLogout = async () => {
    onClose();
    await logout();
    navigate('/');
  };

  return (
    <div className="mobile-menu-sheet" role="presentation">
      <button
        type="button"
        className="mobile-menu-sheet__backdrop"
        aria-label="Cerrar menú"
        onClick={onClose}
      />
      <div className="mobile-menu-sheet__panel" role="dialog" aria-label="Más opciones">
        <div className="mobile-menu-sheet__handle" aria-hidden />
        <div className="mobile-menu-sheet__head">
          <div>
            <p className="mobile-menu-sheet__org-label">
              {esSuperAdmin && !organizacion ? 'Plataforma' : 'Organización'}
            </p>
            <strong className="mobile-menu-sheet__org-name">
              {organizacion?.nombre_oficial ||
                (esSuperAdmin ? 'ventadeturnos.com' : '—')}
            </strong>
            <span className="badge badge--info">{rolNombre}</span>
          </div>
          <button type="button" className="mobile-menu-sheet__close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <nav className="mobile-menu-sheet__grid" aria-label="Más pantallas">
          {items.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              onClick={handleNav}
              className={({ isActive }) =>
                `mobile-menu-sheet__item ${isActive ? 'mobile-menu-sheet__item--active' : ''}`
              }
            >
              <span className="mobile-menu-sheet__icon" aria-hidden>{item.icon}</span>
              <span>{LABEL_CORTO[item.id] || item.label}</span>
            </NavLink>
          ))}
          <NavLink
            to="/perfil"
            onClick={handleNav}
            className={({ isActive }) =>
              `mobile-menu-sheet__item ${isActive ? 'mobile-menu-sheet__item--active' : ''}`
            }
          >
            <span className="mobile-menu-sheet__icon" aria-hidden>◉</span>
            <span>Mi perfil</span>
          </NavLink>
        </nav>

        <button type="button" className="mobile-menu-sheet__logout" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
