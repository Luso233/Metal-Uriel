const express = require('express');
const { getPool } = require('../db/pool');
const {
    conversationMemory,
    userSessionState,
    processedMessageIds,
    llmTelemetryBuffer,
    getTotalConversationsStarted,
    resetTotalConversationsStarted
} = require('../state/memory');
const { authMiddleware, authorizeRoles } = require('../middlewares/auth');
const { getBrochures } = require('../services/pool.service');
const { dispararNotificacionCorreo } = require('../services/mail.service');
const { seedDemoLeads } = require('../services/admissions.service');
const { recordAuditEvent } = require('../services/audit.service');

const router = express.Router();

router.post('/api/aspirantes/seed', authMiddleware, authorizeRoles('desarrollador'), async (req, res) => {
    try {
        const connection = await getPool().getConnection();
        await connection.query('DELETE FROM aspirantes');
        await connection.query('DELETE FROM historial_conversaciones');
        await seedDemoLeads(connection);
        connection.release();
        conversationMemory.clear();
        userSessionState.clear();
        processedMessageIds.clear();
        await recordAuditEvent({
            req,
            categoria: 'BASE_DATOS',
            accion: 'DB_SEED_DEMO',
            severidad: 'warning',
            objetivoTipo: 'base_datos',
            resumen: 'Base de datos poblada con 5 prospectos demo institucionales'
        });
        res.json({ success: true, message: 'Datos demo de alta fidelidad cargados con éxito (5 prospectos).' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

async function handleClearAllDatabaseAndCache(req, res) {
    try {
        const connection = await getPool().getConnection();
        await connection.query('DELETE FROM aspirantes');
        await connection.query('DELETE FROM historial_conversaciones');
        try {
            await connection.query('ALTER TABLE aspirantes AUTO_INCREMENT = 1');
            await connection.query('ALTER TABLE historial_conversaciones AUTO_INCREMENT = 1');
        } catch (_) {}
        connection.release();
        conversationMemory.clear();
        userSessionState.clear();
        processedMessageIds.clear();
        resetTotalConversationsStarted();
        await recordAuditEvent({
            req,
            categoria: 'BASE_DATOS',
            accion: 'DB_CLEAR_ALL',
            severidad: 'critical',
            objetivoTipo: 'base_datos',
            resumen: 'Vaciado total de tablas aspirantes, historial_conversaciones y caché RAM (auditoría preservada)'
        });
        res.json({ success: true, message: 'Base de datos (aspirantes e historial) y memoria caché vaciadas al 100%.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

router.delete('/api/aspirantes/all', authMiddleware, authorizeRoles('desarrollador'), handleClearAllDatabaseAndCache);
router.post('/api/database/clear-all', authMiddleware, authorizeRoles('desarrollador'), handleClearAllDatabaseAndCache);

router.get('/api/aspirantes', authMiddleware, async (req, res) => {
    try {
        let { campus } = req.query;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id) campus = req.user.sede_id;
        let query = 'SELECT * FROM aspirantes';
        const params = [];
        if (campus && campus !== 'all' && campus !== 'todas') {
            query += ' WHERE (sede_id = ? OR campus_interes LIKE ?)';
            params.push(campus, `%${campus.replace(/_/g, ' ')}%`);
        }
        query += ' ORDER BY COALESCE(ultimo_mensaje_at, updated_at, created_at) DESC LIMIT 200';
        const [rows] = await getPool().query(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.json({ success: false, error: err.message, data: [] });
    }
});

router.get('/api/aspirantes/export', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    try {
        let rows = [];
        try {
            let sql = 'SELECT * FROM aspirantes';
            const params = [];
            if (req.user.rol !== 'desarrollador' && req.user.sede_id) {
                sql += ' WHERE (sede_id = ? OR campus_interes LIKE ?)';
                params.push(req.user.sede_id, `%${req.user.sede_id.replace(/_/g, ' ')}%`);
            }
            sql += ' ORDER BY created_at DESC';
            const [dbRows] = await getPool().query(sql, params);
            rows = dbRows;
        } catch (_) {}

        const headers = [
            'ID', 'Fecha de Registro', 'CURP (Generada por IA)', 'Estado de Seguimiento', 'Lead Scoring (Interes)', 'Resumen IA',
            'Nombre Completo', 'Fecha de Nacimiento', 'Sexo', 'Estado de Nacimiento', 'Telefono Celular', 'Correo Electronico',
            'Bachillerato de Procedencia', 'Carrera de Interes', 'Direccion', 'Codigo Postal', 'Campus de Interes', 'Modalidad de Estudios', 'Es Foraneo'
        ];
        const escapeCsv = (val) => val === null || val === undefined ? '""' : `"${String(val).replace(/"/g, '""')}"`;
        const csvRows = [headers.map(escapeCsv).join(',')];
        for (const r of rows) {
            csvRows.push([
                r.id, r.created_at ? new Date(r.created_at).toLocaleString('es-MX') : '', r.curp || '',
                r.estado_prospecto || 'nuevo', r.nivel_interes || 'Alto', r.resumen_ia || '', r.nombre_completo,
                r.fecha_nacimiento ? String(r.fecha_nacimiento).split('T')[0] : '', r.sexo, r.estado_nacimiento,
                r.telefono_celular, r.correo_electronico, r.bachillerato_procedencia, r.carrera_interes,
                r.direccion, r.codigo_postal, r.campus_interes, r.modalidad_estudios,
                r.es_foraneo ? 'SI (Online)' : 'NO (Campeche)'
            ].map(escapeCsv).join(','));
        }
        await recordAuditEvent({
            req,
            categoria: 'ASPIRANTES',
            accion: 'LEADS_CSV_EXPORT',
            severidad: 'info',
            objetivoTipo: 'aspirantes',
            resumen: `Descarga CSV de base de aspirantes (${rows.length} registros)`
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=aspirantes_unid_${new Date().toISOString().slice(0, 10)}.csv`);
        res.status(200).send('\uFEFF' + csvRows.join('\r\n'));
    } catch (err) {
        res.status(500).send('Error exportando datos: ' + err.message);
    }
});

router.patch('/api/aspirantes/:id/status', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const estado = req.body.estado || req.body.estado_prospecto;
        if (!['nuevo', 'contactado', 'en_proceso', 'inscrito', 'no_interesado'].includes(estado)) {
            return res.status(400).json({ error: 'Estado de prospecto no válido.' });
        }
        const [prevRows] = await getPool().query('SELECT * FROM aspirantes WHERE id = ?', [id]);
        const prevLead = prevRows[0] || null;
        if (prevLead && req.user.rol !== 'desarrollador' && req.user.sede_id && prevLead.sede_id && prevLead.sede_id !== req.user.sede_id) {
            return res.status(403).json({ error: 'No tienes permiso para modificar prospectos de otra sede.' });
        }
        await getPool().execute(
            `UPDATE aspirantes
             SET estado_prospecto = ?,
                 conversacion_destacada = CASE WHEN ? = 'inscrito' THEN 1 ELSE conversacion_destacada END,
                 fecha_inscripcion = CASE WHEN ? = 'inscrito' AND fecha_inscripcion IS NULL THEN CURRENT_TIMESTAMP ELSE fecha_inscripcion END
             WHERE id = ?`,
            [estado, estado, estado, id]
        );
        // Registrar evento auditable en la bóveda de conversación
        if (prevLead?.telefono_celular) {
            const { guardarMensajeHistorialBD } = require('../services/admissions.service');
            const label = estado === 'inscrito' ? '🏆 INSCRITO (Caso de Éxito preservado para estudio)' : estado.toUpperCase();
            guardarMensajeHistorialBD(
                prevLead.telefono_celular,
                'system',
                `Estado de postulación actualizado a ${label} por ${req.user?.displayName || 'Asesor UNID'}.`,
                prevLead.sede_id || 'campeche',
                { senderName: req.user?.displayName || 'Sistema UNID' }
            ).catch(() => {});
        }
        let emailTriggered = false;
        if (estado === 'inscrito' && (!prevLead || prevLead.estado_prospecto !== 'inscrito')) {
            emailTriggered = true;
            dispararNotificacionCorreo('CIERRE_INSCRITO', {
                lead: prevLead || { id, nombre_completo: `Prospecto #${id}` },
                asesor: req.user?.displayName || 'Asesor de Admisiones UNID'
            }).catch(console.error);
        }
        await recordAuditEvent({
            req,
            categoria: 'ASPIRANTES',
            accion: 'LEAD_STATUS_CHANGE',
            severidad: estado === 'inscrito' ? 'warning' : 'info',
            sedeId: prevLead?.sede_id || req.user?.sede_id || null,
            objetivoTipo: 'aspirante',
            objetivoId: String(id),
            resumen: `Etapa Kanban actualizada para ${prevLead?.nombre_completo || '#' + id}: ${prevLead?.estado_prospecto || 'nuevo'} → ${estado}`,
            detalle: { aspiranteId: Number(id), prevStatus: prevLead?.estado_prospecto || null, nextStatus: estado }
        });
        res.json({ success: true, id: Number(id), estado, emailTriggered });
    } catch (err) {
        res.status(500).json({ error: 'Error actualizando estado: ' + err.message });
    }
});

router.patch('/api/aspirantes/:id/archive', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { archivado } = req.body;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id) {
            const [rows] = await getPool().query('SELECT sede_id FROM aspirantes WHERE id = ?', [id]);
            if (rows[0]?.sede_id && rows[0].sede_id !== req.user.sede_id) {
                return res.status(403).json({ error: 'No tienes permiso para archivar prospectos de otra sede.' });
            }
        }
        const archVal = (archivado === true || archivado === 1 || archivado === '1') ? 1 : 0;
        await getPool().execute('UPDATE aspirantes SET archivado = ? WHERE id = ?', [archVal, id]);
        res.json({ success: true, id: Number(id), archivado: Boolean(archVal) });
    } catch (err) {
        res.status(500).json({ error: 'Error archivando prospecto: ' + err.message });
    }
});

router.delete('/api/aspirantes/:id', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await getPool().query('SELECT id, sede_id, nombre_completo, telefono_celular, estado_prospecto FROM aspirantes WHERE id = ? LIMIT 1', [id]);
        const target = rows[0] || null;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id && target?.sede_id && target.sede_id !== req.user.sede_id) {
            return res.status(403).json({ error: 'No tienes permiso para eliminar prospectos de otra sede.' });
        }
        await getPool().execute('DELETE FROM aspirantes WHERE id = ?', [id]);
        await recordAuditEvent({
            req,
            categoria: 'ASPIRANTES',
            accion: 'LEAD_DELETE',
            severidad: 'critical',
            sedeId: target?.sede_id || req.user?.sede_id || null,
            objetivoTipo: 'aspirante',
            objetivoId: String(id),
            resumen: `Expediente de aspirante eliminado: ${target ? `${target.nombre_completo} (${target.telefono_celular})` : `ID #${id}`}`,
            detalle: target ? { aspiranteId: target.id, nombre: target.nombre_completo, telefono: target.telefono_celular, estadoPrevio: target.estado_prospecto } : { aspiranteId: Number(id) }
        });
        res.json({ success: true, id: Number(id) });
    } catch (err) {
        res.status(500).json({ error: 'Error eliminando prospecto: ' + err.message });
    }
});

router.get('/api/analytics', authMiddleware, async (req, res) => {
    try {
        let rows = [];
        let targetSede = req.query.campus || null;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id) targetSede = req.user.sede_id;
        try {
            let sql = 'SELECT * FROM aspirantes';
            const params = [];
            if (targetSede && targetSede !== 'all' && targetSede !== 'todas') {
                sql += ' WHERE (sede_id = ? OR campus_interes LIKE ?)';
                params.push(targetSede, `%${targetSede.replace(/_/g, ' ')}%`);
            }
            const [dbRows] = await getPool().query(sql, params);
            rows = dbRows;
        } catch (_) {}

        const totalLeads = rows.length;
        const activos = rows.filter(r => !r.archivado).length;
        const archivados = rows.filter(r => Boolean(r.archivado)).length;
        const locales = rows.filter(r => !r.es_foraneo).length;
        const foraneos = rows.filter(r => Boolean(r.es_foraneo)).length;
        const officialDegrees = getBrochures().filter(b => b.scope !== 'todas').map(b => b.carrera);
        const careerMap = {};
        officialDegrees.forEach(deg => { careerMap[deg] = 0; });
        rows.forEach(r => {
            const raw = (r.carrera_interes || '').trim();
            if (!raw) return;
            const match = officialDegrees.find(deg => deg.toLowerCase() === raw.toLowerCase() || raw.toLowerCase().includes(deg.toLowerCase().substring(0, 15)) || deg.toLowerCase().includes(raw.toLowerCase().substring(0, 15)));
            if (match) careerMap[match] = (careerMap[match] || 0) + 1;
            else careerMap['Otros Programas UNID'] = (careerMap['Otros Programas UNID'] || 0) + 1;
        });

        const byCareer = Object.entries(careerMap).map(([career, count]) => ({ career, count })).filter(c => c.count > 0 || officialDegrees.includes(c.career)).sort((a, b) => b.count - a.count);
        const activeRows = rows.filter(r => !r.archivado);
        const byStatus = {
            nuevo: activeRows.filter(r => (r.estado_prospecto || 'nuevo') === 'nuevo').length,
            contactado: activeRows.filter(r => r.estado_prospecto === 'contactado').length,
            en_proceso: activeRows.filter(r => r.estado_prospecto === 'en_proceso').length,
            inscrito: activeRows.filter(r => r.estado_prospecto === 'inscrito').length,
            no_interesado: activeRows.filter(r => r.estado_prospecto === 'no_interesado').length
        };
        const byInterest = {
            alto: rows.filter(r => (r.nivel_interes || 'Alto') === 'Alto').length,
            medio: rows.filter(r => r.nivel_interes === 'Medio').length,
            bajo: rows.filter(r => r.nivel_interes === 'Bajo').length
        };
        const modalityMap = {};
        rows.forEach(r => { const m = r.modalidad_estudios || 'No especificada'; modalityMap[m] = (modalityMap[m] || 0) + 1; });
        const byModality = Object.entries(modalityMap).map(([modality, count]) => ({ modality, count }));
        const totalConversations = getTotalConversationsStarted() || (totalLeads + conversationMemory.size) || 1;
        const conversionRate = Number(((totalLeads / totalConversations) * 100).toFixed(1));

        let llmTelemetry = { totalCalls: llmTelemetryBuffer.length, avgLatencyMs: 0, fallbackCount: 0, estimatedCostMxn: 0, byProvider: [] };
        try {
            const [summaryRows] = await getPool().query(`SELECT COUNT(*) AS totalCalls, ROUND(AVG(latencia_ms)) AS avgLatencyMs, SUM(CASE WHEN fue_fallback = 1 THEN 1 ELSE 0 END) AS fallbackCount, ROUND(SUM(costo_est_mxn), 4) AS estimatedCostMxn FROM llm_telemetria WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`);
            const [providerRows] = await getPool().query(`SELECT proveedor AS provider, modelo AS model, COUNT(*) AS calls, ROUND(AVG(latencia_ms)) AS avgLatencyMs, ROUND(SUM(costo_est_mxn), 4) AS costMxn FROM llm_telemetria WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY proveedor, modelo ORDER BY calls DESC LIMIT 10`);
            if (summaryRows[0] && Number(summaryRows[0].totalCalls) > 0) {
                llmTelemetry = { totalCalls: Number(summaryRows[0].totalCalls), avgLatencyMs: Number(summaryRows[0].avgLatencyMs || 0), fallbackCount: Number(summaryRows[0].fallbackCount || 0), estimatedCostMxn: Number(summaryRows[0].estimatedCostMxn || 0), byProvider: providerRows };
            }
        } catch (_) {}

        res.json({ success: true, totalLeads, activos, archivados, locales, foraneos, byCareer, byStatus, byInterest, byModality, totalConversations, conversionRate, llmTelemetry });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
