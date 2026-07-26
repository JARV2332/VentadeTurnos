/**
 * Búsqueda de boleta para entrega/ajuste — 1 llamada HTTP, consultas en servidor.
 */
import { verifyOrgMember } from './_lib/verifyOrgMember.js';
import { buscarBoletaEntrega } from './_lib/buscarBoletaEntrega.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const organizacionId = body.organizacionId;
  const codigo = body.codigo;

  if (!organizacionId || !codigo) {
    return res.status(400).json({ error: 'Faltan organizacionId o codigo.' });
  }

  const auth = await verifyOrgMember(req, organizacionId);
  if (auth.error) {
    return res.status(auth.status || 403).json({ error: auth.error });
  }

  try {
    const resultado = await buscarBoletaEntrega(auth.admin, organizacionId, codigo);
    if (resultado.error) {
      const status = /no encontrada|inválido|anulada/i.test(resultado.error) ? 404 : 400;
      return res.status(status).json({ error: resultado.error });
    }
    return res.status(200).json(resultado);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error al buscar la boleta.' });
  }
}
