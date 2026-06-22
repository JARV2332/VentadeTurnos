/**
 * Fachada de datos: mock (demo) o Supabase según REACT_APP_MOCK_MODE.
 */
import { MOCK_MODE } from '../config/supabaseClient';
import * as mock from './mockService';
import * as sb from './supabaseService';

const isSupabaseBackend = () => !MOCK_MODE;

export const subscribeData = (organizacionId, callback) =>
  isSupabaseBackend() ? sb.subscribeSupabase(organizacionId, callback) : mock.subscribeMock(callback);

export const getCortejosByOrg = (organizacionId, opts) =>
  isSupabaseBackend()
    ? sb.getCortejosByOrg(organizacionId, opts)
    : Promise.resolve(mock.getCortejosByOrg(organizacionId, opts));

export const getBrazosByOrg = (organizacionId) =>
  isSupabaseBackend()
    ? sb.getBrazosByOrg(organizacionId)
    : Promise.resolve(mock.getBrazosByOrg(organizacionId));

export const getBrazosVendidosByOrg = (organizacionId) =>
  isSupabaseBackend()
    ? sb.getBrazosVendidosByOrg(organizacionId)
    : Promise.resolve(mock.getBrazosVendidosByOrg(organizacionId));

export const getTurnoById = (turnoId) =>
  isSupabaseBackend()
    ? sb.getTurnoById(turnoId)
    : Promise.resolve(mock.getStore().turnos.find((t) => t.id === turnoId) || null);

export const getTurnosByIds = (turnoIds) =>
  isSupabaseBackend()
    ? sb.getTurnosByIds(turnoIds)
    : Promise.resolve(mock.getTurnosByIdsMock(turnoIds));

export const getTurnosAgrupados = (cortejoId, organizacionId) =>
  isSupabaseBackend()
    ? sb.getTurnosAgrupados(cortejoId, organizacionId)
    : Promise.resolve(mock.getTurnosAgrupados(cortejoId, organizacionId));

export const getTurnosByCortejo = (cortejoId) =>
  isSupabaseBackend()
    ? sb.getTurnosByCortejo(cortejoId)
    : Promise.resolve(mock.getTurnosByCortejo(cortejoId));

export const actualizarHorarioProcesion = (organizacionId, cortejoId, opts) =>
  isSupabaseBackend()
    ? sb.actualizarHorarioProcesion(organizacionId, cortejoId, opts)
    : Promise.resolve(mock.actualizarHorarioProcesionMock(organizacionId, cortejoId, opts));

export const updateTurno = (organizacionId, turnoId, datos) =>
  isSupabaseBackend()
    ? sb.updateTurno(organizacionId, turnoId, datos)
    : Promise.resolve(mock.updateTurnoMock(organizacionId, turnoId, datos));

export const agregarTurnoProcesion = (organizacionId, cortejoId, datos) =>
  isSupabaseBackend()
    ? sb.agregarTurnoProcesion(organizacionId, cortejoId, datos)
    : Promise.resolve(mock.agregarTurnoProcesionMock(organizacionId, cortejoId, datos));

export const getMesasByOrg = (organizacionId) =>
  isSupabaseBackend()
    ? sb.getMesasByOrg(organizacionId)
    : Promise.resolve(mock.getStore().mesas.filter((m) => m.organizacion_id === organizacionId));

export const getCargadorById = (id) =>
  isSupabaseBackend()
    ? sb.getCargadorById(id)
    : Promise.resolve(mock.getStore().cargadores.find((c) => c.id === id) || null);

export const getCargadoresByOrg = (organizacionId) =>
  isSupabaseBackend()
    ? sb.getCargadoresByOrg(organizacionId)
    : Promise.resolve(mock.getCargadoresByOrg(organizacionId));

export const updateDevoto = (organizacionId, cargadorId, datos) =>
  isSupabaseBackend()
    ? sb.updateDevoto(organizacionId, cargadorId, datos)
    : Promise.resolve(mock.updateDevotoMock(organizacionId, cargadorId, datos));

export const createDevoto = (organizacionId, datos) =>
  isSupabaseBackend()
    ? sb.createDevoto(organizacionId, datos)
    : Promise.resolve(mock.createDevotoMock(organizacionId, datos));

export const deleteDevoto = (organizacionId, cargadorId) =>
  isSupabaseBackend()
    ? sb.deleteDevoto(organizacionId, cargadorId)
    : Promise.resolve(mock.deleteDevotoMock(organizacionId, cargadorId));

export const buscarCargadorPorWhatsapp = (organizacionId, whatsapp) =>
  isSupabaseBackend()
    ? sb.buscarCargadorPorWhatsapp(organizacionId, whatsapp)
    : Promise.resolve(mock.buscarCargadorPorWhatsapp(organizacionId, whatsapp));

export const buscarCargadorPorCui = (organizacionId, cui) =>
  isSupabaseBackend()
    ? sb.buscarCargadorPorCui(organizacionId, cui)
    : Promise.resolve(mock.buscarCargadorPorCui(organizacionId, cui));

export const reservarBrazo = (brazoId, mesaId, vendedorId, organizacionId) =>
  isSupabaseBackend()
    ? sb.reservarBrazo(brazoId, mesaId, vendedorId)
    : Promise.resolve(mock.reservarBrazoMock(brazoId, mesaId, vendedorId, organizacionId));

export const confirmarVenta = (brazoId, cargadorData, precio, organizacionId, pagoData) =>
  isSupabaseBackend()
    ? sb.confirmarVenta(brazoId, { ...cargadorData, organizacion_id: organizacionId }, precio, pagoData)
    : Promise.resolve(mock.confirmarVentaMock(brazoId, cargadorData, precio, organizacionId, pagoData));

export const confirmarVentaCompra = (brazoIds, cargadorData, precios, organizacionId, pagoData) =>
  isSupabaseBackend()
    ? sb.confirmarVentaCompra(brazoIds, { ...cargadorData, organizacion_id: organizacionId }, precios, pagoData)
    : Promise.resolve(
        mock.confirmarVentaCompraMock(brazoIds, cargadorData, precios, organizacionId, pagoData)
      );

export const getComprasByOrg = (organizacionId) =>
  isSupabaseBackend()
    ? sb.getComprasByOrg(organizacionId)
    : Promise.resolve(mock.getComprasByOrgMock(organizacionId));

export const buscarBoletaPorCodigo = (organizacionId, codigo) =>
  isSupabaseBackend()
    ? sb.buscarBoletaPorCodigo(organizacionId, codigo)
    : Promise.resolve(mock.buscarBoletaPorCodigo(organizacionId, codigo));

export const anularVentaPorCodigo = (organizacionId, codigo, motivo) =>
  isSupabaseBackend()
    ? sb.anularVentaPorCodigo(organizacionId, codigo, motivo)
    : Promise.resolve(mock.anularVentaPorCodigoMock(organizacionId, codigo, motivo));

export const actualizarPagoPorCodigo = (organizacionId, codigo, pagoData) =>
  isSupabaseBackend()
    ? sb.actualizarPagoPorCodigo(organizacionId, codigo, pagoData)
    : Promise.resolve(mock.actualizarPagoPorCodigoMock(organizacionId, codigo, pagoData));

export const marcarEntregado = (brazoId, organizacionId, usuarioId) =>
  isSupabaseBackend()
    ? sb.marcarEntregado(brazoId)
    : Promise.resolve(mock.marcarEntregadoMock(brazoId, organizacionId, usuarioId));

export const getFinanzasByOrg = (organizacionId) =>
  isSupabaseBackend()
    ? sb.getFinanzasByOrg(organizacionId)
    : Promise.resolve(mock.getFinanzasByOrg(organizacionId));

export const getDashboardMetrics = (organizacionId) =>
  isSupabaseBackend()
    ? sb.getDashboardMetrics(organizacionId)
    : Promise.resolve(mock.getDashboardMetrics(organizacionId));

export const getEmailConfig = (organizacionId) =>
  isSupabaseBackend()
    ? sb.getEmailConfig(organizacionId)
    : Promise.resolve(mock.getEmailConfig(organizacionId));

export const saveEmailConfig = (organizacionId, config) =>
  isSupabaseBackend()
    ? sb.saveEmailConfig(organizacionId, config)
    : Promise.resolve(mock.saveEmailConfig(organizacionId, config));

export const getReciboConfig = (organizacionId) =>
  isSupabaseBackend()
    ? sb.getReciboConfig(organizacionId)
    : Promise.resolve(mock.getReciboConfig(organizacionId));

export const saveReciboConfig = (organizacionId, payload) =>
  isSupabaseBackend()
    ? sb.saveReciboConfig(organizacionId, payload)
    : Promise.resolve(mock.saveReciboConfig(organizacionId, payload));

export const getCorreosEnviados = (organizacionId) =>
  isSupabaseBackend()
    ? sb.getCorreosEnviados(organizacionId)
    : Promise.resolve(mock.getCorreosEnviadosMock(organizacionId));

export const registrarCorreoEnviado = (organizacionId, datos) =>
  isSupabaseBackend()
    ? sb.registrarCorreoEnviado(organizacionId, datos)
    : Promise.resolve(mock.registrarCorreoEnviadoMock(organizacionId, datos));

export const updateCorreoEnviadoEstado = (organizacionId, correoId, estado, nota) =>
  isSupabaseBackend()
    ? sb.updateCorreoEnviadoEstado(organizacionId, correoId, estado, nota)
    : Promise.resolve(mock.updateCorreoEnviadoEstadoMock(organizacionId, correoId, estado, nota));

export const getRolesByOrg = (organizacionId) =>
  isSupabaseBackend()
    ? sb.getRolesByOrg(organizacionId)
    : Promise.resolve(mock.getRolesByOrg(organizacionId));

export const getUsuariosByOrg = (organizacionId) =>
  isSupabaseBackend()
    ? sb.getUsuariosByOrg(organizacionId)
    : Promise.resolve(mock.getUsuariosByOrg(organizacionId));

export const saveRol = (organizacionId, datos, rolId) =>
  isSupabaseBackend()
    ? sb.saveRol(organizacionId, datos, rolId)
    : Promise.resolve(mock.saveRolMock(organizacionId, datos, rolId));

export const deleteRol = (rolId, organizacionId) =>
  isSupabaseBackend()
    ? sb.deleteRol(rolId, organizacionId)
    : Promise.resolve(mock.deleteRolMock(rolId, organizacionId));

export const saveUsuario = (organizacionId, datos, usuarioId) =>
  isSupabaseBackend()
    ? sb.saveUsuario(organizacionId, datos, usuarioId)
    : Promise.resolve(mock.saveUsuarioMock(organizacionId, datos, usuarioId));

export const generarProcesion = (cortejo, config, organizacionId) =>
  isSupabaseBackend()
    ? sb.generarProcesion(cortejo, config, organizacionId)
    : Promise.resolve(mock.generarProcesionMock(cortejo, config, organizacionId));

export const desactivarProcesion = (id, orgId) =>
  isSupabaseBackend()
    ? sb.desactivarProcesion(id, orgId)
    : Promise.resolve(mock.desactivarProcesionMock(id, orgId));

export const activarProcesion = (id, orgId) =>
  isSupabaseBackend()
    ? sb.activarProcesion(id, orgId)
    : Promise.resolve(mock.activarProcesionMock(id, orgId));

export const eliminarProcesion = (id, orgId) =>
  isSupabaseBackend()
    ? sb.eliminarProcesion(id, orgId)
    : Promise.resolve(mock.eliminarProcesionMock(id, orgId));

export const duplicarProcesion = (cortejoOrigenId, datos, orgId) =>
  isSupabaseBackend()
    ? sb.duplicarProcesion(cortejoOrigenId, datos, orgId)
    : Promise.resolve(mock.duplicarProcesionMock(cortejoOrigenId, datos, orgId));

export const setUsuarioActivo = (orgId, usuario, activo) =>
  isSupabaseBackend()
    ? sb.setUsuarioActivo(orgId, usuario, activo)
    : Promise.resolve(mock.setUsuarioActivoMock(orgId, usuario, activo));

export const getResumenApartados = (cortejoId, orgId) =>
  isSupabaseBackend()
    ? sb.getResumenApartados(cortejoId, orgId)
    : Promise.resolve(mock.getResumenApartados(cortejoId, orgId));

export const aplicarImportApartados = (cortejoId, orgId, filas, opts) =>
  isSupabaseBackend()
    ? sb.aplicarImportApartados(cortejoId, orgId, filas, opts)
    : Promise.resolve(mock.aplicarImportApartadosMock(cortejoId, orgId, filas, opts));

export const quitarApartados = (organizacionId, cortejoId, opts) =>
  isSupabaseBackend()
    ? sb.quitarApartados(organizacionId, cortejoId, opts)
    : Promise.resolve(mock.quitarApartadosMock(organizacionId, cortejoId, opts));

export const buscarTurnosDevoto = (organizacionId, query) =>
  isSupabaseBackend()
    ? sb.buscarTurnosDevoto(organizacionId, query)
    : Promise.resolve(mock.buscarTurnosDevotoMock(organizacionId, query));

export const updatePerfil = (userId, orgId, datos, email) =>
  isSupabaseBackend()
    ? sb.updatePerfilSupabase(userId, orgId, datos, email)
    : Promise.resolve(mock.updatePerfilMock(userId, orgId, datos));

export const fetchPerfilByAuthId = (authUserId) =>
  isSupabaseBackend() ? sb.fetchPerfilByAuthId(authUserId) : Promise.resolve(null);

export const listOrganizacionesPlataforma = () =>
  isSupabaseBackend()
    ? sb.listOrganizacionesPlataforma()
    : Promise.resolve([]);

export const setOrganizacionActiva = (orgId) =>
  isSupabaseBackend() ? sb.setOrganizacionActiva(orgId) : Promise.resolve({ ok: true });

export const crearOrganizacionPlataforma = (payload) =>
  isSupabaseBackend()
    ? sb.crearOrganizacionPlataforma(payload)
    : Promise.resolve({ error: 'Solo con Supabase' });

/** Solo modo mock */
export const getStore = () => mock.getStore();
