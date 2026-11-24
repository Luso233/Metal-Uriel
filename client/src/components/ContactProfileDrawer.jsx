import React, { useState, useEffect } from 'react';
import { resolveApiUrl } from '../utils/serverConnection.js';

const KANBAN_STAGES = [
  { id: 'nuevo', label: 'Nuevo', icon: '🆕', activeClass: 'bg-sky-500/20 border-sky-400 text-sky-200' },
  { id: 'contactado', label: 'Contactado', icon: '🤝', activeClass: 'bg-indigo-500/20 border-indigo-400 text-indigo-200' },
  { id: 'en_proceso', label: 'En Proceso', icon: '📋', activeClass: 'bg-amber-500/20 border-amber-400 text-amber-200' },
  { id: 'inscrito', label: 'Inscrito', icon: '🏆', activeClass: 'bg-emerald-500/25 border-emerald-400 text-emerald-200' },
  { id: 'no_interesado', label: 'No Interesado', icon: '✖️', activeClass: 'bg-rose-500/20 border-rose-400 text-rose-200' }
];

const STATUS_BADGE_MAP = {
  nuevo: { label: 'Nuevo Prospecto', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  contactado: { label: 'Contactado', cls: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
  en_proceso: { label: 'En Proceso', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  inscrito: { label: '🏆 Inscrito (Caso de Éxito)', cls: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/60' },
  no_interesado: { label: 'No Interesado', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' }
};

export default function ContactProfileDrawer({
  isOpen,
  onClose,
  conversation,
  authToken,
  onRefreshData,
  onToast
}) {
  const [movingStage, setMovingStage] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [togglingFlag, setTogglingFlag] = useState(false);
  const [showFinalizeForm, setShowFinalizeForm] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const [finalStage, setFinalStage] = useState('inscrito');
  const [finalNombre, setFinalNombre] = useState('');
  const [finalCarrera, setFinalCarrera] = useState('');
  const [finalNotas, setFinalNotas] = useState('');
  const [finalArchivar, setFinalArchivar] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen || !conversation) return;
    const ld = conversation.leadData || {};
    setFinalStage(conversation.estado_prospecto === 'inscrito' ? 'inscrito' : 'inscrito');
    setFinalNombre(
      ld.nombre_completo && !/^prospecto whatsapp/i.test(ld.nombre_completo)
        ? ld.nombre_completo
        : ''
    );
    setFinalCarrera(
      ld.carrera_interes && !/por definir/i.test(ld.carrera_interes)
        ? ld.carrera_interes
        : ''
    );
    setFinalNotas(ld.notas_asesor || '');
    setFinalArchivar(false);
    setShowFinalizeForm(false);
    setFormError('');
  }, [isOpen, conversation?.canonicalPhone, conversation?.phone]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !conversation) return null;

  const lead = conversation.leadData || {};
  const comp = conversation.completeness || {
    completedCount: 0,
    totalFields: 11,
    percent: 0,
    missingFields: [],
    isIncomplete: true,
    stalledLabel: 'Reciente',
    aiSituationPreview: 'Sin resumen disponible todavía.'
  };
  const statusInfo = STATUS_BADGE_MAP[conversation.estado_prospecto] || STATUS_BADGE_MAP.nuevo;
  const phoneId = conversation.canonicalPhone || conversation.phone;
  const initials = String(conversation.name || 'A')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || 'A';

  const authHeaders = authToken
    ? { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };

  const notify = (msg, type = 'success') => {
    if (onToast) onToast(msg, type);
  };

  const handleMoveKanban = async (nextStage) => {
    if (movingStage || nextStage === conversation.estado_prospecto) return;
    setMovingStage(true);
    try {
      if (lead.id) {
        const res = await fetch(resolveApiUrl(`/api/aspirantes/${lead.id}/status`), {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ estado_prospecto: nextStage })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error moviendo etapa Kanban');
      } else {
        const res = await fetch(resolveApiUrl(`/api/conversations/${encodeURIComponent(phoneId)}/finalize`), {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            estado_prospecto: nextStage,
            nombre_completo: conversation.name,
            carrera_interes: conversation.carrera
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error actualizando etapa');
      }
      notify(
        nextStage === 'inscrito'
          ? '🏆 Aspirante movido a INSCRITO y resguardado como Caso de Éxito.'
          : `📊 Movido a etapa "${nextStage.replace('_', ' ')}" en Kanban.`
      );
      await onRefreshData?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setMovingStage(false);
    }
  };

  const handleToggleFlags = async (patch) => {
    if (togglingFlag) return;
    setTogglingFlag(true);
    try {
      const res = await fetch(resolveApiUrl(`/api/conversations/${encodeURIComponent(phoneId)}/highlight`), {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify(patch)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la conversación.');
      if (patch.conversacion_destacada !== undefined) {
        notify(patch.conversacion_destacada ? '🏆 Marcada como Caso de Estudio permanente.' : 'Removida de Casos de Estudio.');
      } else if (patch.archivado !== undefined) {
        notify(patch.archivado ? '🗄️ Conversación archivada correctamente.' : '📂 Conversación restaurada a bandeja activa.');
      }
      await onRefreshData?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setTogglingFlag(false);
    }
  };

  const handleFinalizeSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFinalizing(true);
    try {
      const res = await fetch(resolveApiUrl(`/api/conversations/${encodeURIComponent(phoneId)}/finalize`), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          estado_prospecto: finalStage,
          nombre_completo: finalNombre.trim() || undefined,
          carrera_interes: finalCarrera.trim() || undefined,
          notas_asesor: finalNotas.trim(),
          archivar: finalArchivar
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo finalizar el proceso.');
      notify(data.message || 'Proceso finalizado manualmente.');
      setShowFinalizeForm(false);
      await onRefreshData?.();
    } catch (err) {
      setFormError(err.message);
      notify(err.message, 'error');
    } finally {
      setFinalizing(false);
    }
  };

  const handleExportZip = async () => {
    if (exportingZip) return;
    setExportingZip(true);
    try {
      const res = await fetch(resolveApiUrl(`/api/conversations/${encodeURIComponent(phoneId)}/export-zip`), {
        method: 'GET',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });
      if (!res.ok) {
        let msg = `Error HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j.error) msg = j.error;
        } catch (_) {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const disp = res.headers.get('Content-Disposition') || '';
      const fnMatch = disp.match(/filename="?([^"]+)"?/i);
      const fileName = fnMatch ? fnMatch[1] : `MetalUriel_Chat_${phoneId}.zip`;

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
      notify(`📦 ZIP exportado: ${fileName}`);
    } catch (err) {
      notify(`Error exportando ZIP: ${err.message}`, 'error');
    } finally {
      setExportingZip(false);
    }
  };

  const msgs = conversation.messages || [];
  const totalCount = conversation.totalMessages || msgs.length;
  const userMsgCount = msgs.filter((m) => m.sender === 'user').length;
  const botMsgCount = msgs.filter((m) => m.sender === 'bot').length;
  const advisorMsgCount = msgs.filter((m) => m.sender === 'advisor').length;

  return (
    <div
      className="fixed inset-0 z-[65] flex justify-end bg-slate-950/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <aside className="w-full max-w-md h-full bg-[#0B1220] border-l border-slate-700/80 shadow-2xl flex flex-col overflow-hidden">
        {/* Cabecera estilo Info del Contacto WhatsApp */}
        <header className="shrink-0 px-4 py-3.5 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar información del postulante"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 flex items-center justify-center text-base font-bold transition"
            >
              ←
            </button>
            <div className="min-w-0">
              <h2 id="contact-drawer-title" className="text-sm sm:text-base font-black text-white truncate">
                Info del Postulante
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Expediente auditado • {totalCount} {totalCount === 1 ? 'mensaje' : 'mensajes'}
              </p>
            </div>
          </div>
          <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusInfo.cls}`}>
            {statusInfo.label}
          </span>
        </header>

        {/* Cuerpo scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Tarjeta principal de identidad */}
          <section className="rounded-2xl bg-[#111B2E] border border-slate-800 p-4 flex flex-col items-center text-center gap-2">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black shadow-lg ${
                conversation.isGoldenCase
                  ? 'bg-gradient-to-br from-amber-400 via-yellow-500 to-emerald-500 text-slate-950 ring-4 ring-amber-400/40'
                  : 'bg-gradient-to-br from-sky-500 to-indigo-600 text-white ring-2 ring-slate-700'
              }`}
            >
              {initials}
            </div>
            <div>
              <h3 className="text-lg font-black text-white leading-tight">{conversation.name}</h3>
              <p className="text-xs font-mono text-sky-300 mt-0.5">{conversation.phone}</p>
              <p className="text-xs text-amber-300 font-semibold mt-1">
                🎓 {conversation.carrera || 'Carrera por definir'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                📍 {conversation.campus || 'Campeche'} • {conversation.modalidad || 'Presencial'} • Ciclo {conversation.ciclo_escolar || '2026-3'}
              </p>
            </div>

            {conversation.isGoldenCase && (
              <div className="w-full mt-1 p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-left text-xs text-amber-200 leading-snug">
                <div className="font-black text-amber-300">🏆 Conversación de Éxito (Archivo de Estudio)</div>
                <p className="text-[11px] text-amber-100/80 mt-0.5">
                  Resguardada permanentemente para analizar las estrategias que lograron convencer e inscribir al postulante.
                </p>
              </div>
            )}

            {conversation.cerrado_manualmente && (
              <div className="w-full px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-[11px] text-emerald-300">
                ✅ Finalizado manualmente por <strong>{conversation.cerrado_por || 'Asesor UNID'}</strong>
              </div>
            )}
          </section>

          {/* Preview de Situación Actual generado por IA + Detector de Inconclusas */}
          <section className="rounded-2xl bg-gradient-to-br from-indigo-950/70 to-slate-900 border border-indigo-500/35 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-indigo-300">
                🧠 Situación de Admisión (Preview IA)
              </span>
              {comp.isIncomplete ? (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    comp.urgency === 'alta'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : comp.urgency === 'media'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                  }`}
                >
                  ⏳ Inconclusa ({comp.stalledLabel})
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  ✓ Ficha Completa
                </span>
              )}
            </div>

            <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
              {comp.aiSituationPreview}
            </p>

            {/* Barra de completitud 11 datos */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-semibold">Avance de datos oficiales UNID</span>
                <span className="font-black text-white">
                  {comp.completedCount}/{comp.totalFields} ({comp.percent}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    comp.percent >= 80
                      ? 'bg-emerald-400'
                      : comp.percent >= 45
                      ? 'bg-amber-400'
                      : 'bg-rose-400'
                  }`}
                  style={{ width: `${Math.max(4, comp.percent)}%` }}
                />
              </div>
              {comp.missingFields?.length > 0 && comp.isIncomplete && (
                <p className="text-[11px] text-slate-400 leading-snug">
                  <strong className="text-amber-300">Faltan:</strong> {comp.missingFields.join(', ')}.
                </p>
              )}
            </div>
          </section>

          {/* Mover directamente en el Kanban */}
          <section className="rounded-2xl bg-[#111B2E] border border-slate-800 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
                📊 Mover en Tablero Kanban
              </h4>
              {movingStage && <span className="text-[11px] text-amber-300">Guardando...</span>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {KANBAN_STAGES.map((stage) => {
                const isActive = conversation.estado_prospecto === stage.id;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    disabled={movingStage}
                    onClick={() => handleMoveKanban(stage.id)}
                    className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      isActive
                        ? `${stage.activeClass} ring-2 ring-white/25`
                        : 'bg-slate-900/70 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{stage.icon}</span>
                    <span className="truncate">{stage.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Acciones Principales: Exportar ZIP estilo WhatsApp + Finalizar a Mano */}
          <section className="rounded-2xl bg-[#111B2E] border border-slate-800 p-4 space-y-2.5">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
              ⚡ Acciones del Asesor
            </h4>

            {/* Exportar ZIP estilo WhatsApp */}
            <button
              type="button"
              disabled={exportingZip}
              onClick={handleExportZip}
              className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-slate-950 font-black text-sm shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-60"
            >
              <span>{exportingZip ? '⏳ Generando ZIP...' : '📦 Exportar Conversación (.ZIP)'}</span>
            </button>
            <p className="text-[11px] text-slate-400 text-center leading-snug">
              Incluye <code className="text-emerald-300">Chat_WhatsApp.txt</code> con fechas y roles,{' '}
              <code className="text-sky-300">expediente_auditoria.json</code>, resumen y adjuntos enviados.
            </p>

            {/* Botón Finalizar Proceso a Mano */}
            <button
              type="button"
              onClick={() => setShowFinalizeForm((v) => !v)}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#FFC72C] to-amber-500 hover:brightness-110 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition"
            >
              <span>{showFinalizeForm ? '▲ Ocultar Cierre Manual' : '✅ Finalizar Proceso a Mano'}</span>
            </button>

            {/* Formulario inline de Finalización Manual */}
            {showFinalizeForm && (
              <form
                noValidate
                onSubmit={handleFinalizeSubmit}
                className="mt-2 p-3.5 rounded-xl bg-slate-950/90 border border-amber-500/40 space-y-3"
              >
                <p className="text-[11px] text-amber-200 leading-snug">
                  Cierra el expediente aunque el bot no haya terminado de recopilar todos los datos. La IA se pausará automáticamente y quedará registrado en la auditoría.
                </p>

                <div className="flex flex-col gap-1">
                  <label htmlFor="fin-stage" className="text-xs font-bold text-slate-200">
                    Resultado de Cierre
                  </label>
                  <select
                    id="fin-stage"
                    value={finalStage}
                    onChange={(e) => setFinalStage(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl bg-[#0F172A] border border-slate-600 px-3 text-xs text-white"
                  >
                    <option value="inscrito">🏆 Inscrito (Guardar como Caso de Estudio)</option>
                    <option value="en_proceso">📋 En Proceso (Cierre parcial en campus)</option>
                    <option value="contactado">🤝 Contactado</option>
                    <option value="no_interesado">✖️ No Interesado</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="fin-nombre" className="text-xs font-bold text-slate-300">
                      Nombre (opcional)
                    </label>
                    <input
                      id="fin-nombre"
                      type="text"
                      value={finalNombre}
                      onChange={(e) => setFinalNombre(e.target.value)}
                      placeholder="Nombre completo"
                      className="w-full min-h-[40px] rounded-xl bg-[#0F172A] border border-slate-600 px-3 text-xs text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="fin-carrera" className="text-xs font-bold text-slate-300">
                      Carrera (opcional)
                    </label>
                    <input
                      id="fin-carrera"
                      type="text"
                      value={finalCarrera}
                      onChange={(e) => setFinalCarrera(e.target.value)}
                      placeholder="Ej. Derecho / Sistemas"
                      className="w-full min-h-[40px] rounded-xl bg-[#0F172A] border border-slate-600 px-3 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="fin-notas" className="text-xs font-bold text-slate-300">
                    Notas de Cierre del Asesor
                  </label>
                  <textarea
                    id="fin-notas"
                    rows={2}
                    value={finalNotas}
                    onChange={(e) => setFinalNotas(e.target.value)}
                    placeholder="Ej. Acudió a campus, entregó acta y pagó inscripción."
                    className="w-full rounded-xl bg-[#0F172A] border border-slate-600 p-2.5 text-xs text-white"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none min-h-[36px]">
                  <input
                    type="checkbox"
                    checked={finalArchivar}
                    onChange={(e) => setFinalArchivar(e.target.checked)}
                    className="w-4 h-4 rounded accent-amber-400"
                  />
                  <span>Archivar conversación de la bandeja activa al finalizar</span>
                </label>

                {formError && (
                  <p role="alert" className="text-xs text-rose-400 font-semibold">
                    ❌ {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={finalizing}
                  className="w-full min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition disabled:opacity-60"
                >
                  {finalizing ? '⏳ Guardando cierre...' : '💾 Confirmar Finalización Manual'}
                </button>
              </form>
            )}

            {/* Botones secundarios: Caso de Estudio + Archivar */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={togglingFlag || !lead.id}
                onClick={() => handleToggleFlags({ conversacion_destacada: !conversation.isGoldenCase })}
                className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold transition disabled:opacity-40 ${
                  conversation.isGoldenCase
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {conversation.isGoldenCase ? '🏆 En Estudio' : '⭐ Destacar'}
              </button>
              <button
                type="button"
                disabled={togglingFlag || !lead.id}
                onClick={() => handleToggleFlags({ archivado: !conversation.archivado })}
                className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold transition disabled:opacity-40 ${
                  conversation.archivado
                    ? 'bg-indigo-500/20 border-indigo-400 text-indigo-200'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {conversation.archivado ? '📂 Desarchivar' : '🗄️ Archivar'}
              </button>
            </div>
          </section>

          {/* Datos Clave y Métricas de Auditoría */}
          <section className="rounded-2xl bg-[#111B2E] border border-slate-800 p-4 space-y-2.5">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
              📋 Ficha Relevante y Auditoría
            </h4>
            <dl className="grid grid-cols-1 gap-2 text-xs">
              <div className="flex justify-between gap-2 border-b border-slate-800/80 pb-1.5">
                <dt className="text-slate-400">Correo</dt>
                <dd className="text-slate-100 font-medium text-right truncate">{lead.correo_electronico || 'Pendiente'}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-800/80 pb-1.5">
                <dt className="text-slate-400">CURP</dt>
                <dd className="text-sky-300 font-mono text-right">{lead.curp || 'Pendiente'}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-800/80 pb-1.5">
                <dt className="text-slate-400">Bachillerato</dt>
                <dd className="text-slate-100 text-right truncate">{lead.bachillerato_procedencia || 'Pendiente'}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-800/80 pb-1.5">
                <dt className="text-slate-400">Nacimiento / Sexo</dt>
                <dd className="text-slate-100 text-right">
                  {lead.fecha_nacimiento || 'Pendiente'} {lead.sexo ? `• ${lead.sexo}` : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-800/80 pb-1.5">
                <dt className="text-slate-400">Dirección / CP</dt>
                <dd className="text-slate-100 text-right truncate">
                  {lead.direccion || 'Pendiente'} {lead.codigo_postal ? `(CP ${lead.codigo_postal})` : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-2 pt-0.5">
                <dt className="text-slate-400">Auditoría Mensajes</dt>
                <dd className="text-slate-200 font-semibold text-right">
                  👤 {userMsgCount} • 🤖 {botMsgCount} • 🧑‍💼 {advisorMsgCount}
                </dd>
              </div>
            </dl>
            {lead.notas_asesor && (
              <div className="mt-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
                <span className="font-bold text-amber-300">📝 Notas del Asesor: </span>
                {lead.notas_asesor}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
