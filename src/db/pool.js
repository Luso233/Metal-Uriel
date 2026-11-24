const mysql = require('mysql2/promise');

function createMariaPool() {
    return mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'unid_admisiones',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
}

let dbPool = createMariaPool();
let databaseReady = false;

function getPool() {
    return dbPool;
}

async function rebuildPool() {
    const oldPool = dbPool;
    dbPool = createMariaPool();
    if (oldPool) {
        try { await oldPool.end(); } catch (_) {}
    }
    return dbPool;
}

function isDatabaseReady() {
    return databaseReady;
}

function setDatabaseReady(val) {
    databaseReady = Boolean(val);
}

module.exports = {
    createMariaPool,
    getPool,
    rebuildPool,
    isDatabaseReady,
    setDatabaseReady
};
