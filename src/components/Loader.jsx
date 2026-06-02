import React from 'react';

export default function Loader({ fullScreen = false, text = 'Cargando...' }) {
  return (
    <div className={`loader ${fullScreen ? 'loader--fullscreen' : ''}`}>
      <div className="loader__spinner" />
      <span className="loader__text">{text}</span>
    </div>
  );
}
