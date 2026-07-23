/**
 * Marca entrega física (RPC) y encola correo de confirmación en background.
 * Acepta un brazo (brazoId) o varios del mismo recibo (brazoIds).
 */
import { createClient } from '@supabase/supabase-js';
import { verifyOrgMember } from './_lib/verifyOrgMember.js';
import { getSupabaseConfig } from './_lib/verifyCaller.js';
import {
  encolarCorreoEntrega,
  programarCorreoEntregaEnBackground,
} from './_lib/correoEntregaJob.js';

async function marcarBrazosEntregados(userClient, ids, esTercero, receptor) {
  const resultados = await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await userClient.rpc('marcar_entregado_brazo', {
        p_brazo_id: id,
        p_entregado_a_tercero: esTercero,
        p_entregado_receptor_nombre: esTercero ? receptor : null,
      });
      return { id, data, error };
    })
  );

  const brazosEntregados = [];
  for (const r of resultados) {
    if (r.error) {
      const msg = r.error.message || 'No se pudo marcar entregado';
      if (brazosEntregados.length) {
        return {
          error: `${msg} (${brazosEntregados.length} de ${ids.length} ya se marcaron entregados)`,
          brazos: brazosEntregados,
          status: 400,
        };
      }
      return { error: msg, status: 400 };
    }
    brazosEntregados.push(r.data);
  }

  return { brazos: brazosEntregados };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const {
      organizacionId,
      brazoId,
      brazoIds,
      entregado_a_tercero,
      entregado_receptor_nombre,
      enviarCorreo,
    } = req.body || {};

    const ids = Array.isArray(brazoIds) && brazoIds.length ? brazoIds : brazoId ? [brazoId] : [];

    if (!organizacionId || !ids.length) {
      return res.status(400).json({ error: 'organizacionId y al menos un brazo son obligatorios' });
    }

    const member = await verifyOrgMember(req, organizacionId);
    if (member.error) {
      return res.status(member.status).json({ error: member.error });
    }

    const esTercero = Boolean(entregado_a_tercero);
    const receptor = esTercero ? String(entregado_receptor_nombre || '').trim() : '';
    if (esTercero && !receptor) {
      return res.status(400).json({ error: 'Indique el nombre de quien recibe el turno (tercero).' });
    }

    const { admin } = member;

    const { url, anonKey } = getSupabaseConfig();
    if (!url || !anonKey) {
      return res.status(500).json({ error: 'Supabase no configurado en el servidor.' });
    }

    const userClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: req.headers.authorization || '' },
      },
    });

    const marcado = await marcarBrazosEntregados(userClient, ids, esTercero, receptor);
    if (marcado.error) {
      return res.status(marcado.status || 400).json({
        error: marcado.error,
        brazos: marcado.brazos,
      });
    }

    const brazosEntregados = marcado.brazos;
    let correo = { ok: false, omitido: true, motivo: 'Correo no solicitado' };

    if (enviarCorreo) {
      try {
        const colaId = await encolarCorreoEntrega(admin, organizacionId, {
          brazosEntregados,
          esTercero,
          receptor,
        });

        programarCorreoEntregaEnBackground(null, admin, organizacionId, {
          colaId,
          brazosEntregados,
          esTercero,
          receptor,
        });

        correo = {
          encolado: true,
          ok: true,
          mensaje: 'Correo de confirmación en cola — se enviará en breve.',
        };
      } catch (err) {
        console.error('[confirmar-entrega] cola correo:', err?.message || err);
        correo = {
          encolado: false,
          ok: false,
          error: err?.message || 'No se pudo encolar el correo de confirmación.',
        };
      }
    }

    return res.status(200).json({
      data: brazosEntregados.length === 1 ? brazosEntregados[0] : brazosEntregados,
      brazos: brazosEntregados,
      correo,
    });
  } catch (err) {
    console.error('[confirmar-entrega] error:', err?.message || err);
    return res.status(500).json({
      error: err?.message || 'Error interno al confirmar la entrega.',
    });
  }
}
