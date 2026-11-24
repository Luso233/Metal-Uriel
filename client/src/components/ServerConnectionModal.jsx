import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import {
  getServerUrl,
  saveServerUrl,
  clearServerUrl,
  validateServerUrl,
  testServerConnection,
  isNativeCapacitor
} from '../utils/serverConnection.js';

function parseScannedQrPayload(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;

  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      const rawUrl = String(obj.s || obj.serverUrl || obj.url || '').trim().replace(/\/+$/, '');
      const code = String(obj.c || obj.code || obj.pair || '').trim();
      if (rawUrl) return { serverUrl: rawUrl, code };
    } catch (_) {}
  }

  try {
    const u = new URL(text);
    if (u.protocol === 'metaluriel:') {
      const rawUrl = String(u.searchParams.get('s') || u.searchParams.get('server') || '').trim().replace(/\/+$/, '');
      const code = String(u.searchParams.get('c') || u.searchParams.get('code') || u.searchParams.get('pair') || '').trim();
      if (rawUrl) return { serverUrl: rawUrl, code };
    }
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      const serverUrl = `${u.protocol}//${u.host}`;
      const code = String(u.searchParams.get('pair') || u.searchParams.get('code') || '').trim();
      return { serverUrl, code };
    }
  } catch (_) {}

  return null;
}

export default function ServerConnectionModal({
  isOpen,
  onClose,
  onConnected,
  onPairedAuth,
  forceRequired = false
}) {
  const [urlInput, setUrlInput] = useState(() => getServerUrl());
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [touched, setTouched] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showManual, setShowManual] = useState(() => !isNativeCapacitor());

  // Escáner QR con cámara en vivo + fallback por foto
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  const stopCamera = () => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch (_) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (isOpen) {
      setUrlInput(getServerUrl());
      setPinInput('');
      setError('');
      setStatusMsg('');
      setCameraError('');
      setTestResult(null);
      setScannerOpen(false);
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  if (!isOpen) return null;

  const isNative = isNativeCapacitor();
  const isVirtualAdapterIp = /https?:\/\/(192\.168\.56\.|192\.168\.248\.|169\.254\.|127\.0\.0\.1|localhost)/i.test(urlInput.trim());

  const completePairingWithServer = async (targetUrl, code = '', pin = '') => {
    setTesting(true);
    setError('');
    setStatusMsg('🔌 Conectando y vinculando tu sesión...');
    try {
      const cleanUrl = String(targetUrl || '').trim().replace(/\/+$/, '');
      const valErr = validateServerUrl(cleanUrl);
      if (valErr) throw new Error(valErr);

      const healthRes = await testServerConnection(cleanUrl);
      setTestResult(healthRes);
      if (!healthRes.ok) throw new Error(healthRes.error);

      const saved = saveServerUrl(healthRes.url);
      setUrlInput(saved);

      if (code || pin) {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 8000);
        try {
          const claimRes = await fetch(`${saved}/api/auth/mobile-pair/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: code || undefined,
              pin: pin ? pin.replace(/\D/g, '') : undefined,
              deviceLabel: isNative ? 'App Android Metal-Uriel' : 'Navegador Móvil Metal-Uriel'
            }),
            signal: controller.signal
          });
          const claimData = await claimRes.json();
          if (!claimRes.ok || !claimData.success) {
            throw new Error(claimData.error || 'El código QR expiró o no es válido.');
          }
          setStatusMsg('✅ ¡Vinculado! Entrando al Centro de Mando...');
          if (onPairedAuth) {
            onPairedAuth({ token: claimData.token, user: claimData.user, serverUrl: saved });
          } else if (onConnected) {
            onConnected(saved);
          }
          if (onClose) onClose();
          return;
        } finally {
          clearTimeout(t);
        }
      }

      if (onConnected) onConnected(saved);
      if (onClose) onClose();
    } catch (err) {
      setStatusMsg('');
      setError(err.name === 'AbortError' ? 'Tiempo de espera agotado al vincular. Revisa Wi-Fi y Firewall.' : err.message);
      setShowManual(true);
    } finally {
      setTesting(false);
    }
  };

  const handleDecodedQrText = (rawText) => {
    const parsed = parseScannedQrPayload(rawText);
    if (!parsed || !parsed.serverUrl) {
      setError('El QR escaneado no corresponde a Metal-Uriel. Genera uno desde "📱 Vincular Celular" en tu PC.');
      return;
    }
    stopCamera();
    setScannerOpen(false);
    completePairingWithServer(parsed.serverUrl, parsed.code);
  };

  const startLiveScanner = async () => {
    setError('');
    setCameraError('');
    setScannerOpen(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Tu dispositivo no expone cámara en vivo aquí. Usa el botón "📸 Tomar Foto del QR".');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      streamRef.current = stream;

      setTimeout(() => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});

        scanTimerRef.current = setInterval(() => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return;

          const maxDim = 640;
          const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
          const w = Math.max(160, Math.floor(video.videoWidth * scale));
          const h = Math.max(160, Math.floor(video.videoHeight * scale));
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, w, h);
          const imgData = ctx.getImageData(0, 0, w, h);
          const qr = jsQR(imgData.data, w, h, { inversionAttempts: 'attemptBoth' });
          if (qr && qr.data) {
            handleDecodedQrText(qr.data);
          }
        }, 160);
      }, 120);
    } catch (err) {
      setCameraError('Permiso de cámara denegado o no disponible. Usa el botón "📸 Tomar Foto del QR" abajo.');
    }
  };

  const handleQrImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setCameraError('');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1000;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.max(160, Math.floor(img.width * scale));
        canvas.height = Math.max(160, Math.floor(img.height * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(imgData.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
        if (qr && qr.data) {
          handleDecodedQrText(qr.data);
        } else {
          setError('No se detectó un código QR claro en la foto. Acércate un poco más a la pantalla de la PC.');
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

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

    await completePairingWithServer(urlInput, '', pinInput.trim());
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
      className="fixed inset-0 z-[70] bg-slate-950/92 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="server-conn-title"
    >
      <div className="w-full max-w-lg rounded-3xl bg-[#0F172A] border border-amber-500/40 shadow-2xl p-5 sm:p-6 space-y-4 my-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFC72C] to-amber-600 flex items-center justify-center text-xl shadow shrink-0">
              📡
            </div>
            <div>
              <h2 id="server-conn-title" className="text-base sm:text-lg font-black text-white">
                Conectar a Metal-Uriel
              </h2>
              <p className="text-xs text-slate-400">
                Escanea el QR desde tu PC o configura la IP manualmente
              </p>
            </div>
          </div>
          {!forceRequired && (
            <button
              type="button"
              onClick={() => { stopCamera(); onClose?.(); }}
              aria-label="Cerrar conexión de servidor"
              className="wizard-btn min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm shrink-0"
            >
              ✕
            </button>
          )}
        </div>

        {/* ============================================================ */}
        {/* ACCESO INSTANTÁNEO POR QR (WHATSAPP WEB INVERSO)             */}
        {/* ============================================================ */}
        {!scannerOpen ? (
          <div className="rounded-2xl bg-gradient-to-br from-emerald-950/70 via-[#0B1220] to-amber-950/40 border border-emerald-400/40 p-4 space-y-3">
            <div className="space-y-1">
              <div className="text-xs font-black uppercase tracking-wider text-emerald-300">
                ⚡ Modo Rápido (Sin escribir IP ni contraseña)
              </div>
              <p className="text-xs text-slate-300 leading-snug">
                En tu PC abre Metal-Uriel Web y haz clic en <strong className="text-amber-300">📱 Vincular Celular</strong>. Luego escanea el código QR aquí:
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={testing}
                onClick={startLiveScanner}
                className="wizard-btn min-h-[48px] px-4 rounded-xl bg-gradient-to-r from-[#FFC72C] to-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg hover:brightness-110 transition flex items-center justify-center gap-2"
              >
                <span>📷 Escanear QR en Vivo</span>
              </button>
              <button
                type="button"
                disabled={testing}
                onClick={() => fileInputRef.current?.click()}
                className="wizard-btn min-h-[48px] px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 font-bold text-xs flex items-center justify-center gap-2 transition"
              >
                <span>📸 Tomar Foto del QR</span>
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleQrImageFile}
              className="hidden"
            />
          </div>
        ) : (
          <div className="rounded-2xl bg-[#0B1220] border border-amber-400/50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-300">📷 Apunta al QR en la pantalla de tu PC</span>
              <button
                type="button"
                onClick={() => { stopCamera(); setScannerOpen(false); }}
                className="min-h-[36px] px-3 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold"
              >
                Cancelar
              </button>
            </div>

            <div className="relative w-full aspect-square max-h-72 rounded-2xl overflow-hidden bg-black border border-slate-700 flex items-center justify-center">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-48 rounded-2xl border-4 border-amber-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {cameraError && (
              <p role="alert" className="text-xs text-amber-300 font-semibold leading-snug">
                ⚠️ {cameraError}
              </p>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 text-xs font-bold"
            >
              📸 ¿Prefieres tomar una foto al QR? Toca aquí
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleQrImageFile}
              className="hidden"
            />
          </div>
        )}

        {statusMsg && (
          <div role="status" className="p-3 rounded-xl bg-sky-950/60 border border-sky-500/40 text-xs font-bold text-sky-200">
            {statusMsg}
          </div>
        )}

        {error && (
          <p id="metal-server-url-err" role="alert" className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs font-semibold text-rose-300">
            ❌ {error}
          </p>
        )}

        {/* Toggle para configuración manual IP/Puerto + PIN */}
        <div className="border-t border-slate-800 pt-3">
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="w-full flex items-center justify-between text-xs font-bold text-slate-300 hover:text-white py-1"
          >
            <span>⚙️ Configuración manual (IP / Puerto / PIN)</span>
            <span>{showManual ? '▲' : '▼'}</span>
          </button>

          {showManual && (
            <form noValidate onSubmit={handleSubmit} className="space-y-3.5 pt-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="metal-server-url" className="text-xs font-bold text-slate-100">
                  URL del Servidor Metal-Uriel {isNative && <span className="text-amber-400" aria-hidden="true">*</span>}
                </label>
                <span id="metal-server-url-hint" className="text-[11px] text-slate-400 leading-snug">
                  Ej. <code className="text-amber-300">http://192.168.1.70:3000</code> o tu túnel <code className="text-sky-300">https://...</code>
                </span>
                <input
                  ref={inputRef}
                  id="metal-server-url"
                  name="serverUrl"
                  type="url"
                  inputMode="url"
                  required={isNative}
                  value={urlInput}
                  placeholder="http://192.168.1.70:3000"
                  onChange={(e) => handleChange(e.target.value)}
                  onBlur={handleBlur}
                  autoComplete="url"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="go"
                  aria-invalid={error ? 'true' : 'false'}
                  aria-describedby="metal-server-url-hint"
                  className={`wizard-input w-full rounded-xl bg-[#0A192F] text-slate-100 px-3.5 py-2.5 border font-mono ${
                    error ? 'user-invalid-fallback border-red-500' : 'border-slate-600'
                  }`}
                />
                {isVirtualAdapterIp && (
                  <div role="alert" className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-[11px] text-amber-200 leading-snug">
                    ⚠️ <strong>IP virtual detectada:</strong> <code className="text-amber-300">192.168.56.x</code> (VirtualBox) no es accesible desde tu celular.
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="metal-pair-pin" className="text-xs font-bold text-slate-300">
                  PIN de 6 dígitos de la PC (opcional, para entrar sin clave)
                </label>
                <input
                  id="metal-pair-pin"
                  type="text"
                  inputMode="numeric"
                  maxLength={7}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Ej. 482-915 (déjalo vacío para login normal)"
                  className="wizard-input w-full rounded-xl bg-[#0A192F] text-slate-100 px-3.5 py-2 border border-slate-700 font-mono text-sm"
                />
              </div>

              {testResult?.ok && (
                <div role="status" className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200">
                  ✅ Conectado a {testResult.botName} v{testResult.apiVersion} ({testResult.latencyMs} ms) • MariaDB: <strong>{testResult.dbConnected ? 'Online' : 'Offline'}</strong>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={testing}
                  onClick={handleTest}
                  className="wizard-btn min-h-[46px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 text-xs font-bold transition disabled:opacity-50"
                >
                  {testing ? '⏳ Probando...' : '🔍 Probar'}
                </button>
                <button
                  type="submit"
                  disabled={testing}
                  className="wizard-btn flex-1 min-h-[46px] px-4 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] text-slate-950 font-black text-xs sm:text-sm shadow transition disabled:opacity-50"
                >
                  {testing ? 'Conectando...' : pinInput.trim() ? '🔐 Vincular con PIN' : '🚀 Guardar y Conectar'}
                </button>
              </div>

              {!isNative && getServerUrl() && (
                <button
                  type="button"
                  onClick={handleResetLocal}
                  className="wizard-btn w-full min-h-[42px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Volver al servidor local (mismo origen)
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
