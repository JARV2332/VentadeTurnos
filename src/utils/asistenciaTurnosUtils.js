/**
 * Reporte de asistencia por turno: ordinario/extraordinario, nombre y casilla.
 */
import { labelTipoTurno } from './cajaReportUtils';
import { nombreAsignado } from './listadoTurnosUtils';

const ORDEN_LADO = { Izquierda: 1, Derecha: 2, Centro: 3 };

function brazosDeTurno(turnoGrupo) {
  return [...(turnoGrupo.izquierda || []), ...(turnoGrupo.derecha || [])];
}

function esAsignado(brazo) {
  return (
    brazo?.estado === 'vendido' ||
    (brazo?.estado === 'reservado' && brazo?.reserva_apartado)
  );
}

/**
 * Filas planas para pasar asistencia, ordenadas por turno → lado → brazo.
 * filtros:
 *  - tiposTurno: string[] — vacío = todos los tipos
 *  - numerosTurno: number[]|string[] — vacío = ninguno (hay que marcar turnos)
 *  - soloAsignados: boolean (default true)
 */
export function construirFilasAsistencia(turnosAgrupados = [], filtros = {}) {
  const filas = [];

  const tiposSel = normalizarListaFiltro(
    filtros.tiposTurno ??
      (filtros.tipoTurno && filtros.tipoTurno !== 'all' ? [filtros.tipoTurno] : null)
  );
  const numerosSel = normalizarListaFiltro(
    filtros.numerosTurno ??
      (filtros.numeroTurno?.toString?.().trim() ? [filtros.numeroTurno] : null)
  ).map((n) => String(n));

  // Sin números seleccionados → lista vacía (el UI marca todos por defecto).
  if (!numerosSel.length && (filtros.numerosTurno != null || filtros.requireNumeros)) {
    return filas;
  }

  (turnosAgrupados || [])
    .filter((turno) => {
      if (tiposSel.length && !tiposSel.includes(turno.tipo_turno || '')) {
        return false;
      }
      if (numerosSel.length && !numerosSel.includes(String(turno.numero_turno))) {
        return false;
      }
      return true;
    })
    .sort((a, b) => (a.numero_turno || 0) - (b.numero_turno || 0))
    .forEach((turno) => {
      const brazos = brazosDeTurno(turno)
        .filter((brazo) => (filtros.soloAsignados === false ? true : esAsignado(brazo)))
        .sort((a, b) => {
          const la = ORDEN_LADO[a.lado] || 9;
          const lb = ORDEN_LADO[b.lado] || 9;
          if (la !== lb) return la - lb;
          return (a.numero_brazo || 0) - (b.numero_brazo || 0);
        });

      brazos.forEach((brazo) => {
        const cargador = brazo.cargador || null;
        filas.push({
          id: brazo.id,
          numeroTurno: turno.numero_turno,
          tipoTurno: turno.tipo_turno || '',
          tipoLabel: labelTipoTurno(turno.tipo_turno),
          etiqueta: turno.etiqueta || '',
          horaEstimada: turno.hora_estimada || '',
          lado: brazo.lado || '',
          numeroBrazo: brazo.numero_brazo,
          brazoLabel: `${brazo.numero_brazo ?? '—'} ${brazo.lado || ''}`.trim(),
          nombre: nombreAsignado(brazo, cargador),
          telefono: cargador?.whatsapp || '',
        });
      });
    });

  return filas;
}

function normalizarListaFiltro(valor) {
  if (valor == null) return [];
  if (Array.isArray(valor)) {
    return valor.map((v) => String(v).trim()).filter(Boolean);
  }
  if (valor instanceof Set) return [...valor].map((v) => String(v).trim()).filter(Boolean);
  const s = String(valor).trim();
  return s && s !== 'all' ? [s] : [];
}

/** Catálogo de turnos para el selector (número + tipo). */
export function catalogoTurnosAsistencia(turnosAgrupados = []) {
  return (turnosAgrupados || [])
    .map((t) => ({
      numero: t.numero_turno,
      tipo: t.tipo_turno || '',
      tipoLabel: labelTipoTurno(t.tipo_turno),
      etiqueta: t.etiqueta || '',
      horaEstimada: t.hora_estimada || '',
    }))
    .sort((a, b) => (a.numero || 0) - (b.numero || 0));
}

export const TIPOS_FILTRO_RAPIDO = [
  { id: 'all', label: 'Todos los tipos' },
  { id: 'Ordinario', label: 'Solo ordinarios' },
  { id: 'Extraordinario', label: 'Solo extraordinarios' },
  { id: 'Entrada', label: 'Solo entrada' },
  { id: 'Salida', label: 'Solo salida' },
];

export function agruparFilasAsistenciaPorTurno(filas = []) {
  const map = new Map();
  (filas || []).forEach((f) => {
    const key = String(f.numeroTurno);
    if (!map.has(key)) {
      map.set(key, {
        numero: f.numeroTurno,
        tipoLabel: f.tipoLabel,
        etiqueta: f.etiqueta,
        horaEstimada: f.horaEstimada,
        filas: [],
      });
    }
    map.get(key).filas.push(f);
  });
  return [...map.values()].sort((a, b) => (a.numero || 0) - (b.numero || 0));
}

export function resumenAsistencia(filas = []) {
  const porTipo = {};
  (filas || []).forEach((f) => {
    const t = f.tipoLabel || 'Sin tipo';
    porTipo[t] = (porTipo[t] || 0) + 1;
  });
  return {
    total: filas.length,
    turnos: new Set((filas || []).map((f) => f.numeroTurno)).size,
    porTipo,
  };
}

export function tiposTurnoEnLista(turnosAgrupados = []) {
  const set = new Set();
  (turnosAgrupados || []).forEach((t) => {
    if (t.tipo_turno) set.add(t.tipo_turno);
  });
  const orden = ['Salida', 'Ordinario', 'Extraordinario', 'Entrada'];
  return [...set].sort((a, b) => {
    const ia = orden.indexOf(a);
    const ib = orden.indexOf(b);
    if (ia === -1 && ib === -1) return String(a).localeCompare(String(b), 'es');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function filtrosAsistenciaTexto(filtros = {}) {
  const partes = [];
  const tipos = normalizarListaFiltro(
    filtros.tiposTurno ??
      (filtros.tipoTurno && filtros.tipoTurno !== 'all' ? [filtros.tipoTurno] : null)
  );
  if (tipos.length) {
    partes.push(`Tipo: ${tipos.map((t) => labelTipoTurno(t)).join(', ')}`);
  }
  const numeros = normalizarListaFiltro(
    filtros.numerosTurno ??
      (filtros.numeroTurno?.toString?.().trim() ? [filtros.numeroTurno] : null)
  );
  if (numeros.length) {
    const ordenados = [...numeros].sort((a, b) => Number(a) - Number(b));
    partes.push(
      ordenados.length <= 12
        ? `Turnos: ${ordenados.map((n) => `#${n}`).join(', ')}`
        : `${ordenados.length} turnos seleccionados`
    );
  }
  if (filtros.soloAsignados !== false) partes.push('Solo asignados');
  return partes.length ? partes.join(' · ') : 'Todos';
}

function buildAsistenciaHtml({
  grupos,
  cortejoNombre,
  orgNombre = '',
  filtros = {},
  incluirFirma = true,
}) {
  const generado = new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  const totalFilas = (grupos || []).reduce((s, g) => s + g.filas.length, 0);
  const org = escapeHtml(orgNombre || 'Organización');
  const procesion = escapeHtml(cortejoNombre || 'Procesión');
  const filtrosLinea = escapeHtml(filtrosAsistenciaTexto(filtros));

  const bloques = (grupos || [])
    .map((g) => {
      const hora = g.horaEstimada ? ` · ${escapeHtml(g.horaEstimada)}` : '';
      const etiq = g.etiqueta ? ` · ${escapeHtml(g.etiqueta)}` : '';
      return `
    <section class="grupo">
      <h2>
        Turno #${escapeHtml(g.numero)}
        · <span class="tipo">${escapeHtml(g.tipoLabel || '')}</span>${etiq}${hora}
        <span class="grupo-count">${g.filas.length}</span>
      </h2>
      <table>
        <thead>
          <tr>
            <th class="col-n">#</th>
            <th class="col-brazo">Brazo</th>
            <th class="col-nombre">Devoto</th>
            <th class="col-check">Asistió</th>
            ${incluirFirma ? '<th class="col-firma">Firma</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${g.filas
            .map(
              (f, idx) => `
            <tr>
              <td class="col-n">${idx + 1}</td>
              <td class="col-brazo">${escapeHtml(f.brazoLabel)}</td>
              <td class="col-nombre">${escapeHtml(f.nombre)}</td>
              <td class="col-check"><span class="box"></span></td>
              ${incluirFirma ? '<td class="col-firma"></td>' : ''}
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Asistencia turnos — ${procesion}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 8mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 0;
      font-size: 11px;
      line-height: 1.35;
    }
    h1 { font-size: 15px; margin: 0 0 4px; font-weight: 700; }
    .meta {
      color: #475569;
      margin: 0 0 12px;
      font-size: 10px;
      line-height: 1.4;
      padding-bottom: 8px;
      border-bottom: 1px solid #cbd5e1;
    }
    .meta strong { color: #0f172a; }
    .toolbar {
      padding: 10px 12px;
      margin-bottom: 12px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      font-size: 12px;
    }
    .toolbar button {
      margin-top: 6px;
      padding: 6px 12px;
      font-size: 13px;
      cursor: pointer;
    }
    .grupo {
      margin-bottom: 14px;
      page-break-inside: avoid;
    }
    h2 {
      font-size: 12px;
      margin: 0 0 6px;
      padding: 5px 8px;
      background: #f1f5f9;
      border-left: 3px solid #0f172a;
      font-weight: 700;
    }
    h2 .tipo { color: #1d4ed8; }
    .grupo-count {
      float: right;
      font-weight: 600;
      color: #64748b;
      font-size: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
      table-layout: fixed;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th, td {
      border: 1px solid #94a3b8;
      padding: 5px 6px;
      text-align: left;
      vertical-align: middle;
    }
    th {
      background: #e2e8f0;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      font-weight: 700;
    }
    .col-n { width: 6%; text-align: center; }
    .col-brazo { width: 14%; }
    .col-nombre { width: ${incluirFirma ? '42%' : '60%'}; }
    .col-check { width: 12%; text-align: center; }
    .col-firma { width: 26%; }
    .box {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 1.5px solid #0f172a;
      border-radius: 2px;
      vertical-align: middle;
    }
    @media print {
      .toolbar { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <strong>Lista de asistencia lista</strong> — Para PDF: <strong>Ctrl+P</strong> → Destino: <em>Guardar como PDF</em>.
    <br/>
    <button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
  <h1>Lista de asistencia por turno</h1>
  <p class="meta">
    <strong>${org}</strong> · ${procesion}<br/>
    ${filtrosLinea} · ${totalFilas} persona(s) · ${escapeHtml(generado)}
  </p>
  ${bloques || '<p>Sin registros.</p>'}
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 400);
    });
  </script>
</body>
</html>`;
}

function imprimirHtmlEnIframe(html) {
  let iframe = document.getElementById('asistencia-turnos-print-frame');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'asistencia-turnos-print-frame';
    iframe.title = 'Asistencia turnos';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
  }

  iframe.srcdoc = html;
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Print iframe asistencia turnos:', err);
        const w = window.open('', '_blank');
        if (w) {
          w.document.write(html);
          w.document.close();
        }
      }
    }, 200);
  };
}

export function exportAsistenciaTurnosPdf({
  filas,
  cortejoNombre,
  orgNombre,
  filtros,
  incluirFirma = true,
}) {
  const grupos = agruparFilasAsistenciaPorTurno(filas);
  const html = buildAsistenciaHtml({
    grupos,
    cortejoNombre,
    orgNombre,
    filtros,
    incluirFirma,
  });
  imprimirHtmlEnIframe(html);
}
