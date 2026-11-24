import React, { useState, useEffect, useCallback } from 'react';
import { resolveApiUrl } from '../utils/serverConnection.js';

const AUDIT_CATEGORIES = [
  { id: 'all', label: 'Todas', icon: '📋' },
  { id: 'AUTH', label: 'Accesos / Logins', icon: '🔐' },
  { id: 'USUARIOS', label: 'Usuarios', icon: '👥' },
  { id: 'API_KEYS', label: 'API Keys / Claves', icon: '🔑' },
  { id: 'IA_MODELO', label: 'IA / Prompt', icon: '🤖' },
  { id: 'ASPIRANTES', label: 'Aspirantes / ZIP', icon: '🎓' },
  { id: 'SEDES', label: 'Sedes', icon: '🏛️' },
  { id: 'BASE_DATOS', label: 'Base de Datos', icon: '🗄️' }
];

const SEVERITY_BADGE = {
  critical: { label: 'CRÍTICO', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  warning: { label: 'ALERTA', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  info: { label: 'INFO', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/35' }
};

function formatAuditDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

export default function AuditLogViewer({ authToken, onToast }) {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [source, setSource] = useState('mariadb');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const [categoria, setCategoria] = useState('all');
  const [severidad, setSeveridad] = useState('all');
  const [search, setSearch] = useState('');

  const loadLogs = useCallback(async (opts = {}) => {
    setLoading(true);
    setError('');
    try {
      const cat = opts.categoria ?? categoria;
      const sev = opts.severidad ?? severidad;
      const q = opts.search ?? search;
      const params = new URLSearchParams({ limit: '250' });
      if (cat && cat !== 'all') params.set('categoria', cat);
      if (sev && sev !== 'all') params.set('severidad', sev);
      if (q && q.trim()) params.set('search', q.trim());

      const res = await fetch(resolveApiUrl(`/api/audit-logs?${params.toString()}`), {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Error HTTP ${res.status}`);
      }
      setLogs(data.logs || []);
      setSummary(data.summary || null);
      setSource(data.source || 'mariadb');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authToken, categoria, severidad, search]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadLogs();
    }, 180);
    return () => clearTimeout(t);
  }, [categoria, severidad, search, loadLogs]);

  const handleExportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (categoria !== 'all') params.set('categoria', categoria);
      if (severidad !== 'all') params.set('severidad', severidad);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(resolveApiUrl(`/api/audit-logs/export?${params.toString()}`), {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
      const blob = await res.blob();
      const fileName = `auditoria_metal_uriel_${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
      onToast?.(`📥 Bitácora exportada: ${fileName}`);
      loadLogs();
    } catch (err) {
      onToast?.(`Error exportando auditoría: ${err.message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Encabezado */}
        <section className="rounded-3xl bg-gradient-to-br from-[#0F1E38] via-[#111B2E] to-[#0B1220] border border-amber-400/30 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                🛡️ Seguridad & Cumplimiento
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-slate-300">
                Fuente: {source === 'mariadb' ? 'MariaDB Persistente' : 'RAM Respaldo'}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-white">
              Bitácora de Auditoría del Sistema
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl">
              Registro cronológico inmutable de inicios/cierres de sesión, altas/ediciones/bajas de usuarios, rotación de API Keys y secretos (redactados automáticamente), cambios de IA y operaciones críticas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => loadLogs()}
              disabled={loading}
              className="min-h-[42px] px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 text-xs font-bold transition"
            >
              {loading ? '⏳ Actualizando...' : '🔄 Actualizar'}
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exporting}
              className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-[#FFC72C] to-amber-500 text-slate-950 font-black text-xs shadow hover:brightness-110 transition disabled:opacity-60"
            >
              {exporting ? '⏳ Generando...' : '📥 Exportar CSV Oficial'}
            </button>
          </div>
        </section>

        {/* Tarjetas KPI */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-[#111B2E] border border-slate-800 p-3.5">
            <div className="text-[11px] text-slate-400 font-semibold">Eventos Mostrados</div>
            <div className="text-2xl font-black text-white mt-1">{summary?.total ?? logs.length}</div>
          </div>
          <div className="rounded-2xl bg-[#111B2E] border border-slate-800 p-3.5">
            <div className="text-[11px] text-sky-300 font-semibold">🔐 Accesos Hoy</div>
            <div className="text-2xl font-black text-sky-300 mt-1">{summary?.loginsToday ?? 0}</div>
          </div>
          <div className="rounded-2xl bg-[#111B2E] border border-slate-800 p-3.5">
            <div className="text-[11px] text-amber-300 font-semibold">👥 Movimientos Usuarios</div>
            <div className="text-2xl font-black text-amber-300 mt-1">{summary?.userChangesCount ?? 0}</div>
          </div>
          <div className="rounded-2xl bg-[#111B2E] border border-slate-800 p-3.5">
            <div className="text-[11px] text-rose-300 font-semibold">🔴 Críticos / API Keys</div>
            <div className="text-2xl font-black text-rose-300 mt-1">
              {summary?.criticalCount ?? 0}
              <span className="text-xs font-semibold text-slate-400 ml-1.5">
                ({summary?.apiKeyChangesCount ?? 0} keys)
              </span>
            </div>
          </div>
        </section>

        {/* Filtros */}
        <section className="rounded-2xl bg-[#111B2E] border border-slate-800 p-3.5 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {AUDIT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoria(cat.id)}
                className={`min-h-[36px] px-3 rounded-full text-xs font-bold border transition ${
                  categoria === cat.id
                    ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <label htmlFor="audit-search-input" className="sr-only">Buscar en auditoría</label>
              <input
                id="audit-search-input"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por usuario, correo, acción, IP, API key..."
                className="w-full min-h-[42px] rounded-xl bg-[#0B1220] border border-slate-700 focus:border-amber-400 px-3.5 text-xs text-white outline-none"
              />
            </div>
            <select
              aria-label="Filtrar por severidad"
              value={severidad}
              onChange={(e) => setSeveridad(e.target.value)}
              className="min-h-[42px] rounded-xl bg-[#0B1220] border border-slate-700 px-3 text-xs text-slate-200 font-bold"
            >
              <option value="all">Severidad: Todas</option>
              <option value="critical">🔴 Crítico</option>
              <option value="warning">🟡 Alerta</option>
              <option value="info">🔵 Info</option>
            </select>
          </div>
        </section>

        {error && (
          <div role="alert" className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-xs font-bold text-rose-200">
            ❌ {error}
          </div>
        )}

        {/* Lista Cronológica de Eventos */}
        <section className="space-y-2.5">
          {logs.length === 0 ? (
            <div className="rounded-2xl bg-[#111B2E] border border-slate-800 p-8 text-center text-xs text-slate-400">
              {loading ? 'Cargando eventos de auditoría...' : 'No hay eventos que coincidan con los filtros seleccionados.'}
            </div>
          ) : (
            logs.map((row) => {
              const sev = SEVERITY_BADGE[row.severidad] || SEVERITY_BADGE.info;
              return (
                <article
                  key={row.id}
                  className="rounded-2xl bg-[#111B2E] border border-slate-800 hover:border-slate-700 p-3.5 sm:p-4 space-y-2 transition"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${sev.cls}`}>
                        {sev.label}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 text-[10px] font-mono font-bold">
                        {row.categoria}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-slate-200 text-[10px] font-mono">
                        {row.accion}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      🕒 {formatAuditDate(row.created_at)}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm font-bold text-white leading-snug select-text">
                    {row.resumen}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                    <span>
                      👤 <strong className="text-slate-200">{row.actor_nombre || row.actor_email || 'Sistema'}</strong>
                      {row.actor_email ? ` (${row.actor_email})` : ''}
                      {row.actor_rol ? ` • ${row.actor_rol}` : ''}
                    </span>
                    {row.sede_id && (
                      <span>🏛️ Sede: <strong className="text-slate-300">{row.sede_id}</strong></span>
                    )}
                    {row.ip_origen && (
                      <span className="font-mono">🌐 {row.ip_origen}</span>
                    )}
                    {row.objetivo_id && (
                      <span className="font-mono text-sky-300">🎯 {row.objetivo_tipo || 'id'}: {row.objetivo_id}</span>
                    )}
                  </div>

                  {row.detalle && (
                    <details className="pt-1">
                      <summary className="cursor-pointer text-[11px] font-bold text-sky-300 hover:underline select-none">
                        🔍 Ver detalle auditado (JSON seguro)
                      </summary>
                      <pre className="mt-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[10px] font-mono text-emerald-300 overflow-x-auto select-text">
                        {typeof row.detalle === 'string' ? row.detalle : JSON.stringify(row.detalle, null, 2)}
                      </pre>
                    </details>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
