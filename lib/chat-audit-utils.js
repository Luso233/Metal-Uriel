// =========================================================================
// Metal-Uriel — Auditoría Eterna de Conversaciones, Deduplicación Canónica
// de Teléfonos y Detección Inteligente de Conversaciones Inconclusas
// =========================================================================

const PLACEHOLDER_VALUE_RE = /^(prospecto whatsapp|aspirante registrado|aspirante \(|por definir|sin especificar|sin carrera|pendiente|n\/a|na|null|undefined|-+)$/i;

const OFFICIAL_FIELD_SPECS = [
    { key: 'nombre_completo', label: 'Nombre completo' },
    { key: 'fecha_nacimiento', label: 'Fecha de nacimiento' },
    { key: 'sexo', label: 'Sexo' },
    { key: 'estado_nacimiento', label: 'Estado de nacimiento' },
    { key: 'telefono_celular', label: 'Teléfono celular' },
    { key: 'correo_electronico', label: 'Correo electrónico' },
    { key: 'bachillerato_procedencia', label: 'Bachillerato de procedencia' },
    { key: 'carrera_interes', label: 'Carrera de interés' },
    { key: 'direccion', label: 'Dirección' },
    { key: 'codigo_postal', label: 'Código postal' },
    { key: 'campus_interes', label: 'Campus / Modalidad' }
];

/**
 * Normaliza cualquier representación telefónica de WhatsApp / México / E.164
 * a una clave canónica única para eliminar chats duplicados apilados.
 * Ejemplos que convergen a la MISMA clave "9818194049":
 *   - "5219818194049" (WhatsApp Cloud API MX)
 *   - "+52 1 981 819 4049"
 *   - "+52 981 819 4049"
 *   - "529818194049"
 *   - "981-819-4049"
 */
function normalizePhoneCanonical(raw) {
    if (raw === undefined || raw === null) return '';
    const str = String(raw).trim();
    if (!str) return '';
    if (str.startsWith('asp_')) return str;

    const digits = str.replace(/\D/g, '');
    if (!digits) return str.toLowerCase();

    // México móvil WhatsApp: 521 + 10 dígitos (13) o 52 + 10 dígitos (12) -> últimos 10 dígitos
    if (digits.length === 13 && digits.startsWith('521')) {
        return digits.slice(3);
    }
    if (digits.length === 12 && digits.startsWith('52')) {
        return digits.slice(2);
    }
    if (digits.length >= 10) {
        return digits.slice(-10);
    }
    return digits;
}

/**
 * Elige el mejor número marcable para Meta WhatsApp Cloud API de entre varias variantes
 * del mismo contacto (prioriza 521XXXXXXXXXX > 52XXXXXXXXXX > +52... > 10 dígitos).
 */
function pickBestDialPhone(candidates = []) {
    const valid = candidates
        .map(c => String(c || '').trim())
        .filter(c => c && !c.startsWith('asp_'));
    if (valid.length === 0) return candidates.find(Boolean) || '';

    const scored = valid.map(raw => {
        const d = raw.replace(/\D/g, '');
        let score = 0;
        if (d.length === 13 && d.startsWith('521')) score = 100;
        else if (d.length === 12 && d.startsWith('52')) score = 80;
        else if (d.length >= 11) score = 70;
        else if (d.length === 10) score = 60;
        else score = 10;
        return { raw, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].raw;
}

function isMeaningfulFieldValue(key, rawVal) {
    if (rawVal === undefined || rawVal === null) return false;
    const s = String(rawVal).trim();
    if (!s) return false;
    if (PLACEHOLDER_VALUE_RE.test(s)) return false;
    if (key === 'nombre_completo' && (/^prospecto\b/i.test(s) || /^aspirante\s*\(/i.test(s))) {
        return false;
    }
    if (key === 'carrera_interes' && /por definir|en conversaci[oó]n/i.test(s)) {
        return false;
    }
    return true;
}

function formatDurationSpanish(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '0 min';
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 1) return 'menos de 1 min';
    if (totalMin < 60) return `${totalMin} min`;
    const hours = Math.floor(totalMin / 60);
    const remMin = totalMin % 60;
    if (hours < 24) {
        return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

/**
 * Analiza completitud de los 11 campos oficiales UNID, detecta si la conversación está inconclusa,
 * cuánto tiempo lleva detenida y construye un resumen ejecutivo claro para el asesor humano.
 */
function analyzeLeadCompleteness(leadData = {}, messages = [], opts = {}) {
    const now = opts.now || Date.now();
    const d = leadData || {};
    const status = String(d.estado_prospecto || 'nuevo').toLowerCase();
    const isEnrolled = status === 'inscrito';
    const isRejected = status === 'no_interesado';
    const closedManually = Boolean(d.cerrado_manualmente);

    const completedFields = [];
    const missingFields = [];

    for (const spec of OFFICIAL_FIELD_SPECS) {
        let filled = isMeaningfulFieldValue(spec.key, d[spec.key]);
        if (spec.key === 'campus_interes' && !filled) {
            filled = isMeaningfulFieldValue('modalidad_estudios', d.modalidad_estudios);
        }
        if (filled) completedFields.push(spec.label);
        else missingFields.push(spec.label);
    }

    const completedCount = completedFields.length;
    const totalFields = OFFICIAL_FIELD_SPECS.length;
    const percent = Math.round((completedCount / totalFields) * 100);
    const isComplete = isEnrolled || closedManually || completedCount >= 9;
    const isIncomplete = !isComplete && !isRejected;

    // Calcular desde cuándo está abierta/detenida sin completar datos
    const firstMsgTs = messages.length > 0 && messages[0]?.timestamp
        ? new Date(messages[0].timestamp).getTime()
        : null;
    const lastMsgTs = messages.length > 0 && messages[messages.length - 1]?.timestamp
        ? new Date(messages[messages.length - 1].timestamp).getTime()
        : null;
    const createdTs = d.created_at ? new Date(d.created_at).getTime() : null;
    const updatedTs = d.ultimo_mensaje_at ? new Date(d.ultimo_mensaje_at).getTime() : null;

    const validLast = [lastMsgTs, updatedTs, createdTs].filter(t => Number.isFinite(t) && t > 0);
    const referenceLastTs = validLast.length > 0 ? Math.max(...validLast) : now;
    const validFirst = [firstMsgTs, createdTs].filter(t => Number.isFinite(t) && t > 0);
    const referenceFirstTs = validFirst.length > 0 ? Math.min(...validFirst) : referenceLastTs;

    const stalledMs = isIncomplete ? Math.max(0, now - referenceLastTs) : 0;
    const openDurationMs = Math.max(0, now - referenceFirstTs);
    const stalledLabel = isIncomplete ? formatDurationSpanish(stalledMs) : 'Completa';
    const openDurationLabel = formatDurationSpanish(openDurationMs);

    let urgency = 'completa';
    if (isIncomplete) {
        if (stalledMs >= 2 * 60 * 60 * 1000) urgency = 'alta';        // >= 2 horas sin completar
        else if (stalledMs >= 15 * 60 * 1000) urgency = 'media';      // >= 15 min sin completar
        else urgency = 'baja';
    } else if (isRejected) {
        urgency = 'descartada';
    }

    const needsHumanAttention = isIncomplete && (stalledMs >= 15 * 60 * 1000 || messages.length >= 6);

    // Construir preview ejecutivo comprensible para el usuario final (Asesor / Coordinador)
    const careerText = isMeaningfulFieldValue('carrera_interes', d.carrera_interes)
        ? d.carrera_interes
        : 'carrera aún por definir';
    const modText = d.modalidad_estudios || 'Presencial';
    const aiNotes = (d.resumen_ia && !/^primer contacto v[ií]a whatsapp/i.test(d.resumen_ia))
        ? ` ${d.resumen_ia.trim()}`
        : '';

    let aiSituationPreview = '';
    if (isEnrolled) {
        aiSituationPreview = `🏆 Caso de Éxito (Inscrito) en ${careerText} (${modText}). Expediente ${completedCount}/${totalFields} preservado permanentemente para estudio de cierre.${aiNotes}`;
    } else if (closedManually) {
        aiSituationPreview = `✅ Proceso finalizado manualmente en etapa "${status}" para ${careerText} (${modText}).${d.notas_asesor ? ' Notas: ' + d.notas_asesor : ''}`;
    } else if (isRejected) {
        aiSituationPreview = `Prospecto marcado como No Interesado (${careerText}). Historial auditado y resguardado.${aiNotes}`;
    } else if (isIncomplete) {
        const missingPreview = missingFields.slice(0, 4).join(', ') + (missingFields.length > 4 ? ` (+${missingFields.length - 4})` : '');
        const actionHint = needsHumanAttention
            ? ' Se recomienda seguimiento por un asesor humano.'
            : ' Metal-Uriel continúa recopilando datos.';
        aiSituationPreview = `Interesado en ${careerText} (${modText}). Ficha inconclusa (${completedCount}/${totalFields} datos • ${stalledLabel} sin avance). Faltan: ${missingPreview}.${actionHint}${aiNotes}`;
    } else {
        aiSituationPreview = `Ficha completa (${completedCount}/${totalFields} datos) para ${careerText} (${modText}) en etapa "${status}". Listo para cierre e inscripción por asesor.${aiNotes}`;
    }

    return {
        completedCount,
        totalFields,
        percent,
        completedFields,
        missingFields,
        isComplete,
        isIncomplete,
        stalledMs,
        stalledLabel,
        openDurationMs,
        openDurationLabel,
        needsHumanAttention,
        urgency,
        aiSituationPreview
    };
}

function formatSenderAudit(rol, remitenteNombre, modeloIa, aspiranteNombre) {
    const r = String(rol || 'assistant').toLowerCase();
    if (r === 'user') {
        return {
            sender: 'user',
            roleCode: 'user',
            roleLabel: 'Aspirante',
            displayAuthor: remitenteNombre || aspiranteNombre || 'Aspirante'
        };
    }
    if (r === 'human_advisor' || r === 'advisor') {
        return {
            sender: 'advisor',
            roleCode: 'human_advisor',
            roleLabel: 'Asesor Humano',
            displayAuthor: remitenteNombre || 'Asesor de Admisiones UNID'
        };
    }
    if (r === 'system') {
        return {
            sender: 'system',
            roleCode: 'system',
            roleLabel: 'Auditoría Sistema',
            displayAuthor: remitenteNombre || 'Sistema Metal-Uriel'
        };
    }
    return {
        sender: 'bot',
        roleCode: 'assistant',
        roleLabel: 'Robot IA',
        displayAuthor: modeloIa ? `Metal-Uriel (${modeloIa})` : (remitenteNombre || 'Metal-Uriel IA')
    };
}

module.exports = {
    OFFICIAL_FIELD_SPECS,
    normalizePhoneCanonical,
    pickBestDialPhone,
    isMeaningfulFieldValue,
    formatDurationSpanish,
    analyzeLeadCompleteness,
    formatSenderAudit
};
