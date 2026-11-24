// =========================================================================
// Metal-Uriel — Motor de Auditoría Empresarial Inmutable (`auditoria_sistema`)
// Registra accesos (login/logout/QR), altas/ediciones/bajas de usuarios,
// rotación de API keys y secretos (CON REDACCIÓN AUTOMÁTICA), cambios de IA,
// exportaciones sensibles y operaciones destructivas de base de datos.
// =========================================================================

const SECRET_KEY_PATTERN = /(pass(word)?|secret|token|api[_-]?key|apikey|private[_-]?key|jwt|smtp_pass|db_password|encryption_master_key|webhook_secret|auth[_-]?header|authorization|bearer)/i;
const MAX_MEM_AUDIT_ENTRIES = 600;

function maskSecretSafe(val) {
    const s = String(val ?? '').trim();
    if (!s) return '[VACÍO]';
    if (s.length <= 8) return '••••••••';
    return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

/**
 * Redacta recursivamente cualquier campo sensible para garantizar que NINGUNA
 * contraseña ni API key en texto plano quede expuesta en la bitácora de auditoría.
 */
function sanitizeAuditDetail(value, depth = 0) {
    if (value === null || value === undefined) return null;
    if (depth > 5) return '[TRUNCADO]';
    if (typeof value === 'string') {
        if (value.length > 400) return `${value.slice(0, 400)}…`;
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
        return value.slice(0, 50).map((item) => sanitizeAuditDetail(item, depth + 1));
    }
    if (typeof value === 'object') {
        const clean = {};
        for (const [k, v] of Object.entries(value)) {
            if (SECRET_KEY_PATTERN.test(k)) {
                clean[k] = v ? `[REDACTADO:${maskSecretSafe(v)}]` : '[VACÍO]';
            } else {
                clean[k] = sanitizeAuditDetail(v, depth + 1);
            }
        }
        return clean;
    }
    return String(value);
}

/**
 * Compara llaves sensibles antes/después sin exponer los valores reales.
 * Devuelve un arreglo seguro con `{ key, status: 'agregada'|'actualizada'|'eliminada', preview }`.
 */
function diffSensitiveKeys(beforeObj = {}, afterObj = {}, keyNames = []) {
    const changes = [];
    for (const key of keyNames) {
        const prev = String(beforeObj?.[key] ?? '').trim();
        const next = String(afterObj?.[key] ?? '').trim();
        if (prev === next) continue;
        let status = 'actualizada';
        if (!prev && next) status = 'agregada';
        else if (prev && !next) status = 'eliminada';
        changes.push({
            key,
            status,
            preview: next ? maskSecretSafe(next) : '[ELIMINADA]'
        });
    }
    return changes;
}

function extractClientMeta(req) {
    if (!req) return { ip: null, userAgent: null, actor: null };
    const xff = req.headers?.['x-forwarded-for'];
    const rawIp = Array.isArray(xff)
        ? xff[0]
        : (typeof xff === 'string' && xff.trim() ? xff.split(',')[0].trim() : (req.ip || req.socket?.remoteAddress || ''));
    const ip = String(rawIp || '').replace(/^::ffff:/, '').slice(0, 80) || null;
    const userAgent = String(req.headers?.['user-agent'] || '').slice(0, 240) || null;
    const u = req.user || null;
    const actor = u ? {
        id: u.id ?? null,
        email: u.correo_institucional || u.username || u.email || null,
        nombre: u.displayName || u.nombre_completo || u.correo_institucional || null,
        rol: u.rol || u.role || null,
        sede_id: u.sede_id ?? null
    } : null;
    return { ip, userAgent, actor };
}

function csvSafeCell(val) {
    let s = String(val ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s}"`;
}

function exportAuditCsv(rows = []) {
    const headers = [
        'ID',
        'Fecha y Hora (UTC/ISO)',
        'Categoría',
        'Acción',
        'Severidad',
        'Actor Nombre',
        'Actor Correo',
        'Actor Rol',
        'Sede',
        'Objetivo Tipo',
        'Objetivo ID',
        'Resumen',
        'IP Origen',
        'Detalle Seguro (JSON)'
    ];
    const lines = [headers.map(csvSafeCell).join(',')];
    for (const r of rows) {
        const dt = r.created_at ? new Date(r.created_at).toISOString() : '';
        const det = typeof r.detalle === 'string'
            ? r.detalle
            : (r.detalle_json ? (typeof r.detalle_json === 'string' ? r.detalle_json : JSON.stringify(r.detalle_json)) : '');
        lines.push([
            r.id ?? '',
            dt,
            r.categoria || '',
            r.accion || '',
            r.severidad || 'info',
            r.actor_nombre || '',
            r.actor_email || '',
            r.actor_rol || '',
            r.sede_id || 'GLOBAL',
            r.objetivo_tipo || '',
            r.objetivo_id || '',
            r.resumen || '',
            r.ip_origen || '',
            det
        ].map(csvSafeCell).join(','));
    }
    return '\uFEFF' + lines.join('\r\n');
}

function buildAuditSummary(rows = []) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const byCategory = {};
    let criticalCount = 0;
    let warningCount = 0;
    let loginsToday = 0;
    let userChangesCount = 0;
    let apiKeyChangesCount = 0;

    for (const r of rows) {
        const cat = r.categoria || 'SISTEMA';
        byCategory[cat] = (byCategory[cat] || 0) + 1;
        if (r.severidad === 'critical') criticalCount++;
        if (r.severidad === 'warning') warningCount++;
        const ts = r.created_at ? new Date(r.created_at).toISOString() : '';
        if (cat === 'AUTH' && ts.startsWith(todayStr) && /LOGIN|QR_PAIR_CLAIM/.test(String(r.accion || ''))) {
            loginsToday++;
        }
        if (cat === 'USUARIOS') userChangesCount++;
        if (cat === 'API_KEYS') apiKeyChangesCount++;
    }

    return {
        total: rows.length,
        criticalCount,
        warningCount,
        loginsToday,
        userChangesCount,
        apiKeyChangesCount,
        byCategory
    };
}

function createAuditRecorder({ getPool }) {
    const memoryBuffer = [];
    let memorySeq = 1;

    async function recordAuditEvent({
        req = null,
        categoria = 'SISTEMA',
        accion = 'EVENTO',
        severidad = 'info',
        actor = null,
        sedeId = null,
        objetivoTipo = null,
        objetivoId = null,
        resumen = '',
        detalle = null
    } = {}) {
        const client = extractClientMeta(req);
        const effActor = actor || client.actor || {};
        const cleanDetail = detalle !== null && detalle !== undefined ? sanitizeAuditDetail(detalle) : null;
        const detailStr = cleanDetail !== null ? JSON.stringify(cleanDetail) : null;
        const resolvedSede = sedeId !== undefined && sedeId !== null ? sedeId : (effActor.sede_id ?? null);
        const nowIso = new Date().toISOString();

        const record = {
            id: `mem_${memorySeq++}`,
            created_at: nowIso,
            categoria: String(categoria || 'SISTEMA').toUpperCase().slice(0, 40),
            accion: String(accion || 'EVENTO').toUpperCase().slice(0, 80),
            severidad: ['info', 'warning', 'critical'].includes(severidad) ? severidad : 'info',
            actor_id: effActor.id ?? null,
            actor_email: effActor.email ? String(effActor.email).slice(0, 150) : null,
            actor_nombre: effActor.nombre ? String(effActor.nombre).slice(0, 150) : null,
            actor_rol: effActor.rol ? String(effActor.rol).slice(0, 40) : null,
            sede_id: resolvedSede ? String(resolvedSede).slice(0, 50) : null,
            objetivo_tipo: objetivoTipo ? String(objetivoTipo).slice(0, 60) : null,
            objetivo_id: objetivoId !== null && objetivoId !== undefined ? String(objetivoId).slice(0, 120) : null,
            resumen: String(resumen || accion).slice(0, 255),
            detalle_json: detailStr,
            detalle: cleanDetail,
            ip_origen: client.ip,
            user_agent: client.userAgent
        };

        memoryBuffer.unshift(record);
        if (memoryBuffer.length > MAX_MEM_AUDIT_ENTRIES) {
            memoryBuffer.length = MAX_MEM_AUDIT_ENTRIES;
        }

        try {
            const pool = typeof getPool === 'function' ? getPool() : null;
            if (pool) {
                const [ins] = await pool.execute(
                    `INSERT INTO auditoria_sistema (
                        categoria, accion, severidad, actor_id, actor_email, actor_nombre,
                        actor_rol, sede_id, objetivo_tipo, objetivo_id, resumen, detalle_json,
                        ip_origen, user_agent
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        record.categoria,
                        record.accion,
                        record.severidad,
                        record.actor_id,
                        record.actor_email,
                        record.actor_nombre,
                        record.actor_rol,
                        record.sede_id,
                        record.objetivo_tipo,
                        record.objetivo_id,
                        record.resumen,
                        record.detalle_json,
                        record.ip_origen,
                        record.user_agent
                    ]
                );
                if (ins?.insertId) record.id = ins.insertId;
            }
        } catch (_) {
            // Si MariaDB está offline o en arranque inicial, el evento queda resguardado en memoryBuffer
        }

        return record;
    }

    async function queryAuditLogs({
        categoria = null,
        severidad = null,
        search = null,
        actor = null,
        sedeId = null,
        actorEmailScope = null,
        from = null,
        to = null,
        limit = 200
    } = {}) {
        const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
        let rows = [];
        let source = 'memory';

        try {
            const pool = typeof getPool === 'function' ? getPool() : null;
            if (pool) {
                const where = [];
                const params = [];
                if (categoria && categoria !== 'all') {
                    where.push('categoria = ?');
                    params.push(String(categoria).toUpperCase());
                }
                if (severidad && severidad !== 'all') {
                    where.push('severidad = ?');
                    params.push(String(severidad).toLowerCase());
                }
                if (sedeId && sedeId !== 'all' && sedeId !== 'todas') {
                    if (actorEmailScope) {
                        where.push('(sede_id = ? OR actor_email = ?)');
                        params.push(sedeId, actorEmailScope);
                    } else {
                        where.push('sede_id = ?');
                        params.push(sedeId);
                    }
                }
                if (actor && actor.trim()) {
                    where.push('(actor_email LIKE ? OR actor_nombre LIKE ?)');
                    const pat = `%${actor.trim()}%`;
                    params.push(pat, pat);
                }
                if (from && !isNaN(new Date(from).getTime())) {
                    where.push('created_at >= ?');
                    params.push(new Date(from));
                }
                if (to && !isNaN(new Date(to).getTime())) {
                    where.push('created_at <= ?');
                    params.push(new Date(to));
                }
                if (search && search.trim()) {
                    const pat = `%${search.trim()}%`;
                    where.push('(resumen LIKE ? OR accion LIKE ? OR actor_email LIKE ? OR actor_nombre LIKE ? OR objetivo_id LIKE ? OR ip_origen LIKE ?)');
                    params.push(pat, pat, pat, pat, pat, pat);
                }

                const sql = `SELECT * FROM auditoria_sistema ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC LIMIT ?`;
                const [dbRows] = await pool.query(sql, [...params, safeLimit]);
                rows = (dbRows || []).map((r) => {
                    let parsed = null;
                    if (r.detalle_json) {
                        try { parsed = JSON.parse(r.detalle_json); } catch (_) { parsed = r.detalle_json; }
                    }
                    return { ...r, detalle: parsed };
                });
                source = 'mariadb';
            }
        } catch (_) {
            // Fallback a buffer en RAM
        }

        if (source === 'memory') {
            rows = memoryBuffer.filter((r) => {
                if (categoria && categoria !== 'all' && r.categoria !== String(categoria).toUpperCase()) return false;
                if (severidad && severidad !== 'all' && r.severidad !== String(severidad).toLowerCase()) return false;
                if (sedeId && sedeId !== 'all' && sedeId !== 'todas') {
                    const matchSede = r.sede_id === sedeId;
                    const matchSelf = actorEmailScope && r.actor_email === actorEmailScope;
                    if (!matchSede && !matchSelf) return false;
                }
                if (actor && actor.trim()) {
                    const a = actor.trim().toLowerCase();
                    if (!String(r.actor_email || '').toLowerCase().includes(a) && !String(r.actor_nombre || '').toLowerCase().includes(a)) return false;
                }
                if (search && search.trim()) {
                    const q = search.trim().toLowerCase();
                    const hay = `${r.resumen} ${r.accion} ${r.actor_email || ''} ${r.actor_nombre || ''} ${r.objetivo_id || ''} ${r.ip_origen || ''}`.toLowerCase();
                    if (!hay.includes(q)) return false;
                }
                return true;
            }).slice(0, safeLimit);
        }

        return {
            source,
            total: rows.length,
            summary: buildAuditSummary(rows),
            logs: rows
        };
    }

    return {
        recordAuditEvent,
        queryAuditLogs,
        exportAuditCsv,
        getInMemoryAuditBuffer: () => [...memoryBuffer]
    };
}

module.exports = {
    SECRET_KEY_PATTERN,
    maskSecretSafe,
    sanitizeAuditDetail,
    diffSensitiveKeys,
    extractClientMeta,
    exportAuditCsv,
    buildAuditSummary,
    createAuditRecorder
};
