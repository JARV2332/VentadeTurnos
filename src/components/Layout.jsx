import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import MobileNav from './MobileNav';

export default function Layout({ title, subtitle, children, className = '' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <div className={`app-layout${menuOpen ? ' app-layout--menu-open' : ''}`}>
      {menuOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <Sidebar mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="app-main">
        <Navbar
          title={title}
          subtitle={subtitle}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((open) => !open)}
        />
        <div className={`app-content ${className}`.trim()}>{children}</div>
      </main>
      <MobileNav />
    </div>
  );
}
