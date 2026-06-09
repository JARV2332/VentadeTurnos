/**
 * Fachada de datos: mock (demo) o Supabase según REACT_APP_MOCK_MODE.
 */
import { MOCK_MODE } from '../config/supabaseClient';
import * as mock from './mockService';
import * as sb from './supabaseService';

const useSb = () => !MOCK_MODE;

export const subscribeData = (organizacionId, callback) =>
  useSb() ? sb.subscribeSupabase(organizacionId, callback) : mock.subscribeMock(callback);

export const getCortejosByOrg = (organizacionId, opts) =>
  useSb()
    ? sb.getCortejosByOrg(organizacionId, opts)
    : Promise.resolve(mock.getCortejosByOrg(organizacionId, opts));

export const getBrazosByOrg = (organizacionId) =>
  useSb()
    ? sb.getBrazosByOrg(organizacionId)
    : Promise.resolve(mock.getBrazosByOrg(organizacionId));

export const getBrazosVendidosByOrg = (organizacionId) =>
  useSb()
    ? sb.getBrazosVendidosByOrg(organizacionId)
    : Promise.resolve(mock.getBrazosVendidosByOrg(organizacionId));

export const getTurnoById = (turnoId) =>
  useSb()
    ? sb.getTurnoById(turnoId)
    : Promise.resolve(mock.getStore().turnos.find((t) => t.id === turnoId) || null);

export const getTurnosByIds = (turnoIds) =>
  useSb()
    ? sb.getTurnosByIds(turnoIds)
    : Promise.resolve(mock.getTurnosByIdsMock(turnoIds));

export const getTurnosAgrupados = (cortejoId, organizacionId) =>
  useSb()
    ? sb.getTurnosAgrupados(cortejoId, organizacionId)
    : Promise.resolve(mock.getTurnosAgrupados(cortejoId, organizacionId));

export const getTurnosByCortejo = (cortejoId) =>
  useSb()
    ? sb.getTurnosByCortejo(cortejoId)
    : Promise.resolve(mock.getTurnosByCortejo(cortejoId));

export const actualizarHorarioProcesion = (organizacionId, cortejoId, opts) =>
  useSb()
    ? sb.actualizarHorarioProcesion(organizacionId, cortejoId, opts)
    : Promise.resolve(mock.actualizarHorarioProcesionMock(organizacionId, cortejoId, opts));

export const updateTurno = (organizacionId, turnoId, datos) =>
  useSb()
    ? sb.updateTurno(organizacionId, turnoId, datos)
    : Promise.resolve(mock.updateTurnoMock(organizacionId, turnoId, datos));

export const agregarTurnoProcesion = (organizacionId, cortejoId, datos) =>
  useSb()
    ? sb.agregarTurnoProcesion(organizacionId, cortejoId, datos)
    : Promise.resolve(mock.agregarTurnoProcesionMock(organizacionId, cortejoId, datos));

export const getMesasByOrg = (organizacionId) =>
  useSb()
    ? sb.getMesasByOrg(organizacionId)
    : Promise.resolve(mock.getStore().mesas.filter((m) => m.organizacion_id === organizacionId));

export const getCargadorById = (id) =>
  useSb()
    ? sb.getCargadorById(id)
    : Promise.resolve(mock.getStore().cargadores.find((c) => c.id === id) || null);

export const getCargadoresByOrg = (organizacionId) =>
  useSb()
    ? sb.getCargadoresByOrg(organizacionId)
    : Promise.resolve(mock.getCargadoresByOrg(organizacionId));

export const updateDevoto = (organizacionId, cargadorId, datos) =>
  useSb()
    ? sb.updateDevoto(organizacionId, cargadorId, datos)
    : Promise.resolve(mock.updateDevotoMock(organizacionId, cargadorId, datos));

export const buscarCargadorPorWhatsapp = (organizacionId, whatsapp) =>
  useSb()
    ? sb.buscarCargadorPorWhatsapp(organizacionId, whatsapp)
    : Promise.resolve(mock.buscarCargadorPorWhatsapp(organizacionId, whatsapp));

export const buscarCargadorPorCui = (organizacionId, cui) =>
  useSb()
    ? sb.buscarCargadorPorCui(organizacionId, cui)
    : Promise.resolve(mock.buscarCargadorPorCui(organizacionId, cui));

export const reservarBrazo = (brazoId, mesaId, vendedorId, organizacionId) =>
  useSb()
    ? sb.reservarBrazo(brazoId, mesaId, vendedorId)
    : Promise.resolve(mock.reservarBrazoMock(brazoId, mesaId, vendedorId, organizacionId));

export const confirmarVenta = (brazoId, cargadorData, precio, organizacionId, pagoData) =>
  useSb()
    ? sb.confirmarVenta(brazoId, { ...cargadorData, organizacion_id: organizacionId }, precio, pagoData)
    : Promise.resolve(mock.confirmarVentaMock(brazoId, cargadorData, precio, organizacionId, pagoData));

export const confirmarVentaCompra = (brazoIds, cargadorData, precios, organizacionId, pagoData) =>
  useSb()
    ? sb.confirmarVentaCompra(brazoIds, { ...cargadorData, organizacion_id: organizacionId }, precios, pagoData)
    : Promise.resolve(
        mock.confirmarVentaCompraMock(brazoIds, cargadorData, precios, organizacionId, pagoData)
      );

export const getComprasByOrg = (organizacionId) =>
  useSb()
    ? sb.getComprasByOrg(organizacionId)
    : Promise.resolve(mock.getComprasByOrgMock(organizacionId));

export const buscarBoletaPorCodigo = (organizacionId, codigo) =>
  useSb()
    ? sb.buscarBoletaPorCodigo(organizacionId, codigo)
    : Promise.resolve(mock.buscarBoletaPorCodigo(organizacionId, codigo));

export const anularVentaPorCodigo = (organizacionId, codigo, motivo) =>
  useSb()
    ? sb.anularVentaPorCodigo(organizacionId, codigo, motivo)
    : Promise.resolve(mock.anularVentaPorCodigoMock(organizacionId, codigo, motivo));

export const marcarEntregado = (brazoId, organizacionId, usuarioId) =>
  useSb()
    ? sb.marcarEntregado(brazoId)
    : Promise.resolve(mock.marcarEntregadoMock(brazoId, organizacionId, usuarioId));

export const getFinanzasByOrg = (organizacionId) =>
  useSb()
    ? sb.getFinanzasByOrg(organizacionId)
    : Promise.resolve(mock.getFinanzasByOrg(organizacionId));

export const getDashboardMetrics = (organizacionId) =>
  useSb()
    ? sb.getDashboardMetrics(organizacionId)
    : Promise.resolve(mock.getDashboardMetrics(organizacionId));

export const getEmailConfig = (organizacionId) =>
  useSb()
    ? sb.getEmailConfig(organizacionId)
    : Promise.resolve(mock.getEmailConfig(organizacionId));

export const saveEmailConfig = (organizacionId, config) =>
  useSb()
    ? sb.saveEmailConfig(organizacionId, config)
    : Promise.resolve(mock.saveEmailConfig(organizacionId, config));

export const getReciboConfig = (organizacionId) =>
  useSb()
    ? sb.getReciboConfig(organizacionId)
    : Promise.resolve(mock.getReciboConfig(organizacionId));

export const saveReciboConfig = (organizacionId, payload) =>
  useSb()
    ? sb.saveReciboConfig(organizacionId, payload)
    : Promise.resolve(mock.saveReciboConfig(organizacionId, payload));

export const getCorreosEnviados = (organizacionId) =>
  useSb()
    ? sb.getCorreosEnviados(organizacionId)
    : Promise.resolve(mock.getCorreosEnviadosMock(organizacionId));

export const registrarCorreoEnviado = (organizacionId, datos) =>
  useSb()
    ? sb.registrarCorreoEnviado(organizacionId, datos)
    : Promise.resolve(mock.registrarCorreoEnviadoMock(organizacionId, datos));

export const updateCorreoEnviadoEstado = (organizacionId, correoId, estado, nota) =>
  useSb()
    ? sb.updateCorreoEnviadoEstado(organizacionId, correoId, estado, nota)
    : Promise.resolve(mock.updateCorreoEnviadoEstadoMock(organizacionId, correoId, estado, nota));

export const getRolesByOrg = (organizacionId) =>
  useSb()
    ? sb.getRolesByOrg(organizacionId)
    : Promise.resolve(mock.getRolesByOrg(organizacionId));

export const getUsuariosByOrg = (organizacionId) =>
  useSb()
    ? sb.getUsuariosByOrg(organizacionId)
    : Promise.resolve(mock.getUsuariosByOrg(organizacionId));

export const saveRol = (organizacionId, datos, rolId) =>
  useSb()
    ? sb.saveRol(organizacionId, datos, rolId)
    : Promise.resolve(mock.saveRolMock(organizacionId, datos, rolId));

export const deleteRol = (rolId, organizacionId) =>
  useSb()
    ? sb.deleteRol(rolId, organizacionId)
    : Promise.resolve(mock.deleteRolMock(rolId, organizacionId));

export const saveUsuario = (organizacionId, datos, usuarioId) =>
  useSb()
    ? sb.saveUsuario(organizacionId, datos, usuarioId)
    : Promise.resolve(mock.saveUsuarioMock(organizacionId, datos, usuarioId));

export const generarProcesion = (cortejo, config, organizacionId) =>
  useSb()
    ? sb.generarProcesion(cortejo, config, organizacionId)
    : Promise.resolve(mock.generarProcesionMock(cortejo, config, organizacionId));

export const desactivarProcesion = (id, orgId) =>
  useSb()
    ? sb.desactivarProcesion(id, orgId)
    : Promise.resolve(mock.desactivarProcesionMock(id, orgId));

export const activarProcesion = (id, orgId) =>
  useSb()
    ? sb.activarProcesion(id, orgId)
    : Promise.resolve(mock.activarProcesionMock(id, orgId));

export const eliminarProcesion = (id, orgId) =>
  useSb()
    ? sb.eliminarProcesion(id, orgId)
    : Promise.resolve(mock.eliminarProcesionMock(id, orgId));

export const duplicarProcesion = (cortejoOrigenId, datos, orgId) =>
  useSb()
    ? sb.duplicarProcesion(cortejoOrigenId, datos, orgId)
    : Promise.resolve(mock.duplicarProcesionMock(cortejoOrigenId, datos, orgId));

export const setUsuarioActivo = (orgId, usuario, activo) =>
  useSb()
    ? sb.setUsuarioActivo(orgId, usuario, activo)
    : Promise.resolve(mock.setUsuarioActivoMock(orgId, usuario, activo));

export const getResumenApartados = (cortejoId, orgId) =>
  useSb()
    ? sb.getResumenApartados(cortejoId, orgId)
    : Promise.resolve(mock.getResumenApartados(cortejoId, orgId));

export const aplicarImportApartados = (cortejoId, orgId, filas, opts) =>
  useSb()
    ? sb.aplicarImportApartados(cortejoId, orgId, filas, opts)
    : Promise.resolve(mock.aplicarImportApartadosMock(cortejoId, orgId, filas, opts));

export const quitarApartados = (organizacionId, cortejoId, opts) =>
  useSb()
    ? sb.quitarApartados(organizacionId, cortejoId, opts)
    : Promise.resolve(mock.quitarApartadosMock(organizacionId, cortejoId, opts));

export const updatePerfil = (userId, orgId, datos, email) =>
  useSb()
    ? sb.updatePerfilSupabase(userId, orgId, datos, email)
    : Promise.resolve(mock.updatePerfilMock(userId, orgId, datos));

export const fetchPerfilByAuthId = (authUserId) =>
  useSb() ? sb.fetchPerfilByAuthId(authUserId) : Promise.resolve(null);

export const listOrganizacionesPlataforma = () =>
  useSb()
    ? sb.listOrganizacionesPlataforma()
    : Promise.resolve([]);

export const setOrganizacionActiva = (orgId) =>
  useSb() ? sb.setOrganizacionActiva(orgId) : Promise.resolve({ ok: true });

export const crearOrganizacionPlataforma = (payload) =>
  useSb()
    ? sb.crearOrganizacionPlataforma(payload)
    : Promise.resolve({ error: 'Solo con Supabase' });

/** Solo modo mock */
export const getStore = () => mock.getStore();
