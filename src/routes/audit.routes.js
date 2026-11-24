const express = require('express');
const { authMiddleware, authorizeRoles } = require('../middlewares/auth');
const { queryAuditLogs, exportAuditCsv, recordAuditEvent } = require('../services/audit.service');

const router = express.Router();

router.get('/api/audit-logs', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    try {
        const isDev = req.user.rol === 'desarrollador';
        const sedeId = isDev ? (req.query.sede || 'all') : (req.user.sede_id || 'campeche');
        const result = await queryAuditLogs({
            categoria: req.query.categoria || 'all',
            severidad: req.query.severidad || 'all',
            search: req.query.search || '',
            actor: req.query.actor || '',
            sedeId,
            actorEmailScope: isDev ? null : req.user.correo_institucional,
            from: req.query.from || null,
            to: req.query.to || null,
            limit: req.query.limit || 200
        });
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/audit-logs/export', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    try {
        const isDev = req.user.rol === 'desarrollador';
        const sedeId = isDev ? (req.query.sede || 'all') : (req.user.sede_id || 'campeche');
        const result = await queryAuditLogs({
            categoria: req.query.categoria || 'all',
            severidad: req.query.severidad || 'all',
            search: req.query.search || '',
            sedeId,
            actorEmailScope: isDev ? null : req.user.correo_institucional,
            limit: 500
        });

        await recordAuditEvent({
            req,
            categoria: 'SISTEMA',
            accion: 'AUDIT_CSV_EXPORT',
            severidad: 'info',
            sedeId: isDev ? null : sedeId,
            objetivoTipo: 'auditoria',
            resumen: `Exportación oficial CSV de Bitácora de Auditoría (${result.logs.length} eventos)`,
            detalle: { count: result.logs.length, categoria: req.query.categoria || 'all' }
        });

        const csv = exportAuditCsv(result.logs);
        const fileName = `auditoria_metal_uriel_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.status(200).send(csv);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
