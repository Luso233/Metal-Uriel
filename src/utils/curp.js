const { UNID_CAMPUSES } = require('../config/campuses');

function normalizeForMatch(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

// ==========================================
// Algoritmo Oficial de Generación de CURP (RENAPO)
// ==========================================
function generarCurp(datos) {
    if (!datos) return null;
    const { nombre_completo, fecha_nacimiento, sexo, estado_nacimiento } = datos;
    if (!nombre_completo || !fecha_nacimiento) return null;

    const normalize = (str) => {
        if (!str) return '';
        return String(str)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .trim();
    };

    const ESTADOS = {
        'AGUASCALIENTES': 'AS', 'BAJA CALIFORNIA SUR': 'BS', 'BAJA CALIFORNIA': 'BC',
        'CAMPECHE': 'CC', 'COAHUILA': 'CL', 'COLIMA': 'CM', 'CHIAPAS': 'CS',
        'CHIHUAHUA': 'CH', 'CIUDAD DE MEXICO': 'DF', 'CDMX': 'DF', 'DISTRITO FEDERAL': 'DF',
        'DURANGO': 'DG', 'GUANAJUATO': 'GT', 'GUERRERO': 'GR', 'HIDALGO': 'HG',
        'JALISCO': 'JC', 'ESTADO DE MEXICO': 'MC', 'MEXICO': 'MC', 'EDOMEX': 'MC',
        'MICHOACAN': 'MN', 'MORELOS': 'MS', 'NAYARIT': 'NT', 'NUEVO LEON': 'NL',
        'OAXACA': 'OC', 'PUEBLA': 'PL', 'QUERETARO': 'QT', 'QUINTANA ROO': 'QR',
        'SAN LUIS POTOSI': 'SP', 'SINALOA': 'SL', 'SONORA': 'SR', 'TABASCO': 'TC',
        'TAMAULIPAS': 'TS', 'TLAXCALA': 'TL', 'VERACRUZ': 'VZ', 'YUCATAN': 'YN',
        'ZACATECAS': 'ZS', 'EXTRANJERO': 'NE', 'FORANEO': 'NE'
    };

    const PALABRAS_INCONVENIENTES = [
        'BACA', 'BACO', 'BUEI', 'BUEY', 'CACA', 'CACO', 'CAGA', 'CAGO', 'CAKA', 'CAKO',
        'COGE', 'COGI', 'COJA', 'COJE', 'COJI', 'COJO', 'COLA', 'CULO', 'FALO', 'FETO',
        'GETA', 'GUEI', 'GUEY', 'JETA', 'JOTO', 'KACA', 'KACO', 'KAGA', 'KAGO', 'KAKA',
        'KAKO', 'KOGE', 'KOGI', 'KOJA', 'KOJE', 'KOJI', 'KOJO', 'KOLA', 'KULO', 'LILO',
        'LOCA', 'LOCO', 'LOKA', 'LOKO', 'MAME', 'MAMO', 'MEAR', 'MEAS', 'MEON', 'MIAR',
        'MION', 'MOCO', 'MOKO', 'MULA', 'MULO', 'NADA', 'PEDA', 'PEDO', 'PENE', 'PIPI',
        'PITO', 'POPO', 'PUTA', 'PUTO', 'QULO', 'RATA', 'ROBA', 'ROBE', 'ROBO', 'RUIN',
        'SENO', 'TETA', 'VACA', 'VACO', 'VAGA', 'VAGO', 'VUEI', 'VUEY', 'WUEI', 'WUEY'
    ];

    const PREPOSICIONES = ['DE', 'DEL', 'DE LA', 'DE LOS', 'DE LAS', 'LA', 'LAS', 'LOS', 'Y', 'MC', 'MAC', 'VON', 'VAN'];

    let cleanName = normalize(nombre_completo);
    PREPOSICIONES.forEach(prep => {
        const regex = new RegExp('(^|\\s)' + prep + '(\\s|$)', 'gi');
        cleanName = cleanName.replace(regex, ' ').replace(/\s+/g, ' ').trim();
    });

    const parts = cleanName.split(' ').filter(p => p.length > 0);
    if (parts.length === 0) return null;

    let nombres = '', paterno = '', materno = '';
    if (parts.length === 1) {
        paterno = parts[0];
        nombres = parts[0];
    } else if (parts.length === 2) {
        nombres = parts[0];
        paterno = parts[1];
    } else if (parts.length === 3) {
        nombres = parts[0];
        paterno = parts[1];
        materno = parts[2];
    } else {
        nombres = parts.slice(0, parts.length - 2).join(' ');
        paterno = parts[parts.length - 2];
        materno = parts[parts.length - 1];
    }

    const nombreParts = nombres.split(' ');
    let primerNombre = nombreParts[0];
    if (nombreParts.length > 1 && (primerNombre === 'JOSE' || primerNombre === 'MARIA' || primerNombre === 'MA' || primerNombre === 'J')) {
        primerNombre = nombreParts[1];
    }

    const getFirstLetter = (str) => {
        if (!str || str.length === 0) return 'X';
        const char = str.charAt(0);
        return char === 'Ñ' ? 'X' : char;
    };

    const getFirstInternalVowel = (str) => {
        if (!str || str.length < 2) return 'X';
        for (let i = 1; i < str.length; i++) {
            if ('AEIOU'.includes(str.charAt(i))) return str.charAt(i);
        }
        return 'X';
    };

    const getFirstInternalConsonant = (str) => {
        if (!str || str.length < 2) return 'X';
        for (let i = 1; i < str.length; i++) {
            const char = str.charAt(i);
            if (!'AEIOU'.includes(char) && /[A-ZÑ]/.test(char)) {
                return char === 'Ñ' ? 'X' : char;
            }
        }
        return 'X';
    };

    let l1 = getFirstLetter(paterno);
    let l2 = getFirstInternalVowel(paterno);
    let l3 = getFirstLetter(materno);
    let l4 = getFirstLetter(primerNombre);

    let iniciales = `${l1}${l2}${l3}${l4}`;
    if (PALABRAS_INCONVENIENTES.includes(iniciales)) {
        iniciales = `${l1}X${l3}${l4}`;
    }

    const fechaRaw = String(fecha_nacimiento).trim();
    let year = '00', month = '01', day = '01';
    let fullYear = 2000;

    const isoMatch = fechaRaw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    const ddmmyyyyMatch = fechaRaw.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);

    if (isoMatch) {
        fullYear = parseInt(isoMatch[1], 10);
        year = isoMatch[1].slice(-2);
        month = isoMatch[2].padStart(2, '0');
        day = isoMatch[3].padStart(2, '0');
    } else if (ddmmyyyyMatch) {
        fullYear = parseInt(ddmmyyyyMatch[3], 10);
        year = ddmmyyyyMatch[3].slice(-2);
        month = ddmmyyyyMatch[2].padStart(2, '0');
        day = ddmmyyyyMatch[1].padStart(2, '0');
    }

    const fechaCurp = `${year}${month}${day}`;

    let sexoChar = 'H';
    const sNorm = normalize(sexo);
    if (sNorm.includes('FEM') || sNorm.includes('MUJER') || sNorm === 'M' || sNorm === 'F') {
        sexoChar = 'M';
    } else if (sNorm.includes('MAS') || sNorm.includes('HOMBRE') || sNorm === 'H') {
        sexoChar = 'H';
    } else {
        sexoChar = 'X';
    }

    let estadoCode = 'CC';
    const eNorm = normalize(estado_nacimiento);
    for (const [key, code] of Object.entries(ESTADOS)) {
        if (eNorm.includes(key) || key.includes(eNorm)) {
            estadoCode = code;
            break;
        }
    }

    const c1 = getFirstInternalConsonant(paterno);
    const c2 = getFirstInternalConsonant(materno);
    const c3 = getFirstInternalConsonant(primerNombre);
    const sigloChar = fullYear >= 2000 ? 'A' : '0';

    const curp17 = `${iniciales}${fechaCurp}${sexoChar}${estadoCode}${c1}${c2}${c3}${sigloChar}`;

    const diccionario = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
    let suma = 0;
    for (let i = 0; i < 17; i++) {
        const char = curp17.charAt(i);
        const valor = diccionario.indexOf(char);
        suma += (valor >= 0 ? valor : 0) * (18 - i);
    }
    const digitoVerificador = (10 - (suma % 10)) % 10;

    return `${curp17}${digitoVerificador}`;
}

function resolveSedeId(campusStr) {
    if (!campusStr) return 'campeche';
    const c = String(campusStr).toLowerCase();
    for (const u of UNID_CAMPUSES) {
        if (c.includes(u.id) || c.includes(u.name.toLowerCase().replace('campus ', ''))) {
            return u.id;
        }
    }
    if (c.includes('campeche')) return 'campeche';
    if (c.includes('cancun') || c.includes('cancún')) return 'cancun';
    if (c.includes('merida') || c.includes('mérida')) return 'merida';
    if (c.includes('villahermosa')) return 'villahermosa';
    if (c.includes('online') || c.includes('virtual')) return 'online_nacional';
    return 'campeche';
}

function extractPartialFieldsFromHistory(history) {
    if (!history || !Array.isArray(history) || history.length === 0) return {};
    const fields = {};

    const userMessages = history
        .filter(h => h.role === 'user' || h.sender === 'user')
        .map(h => h.content || h.text || '')
        .filter(t => t.trim().length > 0);

    if (userMessages.length === 0) return {};
    const userText = userMessages.join('\n');

    const phoneMatch = userText.match(/(?:\+?52\s?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}|\b981\d{7}\b|\b\d{10}\b/);
    if (phoneMatch) fields.telefono_celular = phoneMatch[0].replace(/[^\d+]/g, '');

    const emailMatch = userText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) fields.correo_electronico = emailMatch[0].trim();

    const dateMatch = userText.match(/\b(19\d\d|200\d)[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b|\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](19\d\d|200\d)\b/);
    if (dateMatch) fields.fecha_nacimiento = dateMatch[0].trim();

    const blacklistWords = ['preparatoria', 'bachillerato', 'carrera', 'campus', 'modalidad', 'interes', 'interés', 'procedencia', 'telefono', 'correo', 'nacimiento', 'estudios', 'de la', 'en la', 'unid', 'hola', 'buenas', 'informes'];

    for (const msg of userMessages) {
        const nameRegexMatch = msg.match(/(?:me llamo|mi nombre es|soy)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){1,4})/i);
        if (nameRegexMatch) {
            const candidate = nameRegexMatch[1].trim();
            const candLower = candidate.toLowerCase();
            if (!blacklistWords.some(bw => candLower.includes(bw)) && candidate.split(/\s+/).length >= 2) {
                fields.nombre_completo = candidate;
                break;
            }
        }
    }

    if (!fields.nombre_completo) {
        for (const msg of userMessages) {
            const lines = msg.split(/[\r\n,]+/);
            for (const line of lines) {
                const trimmed = line.trim();
                const words = trimmed.split(/\s+/);
                if (words.length >= 2 && words.length <= 4 && words.every(w => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(w))) {
                    const candLower = trimmed.toLowerCase();
                    if (!blacklistWords.some(bw => candLower.includes(bw))) {
                        fields.nombre_completo = trimmed;
                        break;
                    }
                }
            }
            if (fields.nombre_completo) break;
        }
    }

    if (/\b(hombre|masculino|varon|varón|chico)\b/i.test(userText) && !/\bmujer\b/i.test(userText)) fields.sexo = 'Masculino';
    else if (/\b(mujer|femenino|dama|chica)\b/i.test(userText)) fields.sexo = 'Femenino';

    const estadoMatch = userText.match(/\b(campeche|tabasco|yucat[aá]n|quintana roo|veracruz|chiapas|cdmx|ciudad de m[eé]xico|jalisco|puebla|m[eé]xico|guerrero|oaxaca|nuevo le[oó]n|monterrey|guadalajara|m[eé]rida|villahermosa)\b/i);
    if (estadoMatch) fields.estado_nacimiento = estadoMatch[1].charAt(0).toUpperCase() + estadoMatch[1].slice(1).toLowerCase();

    const prepMatch = userText.match(/(?:coba(?:cam)?|cbtis|cetis|conalep|prepa\s*\d*|colegio\s*[\w]+|bachilleres|cumbres|cetmar|xail|instituto\s*[\w]+)[^,.\n]*/i);
    if (prepMatch) {
        const cleanPrep = prepMatch[0].replace(/[\*\_]+/g, '').trim();
        if (!/^(?:preparatoria|bachillerato)\s*(?:de)?\s*procedencia$/i.test(cleanPrep)) {
            fields.bachillerato_procedencia = cleanPrep;
        }
    } else {
        for (const uMsg of userMessages) {
            const match = uMsg.match(/(?:la\s+preparatoria\s+era\s+|era\s+|vengo\s+de\s+|salí\s+del?\s+)(.+)/i);
            if (match) {
                fields.bachillerato_procedencia = match[1].replace(/[\*\_]+/g, '').trim();
                break;
            }
        }
    }

    const carreraMatch = userText.match(/(?:ingenier[ií]a en software|software y sistemas|ingenier[ií]a en sistemas|sistemas computacionales|ingenier[ií]a|software|sistemas|derecho|administraci[oó]n|dise[ñn]o gr[aá]fico|psicolog[ií]a|mercadotecnia|arquitectura|comunicaci[oó]n|contabilidad|educaci[oó]n f[ií]sica|criminolog[ií]a|pedagog[ií]a|negocios internacionales)[^,.\n]*/i);
    if (carreraMatch) {
        const c = carreraMatch[0].trim();
        fields.carrera_interes = /software|sistemas/i.test(c) ? 'Ingeniería en Software y Sistemas Computacionales' : c;
    }

    const cpMatch = userText.match(/\b(?:CP\s*|c\.p\.\s*)?(\d{5})\b/i);
    if (cpMatch) fields.codigo_postal = cpMatch[1];
    const dirMatch = userText.match(/(?:calle|colonia|col\.|av\.|avenida|fracc\.|fraccionamiento|mza|lote|manzana)[^.\n]*/i);
    if (dirMatch) fields.direccion = dirMatch[0].trim() + (fields.codigo_postal ? ` CP ${fields.codigo_postal}` : '');

    if (/campeche/i.test(userText)) fields.campus_interes = 'Campus San Francisco de Campeche';
    else if (/cancun|cancún/i.test(userText)) fields.campus_interes = 'Campus Cancún';
    else if (/merida|mérida/i.test(userText)) fields.campus_interes = 'Campus Mérida';
    else if (/online|virtual|en l[ií]nea/i.test(userText)) fields.campus_interes = 'UNID Online Nacional';
    else fields.campus_interes = 'Campus San Francisco de Campeche';

    if (/online|en l[ií]nea|virtual|a distancia/i.test(userText)) fields.modalidad_estudios = 'Licenciaturas Online (100% Virtual)';
    else if (/ejecutiva|sabad|fin de semana|trabaj/i.test(userText)) fields.modalidad_estudios = 'Modalidad Ejecutiva (Sábados)';
    else if (/presencial|escolarizad|matutino/i.test(userText)) fields.modalidad_estudios = 'Presencial';

    if (fields.nombre_completo && fields.fecha_nacimiento) {
        fields.curp = generarCurp(fields);
    }
    return fields;
}

function extractJsonFromLlmReply(rawText) {
    if (!rawText || typeof rawText !== 'string') return { cleanReply: rawText, jsonData: null };

    let cleanReply = rawText;
    let jsonData = null;

    const codeBlockMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (codeBlockMatch) {
        try {
            const parsed = JSON.parse(codeBlockMatch[1]);
            if (parsed && typeof parsed === 'object') {
                jsonData = parsed;
                cleanReply = rawText.replace(codeBlockMatch[0], '').trim();
            }
        } catch (_) {}
    }

    if (!jsonData) {
        const rawJsonMatch = rawText.match(/(\{[\s\r\n]*"(?:completado|nombre_completo)"[\s\S]*\})/i);
        if (rawJsonMatch) {
            try {
                const parsed = JSON.parse(rawJsonMatch[1]);
                if (parsed && typeof parsed === 'object') {
                    jsonData = parsed;
                    cleanReply = rawText.replace(rawJsonMatch[1], '').trim();
                }
            } catch (_) {}
        }
    }

    cleanReply = cleanReply
        .replace(/\[ADJUNTAR_RECURSO\s*:\s*[^\]]+\]/gi, '')
        .replace(/\[ENVIAR_PDF[^\]]*\]/gi, '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

    return { cleanReply, jsonData };
}

module.exports = {
    normalizeForMatch,
    generarCurp,
    resolveSedeId,
    extractPartialFieldsFromHistory,
    extractJsonFromLlmReply
};
