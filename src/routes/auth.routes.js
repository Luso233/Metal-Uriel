const express = require('express');
const jwt = require('jsonwebtoken');
const { config, isProductionHardened } = require('../config/env');
const { UNID_CAMPUSES } = require('../config/campuses');
const { getPool } = require('../db/pool');
const { hashPassword, verifyPassword } = require('../utils/crypto');
const {
    normalizeRole,
    getRoleTitle,
    authMiddleware,
    authorizeRoles,
    authLimiter
} = require('../middlewares/auth');
const setupUtils = require('../../lib/setup-utils');
const mobilePairUtils = require('../../lib/mobile-pair-utils');

const router = express.Router();

async function handleUserAuth(identifier, password, customName = null) {
    const cleanId = (identifier || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();
    if (!cleanId) {
        return { success: false, error: 'Por favor ingresa tu correo institucional o matrícula.' };
    }

    try {
        const [rows] = await getPool().query(
            'SELECT * FROM usuarios WHERE LOWER(correo_institucional) = ? OR LOWER(matricula) = ? LIMIT 1',
            [cleanId, cleanId]
        );
        if (rows.length > 0) {
            const dbUser = rows[0];
            if (!dbUser.activo) {
                return { success: false, error: 'Esta cuenta de usuario se encuentra desactivada por el Superadmin.' };
            }
            if (!verifyPassword(cleanPass, dbUser.password)) {
                return { success: false, error: 'Contraseña incorrecta para la cuenta seleccionada.' };
            }
            const rolNorm = normalizeRole(dbUser.rol);
            const campusObj = UNID_CAMPUSES.find(c => c.id === dbUser.sede_id);
            const userObj = {
                id: dbUser.id,
                correo_institucional: dbUser.correo_institucional,
                username: dbUser.correo_institucional,
                displayName: customName || dbUser.nombre_completo,
                matricula: dbUser.matricula || dbUser.correo_institucional.split('@')[0],
                rol: rolNorm,
                role: rolNorm,
                roleTitle: getRoleTitle(rolNorm),
                sede_id: rolNorm === 'desarrollador' ? null : (dbUser.sede_id || 'campeche'),
                tenant: rolNorm === 'desarrollador' ? 'Global (Todas las Sedes UNID)' : (campusObj ? campusObj.name : 'Campus San Francisco de Campeche'),
                isInstitutional: true
            };
            getPool().execute('UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = ?', [dbUser.id]).catch(() => {});
            const token = jwt.sign(userObj, config.JWT_SECRET, { expiresIn: '7d' });
            return { success: true, token, user: userObj };
        }
    } catch (dbErr) {
        console.warn('⚠️ MariaDB offline para autenticación:', dbErr.message);
    }

    if (isProductionHardened()) {
        return { success: false, error: 'Credenciales inválidas. En modo producción utiliza la cuenta creada en el Asistente de Configuración o solicita acceso al Desarrollador.' };
    }

    const demoAccounts = [
        {
            match: (id, pw) => ['00774343@red.unid.mx', '00774343', 'dev', 'superadmin', config.ADMIN_USERNAME.toLowerCase()].includes(id) &&
                ['admin', 'unid2026', config.ADMIN_PASSWORD].includes(pw),
            user: { id: 1, correo_institucional: '00774343@red.unid.mx', username: '00774343@red.unid.mx', displayName: customName || 'Luis Felipe Quintero (Desarrollador / Superadmin)', matricula: '00774343', rol: 'desarrollador', role: 'desarrollador', roleTitle: getRoleTitle('desarrollador'), sede_id: null, tenant: 'Global (Todas las Sedes UNID)', isInstitutional: true }
        },
        {
            match: (id, pw) => ['admin.campeche@red.unid.mx', '00881122', 'administrador'].includes(id) && ['admin2026', 'admin', 'unid2026'].includes(pw),
            user: { id: 2, correo_institucional: 'admin.campeche@red.unid.mx', username: 'admin.campeche@red.unid.mx', displayName: customName || 'Dir. Admisiones Campeche (Administrador)', matricula: '00881122', rol: 'administrador', role: 'administrador', roleTitle: getRoleTitle('administrador'), sede_id: 'campeche', tenant: 'Campus San Francisco de Campeche', isInstitutional: true }
        },
        {
            match: (id, pw) => (['67676767@red.unid.mx', '67676767', 'user'].includes(id) || id.includes('asesor')) && ['user', 'unid2026'].includes(pw),
            user: { id: 3, correo_institucional: '67676767@red.unid.mx', username: '67676767@red.unid.mx', displayName: customName || 'Lic. Asesor de Admisiones (Usuario)', matricula: '67676767', rol: 'usuario', role: 'usuario', roleTitle: getRoleTitle('usuario'), sede_id: 'campeche', tenant: 'Campus San Francisco de Campeche', isInstitutional: true }
        }
    ];

    for (const acc of demoAccounts) {
        if (acc.match(cleanId, cleanPass)) {
            const token = jwt.sign(acc.user, config.JWT_SECRET, { expiresIn: '7d' });
            return { success: true, token, user: acc.user };
        }
    }

    return { success: false, error: 'Credenciales inválidas.' };
}

router.post('/api/auth/login', authLimiter, async (req, res) => {
    const { username, email, correo_institucional, password } = req.body || {};
    const authResult = await handleUserAuth(correo_institucional || username || email, password);
    return res.status(authResult.success ? 200 : 401).json(authResult);
});

router.post('/api/auth/o365', authLimiter, async (req, res) => {
    const { email, correo_institucional, password, name } = req.body || {};
    const authResult = await handleUserAuth(correo_institucional || email, password, name);
    return res.status(authResult.success ? 200 : 401).json(authResult);
});

router.post('/api/auth/microsoft', authLimiter, async (req, res) => {
    const { email, password, displayName } = req.body || {};
    const authResult = await handleUserAuth(email, password, displayName);
    return res.status(authResult.success ? 200 : 401).json(authResult);
});

router.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ success: true, user: req.user });
});

// =========================================================================
// Vinculación Móvil por Código QR (WhatsApp Web Inverso: PC -> Celular)
// =========================================================================
router.post('/api/auth/mobile-pair/create', authMiddleware, async (req, res) => {
    try {
        const hw = setupUtils.getSystemHardwareReport(config.PORT);
        const reqOrigin = (req.headers.origin && /^https?:\/\//i.test(req.headers.origin) && !/localhost|127\.0\.0\.1|192\.168\.56\./i.test(req.headers.origin))
            ? req.headers.origin
            : null;
        const availableUrls = Array.from(new Set([
            ...(hw.lanUrls || []),
            ...(reqOrigin ? [reqOrigin] : [])
        ])).filter(Boolean);

        const requestedUrl = mobilePairUtils.sanitizeServerUrl(req.body?.serverUrl);
        const targetServerUrl = requestedUrl || hw.primaryLanUrl || availableUrls[0] || `http://localhost:${config.PORT}`;

        const session = await mobilePairUtils.createPairingSession({
            user: req.user,
            serverUrl: targetServerUrl
        });

        res.json({
            success: true,
            ...session,
            availableUrls,
            virtualUrls: hw.virtualUrls || [],
            firewallCommand: hw.firewallCommand
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.get('/api/auth/mobile-pair/status/:code', authMiddleware, (req, res) => {
    const status = mobilePairUtils.getPairingStatus(req.params.code, req.user?.id);
    res.json({ success: true, ...status });
});

router.post('/api/auth/mobile-pair/claim', authLimiter, (req, res) => {
    const { code, pin, deviceLabel } = req.body || {};
    const claimed = mobilePairUtils.claimPairingSession({ code, pin, deviceLabel });
    if (!claimed.ok) {
        return res.status(401).json({ success: false, error: claimed.error });
    }
    const token = jwt.sign(claimed.user, config.JWT_SECRET, { expiresIn: '7d' });
    return res.json({
        success: true,
        token,
        user: claimed.user,
        serverUrl: claimed.serverUrl
    });
});

router.get('/api/users', authMiddleware, authorizeRoles('desarrollador'), async (req, res) => {
    try {
        const [rows] = await getPool().query(
            'SELECT id, correo_institucional, nombre_completo, matricula, rol, sede_id, activo, ultimo_acceso, created_at FROM usuarios ORDER BY id ASC'
        );
        res.json({ success: true, users: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Error al consultar usuarios: ' + err.message });
    }
});

router.post('/api/users', authMiddleware, authorizeRoles('desarrollador'), async (req, res) => {
    try {
        const { correo_institucional, nombre_completo, matricula, password, rol, sede_id, activo } = req.body;
        if (!correo_institucional || !password || !nombre_completo) {
            return res.status(400).json({ success: false, error: 'Correo institucional, nombre completo y contraseña son obligatorios.' });
        }
        const cleanCorreo = String(correo_institucional).trim().toLowerCase();
        const rolNorm = normalizeRole(rol);
        const finalSede = rolNorm === 'desarrollador' ? null : (sede_id || 'campeche');
        const mat = matricula ? String(matricula).trim() : cleanCorreo.split('@')[0];

        const [result] = await getPool().execute(`
            INSERT INTO usuarios (correo_institucional, nombre_completo, matricula, password, rol, sede_id, activo)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [cleanCorreo, nombre_completo.trim(), mat, hashPassword(password), rolNorm, finalSede, activo !== undefined ? (activo ? 1 : 0) : 1]);

        res.status(201).json({ success: true, message: 'Usuario creado exitosamente.', userId: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'Ese correo institucional ya está registrado.' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/api/users/:id', authMiddleware, authorizeRoles('desarrollador'), async (req, res) => {
    try {
        const { id } = req.params;
        const { correo_institucional, nombre_completo, matricula, password, rol, sede_id, activo } = req.body;
        const [existing] = await getPool().query('SELECT * FROM usuarios WHERE id = ?', [id]);
        if (existing.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
        const current = existing[0];
        const cleanCorreo = correo_institucional ? String(correo_institucional).trim().toLowerCase() : current.correo_institucional;
        const rolNorm = rol ? normalizeRole(rol) : current.rol;
        const finalSede = rolNorm === 'desarrollador' ? null : (sede_id !== undefined ? (sede_id || 'campeche') : current.sede_id);
        const finalPass = (password && String(password).trim().length > 0) ? hashPassword(password) : current.password;

        await getPool().execute(`
            UPDATE usuarios SET correo_institucional = ?, nombre_completo = ?, matricula = ?, password = ?, rol = ?, sede_id = ?, activo = ?
            WHERE id = ?
        `, [cleanCorreo, nombre_completo ? nombre_completo.trim() : current.nombre_completo, matricula !== undefined ? String(matricula).trim() : current.matricula, finalPass, rolNorm, finalSede, activo !== undefined ? (activo ? 1 : 0) : current.activo, id]);

        res.json({ success: true, message: 'Usuario actualizado correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/api/users/:id', authMiddleware, authorizeRoles('desarrollador'), async (req, res) => {
    try {
        const { id } = req.params;
        if (req.user && Number(req.user.id) === Number(id)) {
            return res.status(400).json({ success: false, error: 'No puedes eliminar tu propia cuenta activa de Desarrollador.' });
        }
        await getPool().execute('DELETE FROM usuarios WHERE id = ?', [id]);
        res.json({ success: true, message: 'Usuario eliminado correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
