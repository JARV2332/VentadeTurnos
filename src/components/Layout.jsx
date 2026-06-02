import React from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function Layout({ title, subtitle, children }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <Navbar title={title} subtitle={subtitle} />
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}
