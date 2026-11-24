const express = require('express');
const fs = require('fs');
const path = require('path');
const { ROOT_DIR } = require('../config/env');
const { DEFAULT_POOL_CATEGORIES } = require('../config/campuses');
const { getPool } = require('../db/pool');
const { activeSchoolCyclesMemory } = require('../state/memory');
const { authMiddleware } = require('../middlewares/auth');
const {
    UPLOADS_DIR,
    getBrochures,
    saveBrochuresToDisk,
    getActiveCicloEscolar,
    getActivePoolItems,
    saveUploadedBase64File,
    generateOfficialPdfBuffer
} = require('../services/pool.service');

const router = express.Router();

router.get('/api/ciclos', authMiddleware, async (req, res) => {
    try {
        let sedeId = req.query.sede_id || req.query.campus || 'campeche';
        if (req.user.rol !== 'desarrollador' && req.user.sede_id) sedeId = req.user.sede_id;
        if (sedeId === 'all' || sedeId === 'todas') sedeId = 'campeche';

        const [rows] = await getPool().query('SELECT * FROM ciclos_escolares_sede WHERE sede_id = ? LIMIT 1', [sedeId]);
        let activeCiclo = '2026-3 Septiembre';
        let list = ['2026-1 Enero', '2026-2 Mayo', '2026-3 Septiembre', '2027-1 Enero'];
        if (rows.length > 0) {
            activeCiclo = rows[0].ciclo_activo || activeCiclo;
            try {
                const parsed = JSON.parse(rows[0].ciclos_disponibles || '[]');
                if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
            } catch (_) {}
        }
        if (!list.includes(activeCiclo)) list.push(activeCiclo);
        res.json({
            success: true,
            sede_id: sedeId,
            activeCiclo,
            ciclos: list.map((c, idx) => ({ id: idx + 1, sede_id: sedeId, ciclo_escolar: c, es_activo: c === activeCiclo ? 1 : 0 }))
        });
    } catch (_) {
        res.json({
            success: true,
            sede_id: 'campeche',
            activeCiclo: '2026-3 Septiembre',
            ciclos: [
                { id: 1, sede_id: 'campeche', ciclo_escolar: '2026-2 Mayo', es_activo: 0 },
                { id: 2, sede_id: 'campeche', ciclo_escolar: '2026-3 Septiembre', es_activo: 1 },
                { id: 3, sede_id: 'campeche', ciclo_escolar: '2027-1 Enero', es_activo: 0 }
            ]
        });
    }
});

router.post('/api/ciclos', authMiddleware, async (req, res) => {
    try {
        let sedeId = req.body.sede_id || 'campeche';
        if (req.user.rol !== 'desarrollador' && req.user.sede_id) sedeId = req.user.sede_id;
        if (sedeId === 'all' || sedeId === 'todas') sedeId = 'campeche';
        const { ciclo_escolar } = req.body;
        if (!ciclo_escolar || !String(ciclo_escolar).trim()) {
            return res.status(400).json({ success: false, error: 'El nombre del ciclo escolar es obligatorio.' });
        }
        const cleanCiclo = String(ciclo_escolar).trim();
        const [rows] = await getPool().query('SELECT * FROM ciclos_escolares_sede WHERE sede_id = ? LIMIT 1', [sedeId]);
        let list = ['2026-1 Enero', '2026-2 Mayo', '2026-3 Septiembre', '2027-1 Enero'];
        if (rows.length > 0 && rows[0].ciclos_disponibles) {
            try {
                const parsed = JSON.parse(rows[0].ciclos_disponibles);
                if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
            } catch (_) {}
        }
        if (!list.includes(cleanCiclo)) list.push(cleanCiclo);

        await getPool().execute(`
            INSERT INTO ciclos_escolares_sede (sede_id, ciclo_activo, ciclos_disponibles, updated_by)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE ciclo_activo = VALUES(ciclo_activo), ciclos_disponibles = VALUES(ciclos_disponibles), updated_by = VALUES(updated_by)
        `, [sedeId, cleanCiclo, JSON.stringify(list), req.user?.correo_institucional || 'Admin']);

        activeSchoolCyclesMemory.set(sedeId, cleanCiclo);
        res.json({
            success: true,
            message: `Ciclo escolar activo actualizado a ${cleanCiclo}`,
            activeCiclo: cleanCiclo,
            ciclos: list.map((c, idx) => ({ id: idx + 1, sede_id: sedeId, ciclo_escolar: c, es_activo: c === cleanCiclo ? 1 : 0 }))
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/pool/categories', authMiddleware, async (_req, res) => {
    try {
        const [rows] = await getPool().query('SELECT * FROM pool_categorias WHERE activa = 1 ORDER BY orden ASC, id ASC');
        return res.json({ success: true, categories: rows && rows.length > 0 ? rows : DEFAULT_POOL_CATEGORIES });
    } catch (_) {
        return res.json({ success: true, categories: DEFAULT_POOL_CATEGORIES });
    }
});

router.post('/api/pool/categories', authMiddleware, async (req, res) => {
    try {
        const { nombre, icono, color, descripcion, slug: customSlug } = req.body;
        if (!nombre || !String(nombre).trim()) return res.status(400).json({ success: false, error: 'El nombre de la categoría es obligatorio.' });
        const cleanNombre = String(nombre).trim();
        let slug = (customSlug || cleanNombre).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 60) || `cat_${Date.now()}`;
        const [existing] = await getPool().query('SELECT id FROM pool_categorias WHERE slug = ? LIMIT 1', [slug]);
        if (existing.length > 0) slug = `${slug}_${Date.now().toString().slice(-3)}`;

        const [result] = await getPool().execute(
            `INSERT INTO pool_categorias (slug, nombre, icono, color, descripcion, orden, activa) VALUES (?, ?, ?, ?, ?, 10, 1)`,
            [slug, cleanNombre, (icono || '📁').trim(), (color || 'amber').trim(), (descripcion || '').trim()]
        );
        return res.status(201).json({
            success: true,
            category: { id: result.insertId, slug, nombre: cleanNombre, icono: (icono || '📁').trim(), color: (color || 'amber').trim(), descripcion: (descripcion || '').trim(), activa: 1 }
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/api/pool/categories/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, icono, color, descripcion } = req.body;
        if (!nombre || !String(nombre).trim()) return res.status(400).json({ success: false, error: 'El nombre de la categoría es obligatorio.' });
        const [rows] = await getPool().query('SELECT * FROM pool_categorias WHERE id = ? OR slug = ? LIMIT 1', [id, id]);
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Categoría no encontrada.' });
        const current = rows[0];
        const cleanNombre = String(nombre).trim();
        const cleanIcono = (icono || current.icono || '📁').trim();
        const cleanColor = (color || current.color || 'amber').trim();
        const cleanDesc = descripcion !== undefined ? String(descripcion).trim() : (current.descripcion || '');
        await getPool().execute('UPDATE pool_categorias SET nombre = ?, icono = ?, color = ?, descripcion = ? WHERE id = ?', [cleanNombre, cleanIcono, cleanColor, cleanDesc, current.id]);
        return res.json({ success: true, category: { ...current, nombre: cleanNombre, icono: cleanIcono, color: cleanColor, descripcion: cleanDesc } });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/api/pool/categories/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await getPool().query('SELECT * FROM pool_categorias WHERE id = ? OR slug = ? LIMIT 1', [id, id]);
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'Categoría no encontrada.' });
        const targetCat = rows[0];
        const [otherCats] = await getPool().query('SELECT slug FROM pool_categorias WHERE id != ? ORDER BY orden ASC, id ASC LIMIT 1', [targetCat.id]);
        const fallbackSlug = otherCats.length > 0 ? otherCats[0].slug : 'plan_estudios';
        await getPool().execute('UPDATE pool_recursos_multimedia SET categoria = ? WHERE categoria = ?', [fallbackSlug, targetCat.slug]);
        await getPool().execute('DELETE FROM pool_categorias WHERE id = ?', [targetCat.id]);
        return res.json({ success: true, message: `Categoría "${targetCat.nombre}" eliminada.`, fallbackSlug });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/pool', authMiddleware, async (req, res) => {
    try {
        let sedeId = req.query.sede_id || req.query.campus || null;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id) sedeId = req.user.sede_id;
        const items = await getActivePoolItems(sedeId);
        res.json({ success: true, count: items.length, items, brochures: items });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/brochures', authMiddleware, async (req, res) => {
    try {
        let sedeId = req.query.sede_id || req.query.campus || null;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id) sedeId = req.user.sede_id;
        const items = await getActivePoolItems(sedeId);
        res.json({ success: true, count: items.length, brochures: items, items });
    } catch (_) {
        const brochures = getBrochures();
        res.json({ success: true, count: brochures.length, brochures, items: brochures });
    }
});

async function handleCreatePoolResource(req, res) {
    try {
        const { titulo, carrera, categoria, descripcion_ia, scope, modalidad, duracion, rvoe, fileName, file_name, pdfUrl, url_recurso, size, tags, ciclo_escolar, tipo_archivo, fileData, file_data_base64 } = req.body;
        const finalTitle = (titulo || carrera || '').trim();
        if (!finalTitle) return res.status(400).json({ success: false, error: 'El título o nombre del recurso es obligatorio.' });

        let sedeId = req.body.sede_id || 'campeche';
        if (req.user.rol !== 'desarrollador' && req.user.sede_id) sedeId = req.user.sede_id;

        let codigoRecurso = (req.body.codigo_recurso || req.body.id || finalTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')).substring(0, 50) || `recurso_${Date.now()}`;
        const [dupCheck] = await getPool().query('SELECT id FROM pool_recursos_multimedia WHERE codigo_recurso = ? LIMIT 1', [codigoRecurso]);
        if (dupCheck.length > 0) codigoRecurso = `${codigoRecurso}_${Date.now().toString().slice(-4)}`;

        const finalCategoria = categoria || 'plan_estudios';
        const finalModalidad = (modalidad || 'Presencial').trim();
        const finalCiclo = ciclo_escolar || await getActiveCicloEscolar(sedeId);
        const scopeLabel = scope === 'unid_nacional' ? '🌐 UNID Online (Nacional)' : scope === 'ejecutiva_campeche' ? '👔 Campus Campeche (Ejecutiva / Dual)' : scope === 'todas' ? '🎓 Recurso Institucional UNID' : '🏛️ Campus Campeche (Presencial)';

        const incomingBase64 = fileData || file_data_base64 || '';
        const incomingFileName = fileName || file_name || '';
        const uploadedMeta = (incomingBase64 && String(incomingBase64).startsWith('data:')) ? saveUploadedBase64File(incomingBase64, incomingFileName, codigoRecurso) : null;

        const finalTipoArchivo = uploadedMeta ? uploadedMeta.tipo_archivo : (tipo_archivo || 'pdf');
        const finalFileName = uploadedMeta ? uploadedMeta.file_name : (incomingFileName ? incomingFileName.trim() : `${codigoRecurso}.${finalTipoArchivo === 'imagen' ? 'png' : 'pdf'}`);
        const finalUrl = uploadedMeta ? uploadedMeta.url_recurso : ((url_recurso || pdfUrl || '').trim() || `/api/brochures/${codigoRecurso}/download`);
        const finalSize = uploadedMeta ? uploadedMeta.tamano : (size ? size.trim() : '1.2 MB');
        const parsedTags = Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [codigoRecurso, finalTitle.toLowerCase()]);
        const finalDescripcionIa = (descripcion_ia || '').trim() || `${finalTitle} (${finalCategoria}) en modalidad ${finalModalidad}.`;

        await getPool().execute(`
            INSERT INTO pool_recursos_multimedia (
                codigo_recurso, sede_id, ciclo_escolar, categoria, titulo, descripcion_ia,
                scope, scope_label, modalidad, duracion, rvoe, tipo_archivo,
                file_name, url_recurso, tamano, tags, subido_por, updated_by, activo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `, [codigoRecurso, sedeId, finalCiclo, finalCategoria, finalTitle, finalDescripcionIa, scope || 'campus_campeche', scopeLabel, finalModalidad, duracion ? duracion.trim() : '3 años (9 cuatrimestres)', rvoe ? rvoe.trim() : 'SEP-RVOE-OFICIAL', finalTipoArchivo, finalFileName, finalUrl, finalSize, JSON.stringify(parsedTags), req.user?.correo_institucional || 'admin@red.unid.mx', req.user?.correo_institucional || 'admin@red.unid.mx']);

        const item = { id: codigoRecurso, codigo_recurso: codigoRecurso, sede_id: sedeId, ciclo_escolar: finalCiclo, categoria: finalCategoria, titulo: finalTitle, carrera: finalTitle, descripcion_ia: finalDescripcionIa, scope: scope || 'campus_campeche', scopeLabel, modalidad: finalModalidad, duracion: duracion ? duracion.trim() : '3 años (9 cuatrimestres)', rvoe: rvoe ? rvoe.trim() : 'SEP-RVOE-OFICIAL', tipo_archivo: finalTipoArchivo, fileName: finalFileName, pdfUrl: finalUrl, url_recurso: finalUrl, size: finalSize, tags: parsedTags };
        if (!uploadedMeta && finalTipoArchivo === 'pdf') {
            try { fs.writeFileSync(path.join(UPLOADS_DIR, finalFileName), generateOfficialPdfBuffer(item)); } catch (_) {}
        }
        const brochures = getBrochures();
        const idx = brochures.findIndex(b => b.id === codigoRecurso);
        if (idx >= 0) brochures[idx] = item; else brochures.push(item);
        saveBrochuresToDisk();
        return res.status(201).json({ success: true, item, brochure: item });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function handleUpdatePoolResource(req, res) {
    try {
        const { id } = req.params;
        const { titulo, carrera, categoria, descripcion_ia, scope, modalidad, duracion, rvoe, fileName, file_name, pdfUrl, url_recurso, size, tags, ciclo_escolar, tipo_archivo, fileData, file_data_base64 } = req.body;
        const [rows] = await getPool().query('SELECT * FROM pool_recursos_multimedia WHERE codigo_recurso = ? OR id = ? LIMIT 1', [id, id]);
        const brochures = getBrochures();
        const current = rows[0] || brochures.find(b => b.id === id);
        if (!current) return res.status(404).json({ success: false, error: 'Recurso no encontrado en el Pool.' });

        const codigoRecurso = current.codigo_recurso || current.id || id;
        const incomingBase64 = fileData || file_data_base64 || '';
        const incomingFileName = fileName || file_name || '';
        const uploadedMeta = (incomingBase64 && String(incomingBase64).startsWith('data:')) ? saveUploadedBase64File(incomingBase64, incomingFileName, codigoRecurso) : null;

        const finalTitle = (titulo || carrera || current.titulo || current.carrera || '').trim();
        const finalCategoria = categoria || current.categoria || 'plan_estudios';
        const finalModalidad = modalidad ? modalidad.trim() : (current.modalidad || 'Presencial');
        const finalCiclo = ciclo_escolar || current.ciclo_escolar || '2026-3 Septiembre';
        const finalScope = scope || current.scope || 'campus_campeche';
        const scopeLabel = finalScope === 'unid_nacional' ? '🌐 UNID Online (Nacional)' : finalScope === 'ejecutiva_campeche' ? '👔 Campus Campeche (Ejecutiva / Dual)' : finalScope === 'todas' ? '🎓 Recurso Institucional UNID' : '🏛️ Campus Campeche (Presencial)';
        const finalTipoArchivo = uploadedMeta ? uploadedMeta.tipo_archivo : (tipo_archivo || current.tipo_archivo || 'pdf');
        const finalFileName = uploadedMeta ? uploadedMeta.file_name : (incomingFileName ? incomingFileName.trim() : (current.file_name || current.fileName || `${codigoRecurso}.pdf`));
        const finalUrl = uploadedMeta ? uploadedMeta.url_recurso : ((url_recurso || pdfUrl || current.url_recurso || current.pdfUrl || `/api/brochures/${codigoRecurso}/download`)).trim();
        const finalSize = uploadedMeta ? uploadedMeta.tamano : (size ? size.trim() : (current.tamano || current.size || '1.2 MB'));
        const finalDuracion = duracion ? duracion.trim() : (current.duracion || '3 años (9 cuatrimestres)');
        const finalRvoe = rvoe ? rvoe.trim() : (current.rvoe || 'SEP-RVOE-OFICIAL');
        const finalDescripcionIa = descripcion_ia !== undefined ? descripcion_ia.trim() : (current.descripcion_ia || '');
        const parsedTags = Array.isArray(tags) ? tags : (tags !== undefined ? String(tags).split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : []);

        if (rows.length > 0) {
            await getPool().execute(`
                UPDATE pool_recursos_multimedia SET ciclo_escolar = ?, categoria = ?, titulo = ?, descripcion_ia = ?, scope = ?, scope_label = ?, modalidad = ?, duracion = ?, rvoe = ?, tipo_archivo = ?, file_name = ?, url_recurso = ?, tamano = ?, tags = ?, updated_by = ?
                WHERE id = ?
            `, [finalCiclo, finalCategoria, finalTitle, finalDescripcionIa, finalScope, scopeLabel, finalModalidad, finalDuracion, finalRvoe, finalTipoArchivo, finalFileName, finalUrl, finalSize, JSON.stringify(parsedTags), req.user?.correo_institucional || 'admin@red.unid.mx', rows[0].id]);
        }

        const updatedObj = { id: codigoRecurso, codigo_recurso: codigoRecurso, ciclo_escolar: finalCiclo, categoria: finalCategoria, titulo: finalTitle, carrera: finalTitle, descripcion_ia: finalDescripcionIa, scope: finalScope, scopeLabel, modalidad: finalModalidad, duracion: finalDuracion, rvoe: finalRvoe, tipo_archivo: finalTipoArchivo, fileName: finalFileName, pdfUrl: finalUrl, url_recurso: finalUrl, size: finalSize, tags: parsedTags };
        const bIndex = brochures.findIndex(b => b.id === codigoRecurso);
        if (bIndex !== -1) { brochures[bIndex] = { ...brochures[bIndex], ...updatedObj }; saveBrochuresToDisk(); }
        return res.json({ success: true, item: updatedObj, brochure: updatedObj });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function handleDeletePoolResource(req, res) {
    try {
        const { id } = req.params;
        await getPool().execute('DELETE FROM pool_recursos_multimedia WHERE codigo_recurso = ? OR id = ?', [id, id]);
        const brochures = getBrochures();
        const idx = brochures.findIndex(b => b.id === id);
        if (idx !== -1) { brochures.splice(idx, 1); saveBrochuresToDisk(); }
        return res.json({ success: true, message: 'Recurso eliminado exitosamente del Pool.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

router.post('/api/pool', authMiddleware, handleCreatePoolResource);
router.post('/api/brochures', authMiddleware, handleCreatePoolResource);
router.put('/api/pool/:id', authMiddleware, handleUpdatePoolResource);
router.put('/api/brochures/:id', authMiddleware, handleUpdatePoolResource);
router.delete('/api/pool/:id', authMiddleware, handleDeletePoolResource);
router.delete('/api/brochures/:id', authMiddleware, handleDeletePoolResource);

router.get('/api/brochures/:id/download', async (req, res) => {
    const reqId = req.params.id;
    let resource = null;
    try {
        const [rows] = await getPool().query('SELECT * FROM pool_recursos_multimedia WHERE codigo_recurso = ? OR id = ? LIMIT 1', [reqId, reqId]);
        if (rows.length > 0) {
            resource = { id: rows[0].codigo_recurso, carrera: rows[0].titulo, modalidad: rows[0].modalidad, duracion: rows[0].duracion, rvoe: rows[0].rvoe, fileName: rows[0].file_name, pdfUrl: rows[0].url_recurso, descripcion_ia: rows[0].descripcion_ia };
        }
    } catch (_) {}
    const brochures = getBrochures();
    if (!resource) resource = brochures.find(b => b.id === reqId) || brochures[0];
    if (resource?.pdfUrl?.startsWith('/uploads/')) {
        const localFile = path.join(ROOT_DIR, 'public', resource.pdfUrl);
        if (fs.existsSync(localFile)) return res.sendFile(localFile);
    }
    if (resource?.pdfUrl && (resource.pdfUrl.startsWith('http://') || resource.pdfUrl.startsWith('https://')) && !resource.pdfUrl.includes('digitalmedia.talisis.com')) {
        return res.redirect(resource.pdfUrl);
    }
    const safeFileName = resource?.fileName || `Plan_${reqId}_UNID_2026.pdf`;
    const diskPdfPath = path.join(UPLOADS_DIR, safeFileName);
    if (fs.existsSync(diskPdfPath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
        return res.sendFile(diskPdfPath);
    }
    const pdfBuffer = generateOfficialPdfBuffer(resource);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
    return res.status(200).send(pdfBuffer);
});

module.exports = router;
