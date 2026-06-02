/**
 * Datos de demostración — estructura real de turnos (Izq + Der).
 */
import { crearBrazosParaTurno } from '../utils/turnoUtils';

const ORG_A = 'org-demo-001';
const ORG_B = 'org-demo-002';

export const DEMO_NOMBRE_ORGANIZACION =
  'Pastoral de Religiosidad Popular Nuestra Señora de La Asunción';

export const DEMO_USERS = {
  admin: {
    id: 'user-admin-001',
    email: 'admin@demo.com',
    password: 'demo123',
    nombre: 'María Administradora',
    organizacion_id: ORG_A,
    rol: 'administrador',
  },
  vendedor: {
    id: 'user-vendedor-001',
    email: 'vendedor@demo.com',
    password: 'demo123',
    nombre: 'Carlos Vendedor',
    organizacion_id: ORG_A,
    rol: 'vendedor',
  },
};

export const DEMO_ORGANIZACIONES = {
  [ORG_A]: {
    id: ORG_A,
    nombre_oficial: DEMO_NOMBRE_ORGANIZACION,
    entidad_o_parroquia: 'Nuestra Señora de La Asunción',
    telefono_contacto: '50255551234',
    subdominio_slug: 'pastoral-nuestra-senora-asuncion',
  },
  [ORG_B]: {
    id: ORG_B,
    nombre_oficial: 'Hermandad El Buen Camino',
    entidad_o_parroquia: 'Zona 10',
    telefono_contacto: '50255559876',
    subdominio_slug: 'buen-camino',
  },
};

export const DEMO_CORTEJOS = [
  {
    id: 'cortejo-001',
    organizacion_id: ORG_A,
    nombre_evento: 'Desfile Anual 2026',
    fecha: '2026-06-15',
    descripcion: 'Procesión principal — turno 1 salida, turno 12 entrada, extraordinario en #7.',
    estado: 'activa',
  },
];

/** Turnos demo: #1 Salida → ordinarios → #7 Extra → … → #12 Entrada */
export const DEMO_TURNOS = [
  { id: 'turno-001', organizacion_id: ORG_A, cortejo_id: 'cortejo-001', numero_turno: 1, tipo_turno: 'Salida', precio: 400, total_brazos: 20, etiqueta: 'Salida' },
  { id: 'turno-002', organizacion_id: ORG_A, cortejo_id: 'cortejo-001', numero_turno: 2, tipo_turno: 'Ordinario', precio: 150, total_brazos: 20, etiqueta: 'Ordinario 1' },
  { id: 'turno-003', organizacion_id: ORG_A, cortejo_id: 'cortejo-001', numero_turno: 3, tipo_turno: 'Ordinario', precio: 150, total_brazos: 20, etiqueta: 'Ordinario 2' },
  { id: 'turno-004', organizacion_id: ORG_A, cortejo_id: 'cortejo-001', numero_turno: 4, tipo_turno: 'Ordinario', precio: 150, total_brazos: 20, etiqueta: 'Ordinario 3' },
  { id: 'turno-005', organizacion_id: ORG_A, cortejo_id: 'cortejo-001', numero_turno: 5, tipo_turno: 'Ordinario', precio: 150, total_brazos: 20, etiqueta: 'Ordinario 4' },
  { id: 'turno-006', organizacion_id: ORG_A, cortejo_id: 'cortejo-001', numero_turno: 6, tipo_turno: 'Ordinario', precio: 150, total_brazos: 20, etiqueta: 'Ordinario 5' },
  { id: 'turno-007', organizacion_id: ORG_A, cortejo_id: 'cortejo-001', numero_turno: 7, tipo_turno: 'Extraordinario', precio: 300, total_brazos: 12, etiqueta: 'Extraordinario · turno 7' },
  { id: 'turno-008', organizacion_id: ORG_A, cortejo_id: 'cortejo-001', numero_turno: 8, tipo_turno: 'Ordinario', precio: 150, total_brazos: 20, etiqueta: 'Ordinario 6' },
  { id: 'turno-009', organizacion_id: ORG_A, cortejo_id: 'cortejo-001', numero_turno: 9, tipo_turno: 'Ordinario', precio: 150, total_brazos: 20, etiqueta: 'Ordinario 7' },
  { id: 'turno-010', organizacion_id: ORG_A, cortejo_id: 'cortejo-001', numero_turno: 10, tipo_turno: 'Ordinario', precio: 150, total_brazos: 20, etiqueta: 'Ordinario 8' },
  { id: 'turno-011', organizacion_id: ORG_A, cortejo_id: 'cortejo-001', numero_turno: 11, tipo_turno: 'Ordinario', precio: 150, total_brazos: 20, etiqueta: 'Ordinario 9' },
  { id: 'turno-012', organizacion_id: ORG_A, cortejo_id: 'cortejo-001', numero_turno: 12, tipo_turno: 'Entrada', precio: 400, total_brazos: 20, etiqueta: 'Entrada' },
];

export const DEMO_MESAS = [
  { id: 'mesa-001', organizacion_id: ORG_A, nombre_mesa: 'Mesa Principal', vendedor_id: 'user-vendedor-001', estado: 'activa' },
  { id: 'mesa-002', organizacion_id: ORG_A, nombre_mesa: 'Mesa Lateral', vendedor_id: 'user-vendedor-002', estado: 'activa' },
];

export const DEMO_CARGADORES = [
  {
    id: 'carg-001',
    organizacion_id: ORG_A,
    nombre_completo: 'Juan Pérez López',
    whatsapp: '50212345678',
    correo: 'juan.perez@correo.com',
    cui_o_identificacion: '1234567890123',
    telefono_emergencia: '50287654321',
  },
  {
    id: 'carg-002',
    organizacion_id: ORG_A,
    nombre_completo: 'Ana María Rodríguez',
    whatsapp: '50298765432',
    correo: 'ana.rodriguez@correo.com',
    cui_o_identificacion: '9876543210987',
    telefono_emergencia: '50211112222',
  },
];

export const DEMO_EMAIL_CONFIG = {
  [ORG_A]: {
    correo_remitente: 'turnos@pastoral-asuncion.org',
    nombre_remitente: DEMO_NOMBRE_ORGANIZACION,
    correo_respuesta: 'contacto@pastoral-asuncion.org',
    notificaciones_activas: true,
    pie_correo: 'Gracias por su participación en nuestros eventos.',
  },
};

function generarBrazosIniciales() {
  const brazos = [];

  DEMO_TURNOS.forEach((turno) => {
    const delTurno = crearBrazosParaTurno({
      turnoId: turno.id,
      numeroTurno: turno.numero_turno,
      totalBrazos: turno.total_brazos,
      organizacionId: ORG_A,
      idPrefix: 'brazo',
    });

    // Demo: turno 7 extraordinario — brazo 3 izquierda vendido, brazo 5 derecha reservado
    delTurno.forEach((b) => {
      if (turno.numero_turno === 7 && b.lado === 'Izquierda' && b.numero_brazo === 3) {
        Object.assign(b, {
          estado: 'vendido',
          cargador_id: 'carg-001',
          precio_pagado: turno.precio,
          codigo_boleta_qr: 'VT-DEMO0001',
          vendedor_id: 'user-vendedor-001',
          mesa_id: 'mesa-001',
          estado_entrega: 'pendiente',
          entregado_en: null,
          entregado_por: null,
          metodo_pago: 'efectivo',
          comprobante_url: null,
          pago_confirmado_en: null,
        });
      }
      if (turno.numero_turno === 7 && b.lado === 'Derecha' && b.numero_brazo === 5) {
        Object.assign(b, {
          estado: 'reservado',
          bloqueado_hasta: new Date(Date.now() + 4 * 60000).toISOString(),
          vendedor_id: 'user-vendedor-002',
          mesa_id: 'mesa-002',
        });
      }
    });

    brazos.push(...delTurno);
  });

  return brazos;
}

export const DEMO_BRAZOS = generarBrazosIniciales();

export function crearStoreInicial() {
  return {
    organizaciones: { ...DEMO_ORGANIZACIONES },
    cortejos: [...DEMO_CORTEJOS],
    turnos: [...DEMO_TURNOS],
    mesas: [...DEMO_MESAS],
    cargadores: [...DEMO_CARGADORES],
    brazos: DEMO_BRAZOS.map((b) => ({ ...b })),
    emailConfig: { ...DEMO_EMAIL_CONFIG },
    correosEnviados: {},
  };
}

export { ORG_A, ORG_B };
