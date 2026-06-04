import React from 'react';
import BoletaRecibo from './BoletaRecibo';

/** Compatibilidad: delega en BoletaRecibo con diseño configurable. */
export default function BoletaCard(props) {
  return <BoletaRecibo {...props} />;
}
