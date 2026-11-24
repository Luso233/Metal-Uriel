import React, { useState, useEffect, useRef } from 'react';
import { resolveApiUrl } from '../utils/serverConnection.js';

export default function MobilePairQrModal({ isOpen, onClose, authToken, onToast }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pairData, setPairData] = useState(null);
  const [selectedUrl, setSelectedUrl] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [remainingSec, setRemainingSec] = useState(0);
  const [pairStatus, setPairStatus] = useState('idle'); // 'idle' | 'pending' | 'claimed' | 'expired'
  const [claimedDevice, setClaimedDevice] = useState('');
  const pollRef = useRef(null);
  const tickRef = useRef(null);

  const stopTimers = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
  };

  const generateQr = async (overrideUrl = '') => {
    stopTimers();
    setLoading(true);
    setError('');
    setPairStatus('idle');
    setClaimedDevice('');
    try {
      const res = await fetch(resolveApiUrl('/api/auth/mobile-pair/create'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify(overrideUrl ? { serverUrl: overrideUrl } : {})
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo generar el código QR.');
      }
      setPairData(data);
      setSelectedUrl(data.serverUrl);
      setRemainingSec(data.expiresInSec || 120);
      setPairStatus('pending');

      // Cuenta regresiva visual cada 1s
      const expMs = new Date(data.expiresAt).getTime();
      tickRef.current = setInterval(() => {
        const left = Math.max(0, Math.ceil((expMs - Date.now()) / 1000));
        setRemainingSec(left);
        if (left <= 0) {
          setPairStatus('expired');
          stopTimers();
        }
      }, 1000);

      // Polling cada 2s para detectar cuando el celular escanea el QR
      pollRef.current = setInterval(async () => {
        try {
          const stRes = await fetch(resolveApiUrl(`/api/auth/mobile-pair/status/${encodeURIComponent(data.code)}`), {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
          });
          if (!stRes.ok) return;
          const st = await stRes.json();
          if (st.status === 'claimed') {
            setPairStatus('claimed');
            setClaimedDevice(st.claimedByDevice || 'Celular Android');
            stopTimers();
            onToast?.('✅ ¡Celular vinculado e iniciado con éxito!');
          } else if (st.status === 'expired') {
            setPairStatus('expired');
            stopTimers();
          }
        } catch (_) {}
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      generateQr();
    } else {
      stopTimers();
    }
    return () => stopTimers();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const qrDataUri = pairData?.qrSvg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pairData.qrSvg)}`
    : '';

  const copyText = async (txt, label) => {
    try {
      await navigator.clipboard.writeText(txt);
      onToast?.(`📋 ${label} copiado al portapapeles.`);
    } catch (_) {
      onToast?.(txt, 'info');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[72] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-pair-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="w-full max-w-lg rounded-3xl bg-[#0F172A] border border-amber-400/40 shadow-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFC72C] to-emerald-500 flex items-center justify-center text-xl shadow shrink-0">
              📱
            </div>
            <div>
              <h2 id="qr-pair-title" className="text-base sm:text-lg font-black text-white">
                Vincular Celular por Código QR
              </h2>
              <p className="text-xs text-slate-400">
                Escanea desde tu app Metal-Uriel Android o desde la cámara de tu teléfono
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar código QR"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Estado Principal: QR o Confirmación */}
        <div className="rounded-2xl bg-[#0B1220] border border-slate-800 p-4 flex flex-col items-center text-center space-y-3">
          {loading ? (
            <div className="w-60 h-60 rounded-2xl bg-slate-900 flex flex-col items-center justify-center gap-2 text-xs text-slate-300">
              <span className="text-2xl animate-pulse">📡</span>
              <span>Generando código QR seguro...</span>
            </div>
          ) : pairStatus === 'claimed' ? (
            <div className="w-full py-8 px-4 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 space-y-2">
              <div className="text-4xl">✅</div>
              <h3 className="text-base font-black text-emerald-300">¡Celular Vinculado con Éxito!</h3>
              <p className="text-xs text-emerald-100/80">
                Sesión iniciada automáticamente en <strong>{claimedDevice}</strong>. El código QR ya fue destruido por seguridad.
              </p>
              <button
                type="button"
                onClick={() => generateQr(selectedUrl)}
                className="mt-2 min-h-[42px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs"
              >
                📱 Vincular otro dispositivo
              </button>
            </div>
          ) : qrDataUri ? (
            <>
              <div className="relative p-3 rounded-2xl bg-white shadow-xl">
                <img
                  src={qrDataUri}
                  alt="Código QR para vincular celular a Metal-Uriel"
                  className={`w-56 h-56 sm:w-64 sm:h-64 block ${pairStatus === 'expired' ? 'opacity-20 blur-[2px]' : ''}`}
                />
                {pairStatus === 'expired' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                    <button
                      type="button"
                      onClick={() => generateQr(useCustomUrl ? customUrl : selectedUrl)}
                      className="min-h-[44px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-lg"
                    >
                      🔄 Código expirado • Generar nuevo QR
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono font-bold">
                  {pairData.serverUrl}
                </span>
                {pairStatus === 'pending' && (
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono font-bold">
                    ⏳ {remainingSec}s
                  </span>
                )}
                {pairData.pinFormatted && (
                  <span className="px-2.5 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300 font-mono font-bold">
                    PIN: {pairData.pinFormatted}
                  </span>
                )}
              </div>
            </>
          ) : null}

          {error && (
            <p role="alert" className="text-xs font-bold text-rose-400">
              ❌ {error}
            </p>
          )}
        </div>

        {/* Pasos claros estilo WhatsApp Web inverso */}
        <ol className="text-xs text-slate-300 space-y-1.5 bg-slate-900/70 rounded-2xl p-3.5 border border-slate-800 list-decimal list-inside">
          <li>Abre la app <strong className="text-white">Metal-Uriel UNID</strong> en tu celular (o la cámara nativa).</li>
          <li>Toca <strong className="text-amber-300">📷 Escanear QR de la PC</strong>.</li>
          <li>Apunta a este código: configurará la IP, el puerto y tu sesión <strong className="text-emerald-300">en 1 segundo</strong>.</li>
        </ol>

        {/* Selector de IP LAN o Túnel HTTPS personalizado */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="qr-server-url-select" className="text-xs font-bold text-slate-300">
              Dirección codificada en el QR
            </label>
            <button
              type="button"
              onClick={() => setUseCustomUrl((v) => !v)}
              className="text-[11px] font-bold text-sky-300 hover:underline"
            >
              {useCustomUrl ? 'Usar IP LAN detectada' : 'Usar túnel HTTPS (ngrok/Cloudflare)'}
            </button>
          </div>

          {useCustomUrl ? (
            <div className="flex gap-2">
              <input
                id="qr-server-url-select"
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://tu-tunel.trycloudflare.com"
                className="flex-1 min-h-[42px] rounded-xl bg-[#0B1220] border border-slate-700 px-3 text-xs font-mono text-white"
              />
              <button
                type="button"
                onClick={() => generateQr(customUrl)}
                className="min-h-[42px] px-3 rounded-xl bg-amber-400 text-slate-950 font-black text-xs shrink-0"
              >
                Actualizar QR
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                id="qr-server-url-select"
                value={selectedUrl}
                onChange={(e) => {
                  setSelectedUrl(e.target.value);
                  generateQr(e.target.value);
                }}
                className="flex-1 min-h-[42px] rounded-xl bg-[#0B1220] border border-slate-700 px-3 text-xs font-mono text-emerald-300"
              >
                {(pairData?.availableUrls?.length ? pairData.availableUrls : [selectedUrl || 'http://192.168.1.70:3000']).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={loading}
                onClick={() => generateQr(selectedUrl)}
                className="min-h-[42px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-bold text-xs shrink-0"
              >
                🔄 Renovar
              </button>
            </div>
          )}

          {pairData?.firewallCommand && (
            <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
              <span className="truncate">🔥 ¿El celular no llega a la PC? Abre TCP 3000 en Firewall.</span>
              <button
                type="button"
                onClick={() => copyText(pairData.firewallCommand, 'Comando de Firewall')}
                className="text-sky-300 hover:underline font-bold shrink-0"
              >
                Copiar comando
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
