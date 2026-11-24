import React, { useState, useEffect, useRef } from 'react';
import {
  getServerUrl,
  saveServerUrl,
  clearServerUrl,
  validateServerUrl,
  testServerConnection,
  isNativeCapacitor
} from '../utils/serverConnection.js';

export default function ServerConnectionModal({ isOpen, onClose, onConnected, forceRequired = false }) {
  const [urlInput, setUrlInput] = useState(() => getServerUrl());
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setUrlInput(getServerUrl());
      setError('');
      setTestResult(null);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isNative = isNativeCapacitor();

  const handleChange = (val) => {
    setUrlInput(val);
    setTestResult(null);
    if (error || touched) {
      const nextErr = validateServerUrl(val);
      if (!nextErr) setError('');
    }
  };

  const handleBlur = () => {
    setTouched(true);
    if (!urlInput.trim() && !isNative) {
      setError('');
      return;
    }
    setError(validateServerUrl(urlInput));
  };

  const handleTest = async () => {
    setTouched(true);
    const valErr = validateServerUrl(urlInput);
    if (valErr) {
      setError(valErr);
      return;
    }
    setError('');
    setTesting(true);
    setTestResult(null);
    const res = await testServerConnection(urlInput);
    setTesting(false);
    setTestResult(res);
    if (!res.ok) setError(res.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);

    if (!urlInput.trim() && !isNative) {
      clearServerUrl();
      if (onConnected) onConnected('');
      if (onClose) onClose();
      return;
    }

    const valErr = validateServerUrl(urlInput);
    if (valErr) {
      setError(valErr);
      inputRef.current?.focus();
      return;
    }

    setTesting(true);
    const res = await testServerConnection(urlInput);
    setTesting(false);
    setTestResult(res);
    if (!res.ok) {
      setError(res.error);
      return;
    }

    const saved = saveServerUrl(res.url);
    if (onConnected) onConnected(saved);
    if (onClose) onClose();
  };

  const handleResetLocal = () => {
    clearServerUrl();
    setUrlInput('');
    setError('');
    setTestResult(null);
    if (onConnected) onConnected('');
    if (onClose) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="server-conn-title"
    >
      <div className="w-full max-w-lg rounded-3xl bg-[#0F172A] border border-amber-500/40 shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFC72C] to-amber-600 flex items-center justify-center text-xl shadow">
              📡
            </div>
            <div>
              <h2 id="server-conn-title" className="text-base sm:text-lg font-black text-white">
                Conectar a Servidor Metal-Uriel
              </h2>
              <p className="text-xs text-slate-400">
                {isNative
                  ? 'App Android Capacitor • Apunta a tu servidor Headless o LAN UNID'
                  : 'Conecta este panel a un servidor Headless remoto o vuelve al servidor local'}
              </p>
            </div>
          </div>
          {!forceRequired && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar conexión de servidor"
              className="wizard-btn min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm"
            >
              ✕
            </button>
          )}
        </div>

        <form noValidate onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="metal-server-url" className="text-sm font-bold text-slate-100">
              URL del Servidor Metal-Uriel {isNative && <span className="text-amber-400" aria-hidden="true">*</span>}
            </label>
            <span id="metal-server-url-hint" className="text-xs text-slate-400 leading-snug">
              Usa tu túnel HTTPS (ej. <code className="text-sky-300">https://admisiones.tudominio.mx</code>) o la IP LAN del campus (ej. <code className="text-amber-300">http://192.168.1.50:3000</code>).
            </span>
            <input
              ref={inputRef}
              id="metal-server-url"
              name="serverUrl"
              type="url"
              inputMode="url"
              required={isNative}
              value={urlInput}
              placeholder="http://192.168.1.50:3000"
              onChange={(e) => handleChange(e.target.value)}
              onBlur={handleBlur}
              autoComplete="url"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="go"
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? 'metal-server-url-hint metal-server-url-err' : 'metal-server-url-hint'}
              className={`wizard-input w-full rounded-xl bg-[#0A192F] text-slate-100 px-3.5 py-2.5 border font-mono ${
                error ? 'user-invalid-fallback border-red-500' : 'border-slate-600'
              }`}
            />
            {error && (
              <p id="metal-server-url-err" role="alert" className="text-xs font-semibold text-red-400 mt-0.5">
                ❌ {error}
              </p>
            )}
          </div>

          {testResult?.ok && (
            <div
              role="status"
              className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200 space-y-1"
            >
              <div className="font-bold text-emerald-300">
                ✅ Conectado a {testResult.botName} v{testResult.apiVersion} ({testResult.latencyMs} ms)
              </div>
              <div className="text-[11px] text-emerald-200/80">
                Modo: <strong className="uppercase">{testResult.mode}</strong> • MariaDB:{' '}
                <strong>{testResult.dbConnected ? 'Online' : 'Offline / Pendiente Setup'}</strong>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={testing}
              onClick={handleTest}
              className="wizard-btn min-h-[48px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 text-xs font-bold transition disabled:opacity-50"
            >
              {testing ? '⏳ Probando...' : '🔍 Probar Conexión'}
            </button>
            <button
              type="submit"
              disabled={testing}
              className="wizard-btn flex-1 min-h-[48px] px-5 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] text-slate-950 font-black text-xs sm:text-sm shadow hover:brightness-110 transition disabled:opacity-50"
            >
              {testing ? 'Conectando...' : '🚀 Guardar y Conectar'}
            </button>
          </div>

          {!isNative && getServerUrl() && (
            <button
              type="button"
              onClick={handleResetLocal}
              className="wizard-btn w-full min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold"
            >
              Volver al servidor local (mismo origen)
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
