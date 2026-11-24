#!/usr/bin/env node
// =========================================================================
// :UNID • Metal-Uriel v3.0 — Entrypoint Headless (Solo API + Webhook + Bot IA)
// Uso: npm run start:headless  |  node headless.js
// Diseñado para servidores dedicados + conexión remota desde la APK Capacitor Android.
// =========================================================================
process.env.HEADLESS_MODE = 'true';
const { startServer } = require('./index');

startServer();
