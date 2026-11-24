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
const { recordAuditEvent } = require('../services/audit.service');

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

async function auditAuthAttempt(req, method, identifier, authResult) {
    if (authResult.success && authResult.user) {
        const u = authResult.user;
        await recordAuditEvent({
            req,
            categoria: 'AUTH',
            accion: 'LOGIN_OK',
            severidad: 'info',
            actor: { id: u.id, email: u.correo_institucional, nombre: u.displayName, rol: u.rol, sede_id: u.sede_id },
            sedeId: u.sede_id,
            objetivoTipo: 'sesion',
            objetivoId: u.correo_institucional,
            resumen: `Inicio de sesión exitoso (${method}) — ${u.displayName} [${u.rol}]`,
            detalle: { metodo: method, matricula: u.matricula, sede: u.sede_id || 'GLOBAL' }
        });
    } else {
        await recordAuditEvent({
            req,
            categoria: 'AUTH',
            accion: 'LOGIN_FAIL',
            severidad: 'warning',
            actor: { email: String(identifier || 'desconocido').slice(0, 120), nombre: 'Intento fallido' },
            objetivoTipo: 'sesion',
            objetivoId: String(identifier || 'vacío').slice(0, 120),
            resumen: `Intento de inicio de sesión fallido (${method}) para "${String(identifier || '').slice(0, 80)}"`,
            detalle: { metodo: method, motivo: authResult.error || 'Credenciales inválidas' }
        });
    }
}

router.post('/api/auth/login', authLimiter, async (req, res) => {
    const { username, email, correo_institucional, password } = req.body || {};
    const identifier = correo_institucional || username || email;
    const authResult = await handleUserAuth(identifier, password);
    await auditAuthAttempt(req, 'local', identifier, authResult);
    return res.status(authResult.success ? 200 : 401).json(authResult);
});

router.post('/api/auth/o365', authLimiter, async (req, res) => {
    const { email, correo_institucional, password, name } = req.body || {};
    const identifier = correo_institucional || email;
    const authResult = await handleUserAuth(identifier, password, name);
    await auditAuthAttempt(req, 'o365', identifier, authResult);
    return res.status(authResult.success ? 200 : 401).json(authResult);
});

router.post('/api/auth/microsoft', authLimiter, async (req, res) => {
    const { email, password, displayName } = req.body || {};
    const authResult = await handleUserAuth(email, password, displayName);
    await auditAuthAttempt(req, 'microsoft', email, authResult);
    return res.status(authResult.success ? 200 : 401).json(authResult);
});

router.post('/api/auth/logout', authMiddleware, async (req, res) => {
    await recordAuditEvent({
        req,
        categoria: 'AUTH',
        accion: 'LOGOUT',
        severidad: 'info',
        objetivoTipo: 'sesion',
        objetivoId: req.user?.correo_institucional || String(req.user?.id || ''),
        resumen: `Cierre de sesión voluntario — ${req.user?.displayName || req.user?.correo_institucional || 'Usuario'}`,
        detalle: { rol: req.user?.rol, sede: req.user?.sede_id || 'GLOBAL' }
    });
    res.json({ success: true, message: 'Sesión cerrada y auditada.' });
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

        await recordAuditEvent({
            req,
            categoria: 'AUTH',
            accion: 'QR_PAIR_CREATE',
            severidad: 'info',
            objetivoTipo: 'sesion_qr',
            objetivoId: session.pinFormatted,
            resumen: `Código QR móvil generado para vincular celular (${targetServerUrl})`,
            detalle: { serverUrl: targetServerUrl, expiresInSec: session.expiresInSec }
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

router.post('/api/auth/mobile-pair/claim', authLimiter, async (req, res) => {
    const { code, pin, deviceLabel } = req.body || {};
    const claimed = mobilePairUtils.claimPairingSession({ code, pin, deviceLabel });
    if (!claimed.ok) {
        await recordAuditEvent({
            req,
            categoria: 'AUTH',
            accion: 'QR_PAIR_FAIL',
            severidad: 'warning',
            objetivoTipo: 'sesion_qr',
            resumen: `Intento fallido de vinculación QR/PIN desde "${String(deviceLabel || 'Móvil').slice(0, 60)}"`,
            detalle: { motivo: claimed.error }
        });
        return res.status(401).json({ success: false, error: claimed.error });
    }
    const token = jwt.sign(claimed.user, config.JWT_SECRET, { expiresIn: '7d' });
    await recordAuditEvent({
        req,
        categoria: 'AUTH',
        accion: 'QR_PAIR_CLAIM',
        severidad: 'info',
        actor: { id: claimed.user.id, email: claimed.user.correo_institucional, nombre: claimed.user.displayName, rol: claimed.user.rol, sede_id: claimed.user.sede_id },
        sedeId: claimed.user.sede_id,
        objetivoTipo: 'sesion_qr',
        objetivoId: claimed.user.correo_institucional,
        resumen: `Celular vinculado por QR — ${claimed.user.displayName} (${deviceLabel || 'App Móvil'})`,
        detalle: { deviceLabel: deviceLabel || 'App Móvil', serverUrl: claimed.serverUrl }
    });
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

        await recordAuditEvent({
            req,
            categoria: 'USUARIOS',
            accion: 'USER_CREATE',
            severidad: 'warning',
            sedeId: finalSede,
            objetivoTipo: 'usuario',
            objetivoId: cleanCorreo,
            resumen: `Usuario creado: ${nombre_completo.trim()} (${cleanCorreo}) con rol "${rolNorm}"`,
            detalle: { userId: result.insertId, correo: cleanCorreo, nombre: nombre_completo.trim(), rol: rolNorm, sede_id: finalSede || 'GLOBAL', activo: activo !== undefined ? Boolean(activo) : true }
        });

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
        const passwordChanged = Boolean(password && String(password).trim().length > 0);
        const finalPass = passwordChanged ? hashPassword(password) : current.password;
        const nextActivo = activo !== undefined ? (activo ? 1 : 0) : current.activo;

        await getPool().execute(`
            UPDATE usuarios SET correo_institucional = ?, nombre_completo = ?, matricula = ?, password = ?, rol = ?, sede_id = ?, activo = ?
            WHERE id = ?
        `, [cleanCorreo, nombre_completo ? nombre_completo.trim() : current.nombre_completo, matricula !== undefined ? String(matricula).trim() : current.matricula, finalPass, rolNorm, finalSede, nextActivo, id]);

        const changes = [];
        if (cleanCorreo !== current.correo_institucional) changes.push(`correo: ${current.correo_institucional} → ${cleanCorreo}`);
        if (nombre_completo && nombre_completo.trim() !== current.nombre_completo) changes.push(`nombre: ${current.nombre_completo} → ${nombre_completo.trim()}`);
        if (rolNorm !== current.rol) changes.push(`rol: ${current.rol} → ${rolNorm}`);
        if (finalSede !== current.sede_id) changes.push(`sede: ${current.sede_id || 'GLOBAL'} → ${finalSede || 'GLOBAL'}`);
        if (Boolean(nextActivo) !== Boolean(current.activo)) changes.push(`activo: ${Boolean(current.activo)} → ${Boolean(nextActivo)}`);
        if (passwordChanged) changes.push('contraseña rotada');

        await recordAuditEvent({
            req,
            categoria: 'USUARIOS',
            accion: 'USER_UPDATE',
            severidad: (rolNorm !== current.rol || passwordChanged) ? 'critical' : 'warning',
            sedeId: finalSede,
            objetivoTipo: 'usuario',
            objetivoId: cleanCorreo,
            resumen: `Usuario editado (#${id} ${cleanCorreo}): ${changes.join(', ') || 'sin cambios estructurales'}`,
            detalle: { userId: Number(id), correo: cleanCorreo, changes, passwordChanged }
        });

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
        const [targetRows] = await getPool().query('SELECT id, correo_institucional, nombre_completo, rol, sede_id FROM usuarios WHERE id = ? LIMIT 1', [id]);
        const target = targetRows[0] || null;
        await getPool().execute('DELETE FROM usuarios WHERE id = ?', [id]);

        await recordAuditEvent({
            req,
            categoria: 'USUARIOS',
            accion: 'USER_DELETE',
            severidad: 'critical',
            sedeId: target?.sede_id || null,
            objetivoTipo: 'usuario',
            objetivoId: target?.correo_institucional || String(id),
            resumen: `Usuario eliminado permanentemente: ${target ? `${target.nombre_completo} (${target.correo_institucional}, rol ${target.rol})` : `ID #${id}`}`,
            detalle: target ? { userId: target.id, correo: target.correo_institucional, nombre: target.nombre_completo, rol: target.rol, sede_id: target.sede_id || 'GLOBAL' } : { userId: Number(id) }
        });

        res.json({ success: true, message: 'Usuario eliminado correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
