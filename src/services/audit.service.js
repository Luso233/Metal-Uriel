const { getPool } = require('../db/pool');
const {
    createAuditRecorder,
    diffSensitiveKeys,
    maskSecretSafe,
    sanitizeAuditDetail
} = require('../../lib/audit-log-utils');

const recorder = createAuditRecorder({ getPool });

module.exports = {
    ...recorder,
    diffSensitiveKeys,
    maskSecretSafe,
    sanitizeAuditDetail
};
