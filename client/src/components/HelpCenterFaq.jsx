import React, { useState, useMemo } from 'react';

const TUTORIAL_STEPS = [
  {
    step: '1',
    icon: '💬',
    title: 'Revisa tus Chats y Detecta Inconclusas',
    desc: 'En la Bandeja de Entrada verás cada prospecto una sola vez (sin números duplicados). Usa el filtro "⏳ Inconclusas" para ver quién dejó sus datos a medias y cuánto tiempo lleva esperando.',
    tip: 'Cada mensaje guarda fecha, hora exacta y si lo envió el Aspirante, el Robot IA o un Asesor.'
  },
  {
    step: '2',
    icon: '👤',
    title: 'Toca la Foto del Postulante (Estilo WhatsApp)',
    desc: 'Al hacer clic o tocar el avatar del contacto en el chat se abre su Perfil Completo: verás el resumen de su situación por IA, su avance de 11 datos y qué campos le faltan.',
    tip: 'Desde ahí mismo puedes moverlo en el tablero Kanban sin salir del chat.'
  },
  {
    step: '3',
    icon: '🧑‍💼',
    title: 'Interviene en Vivo o Finaliza a Mano',
    desc: 'Presiona "Pausar IA" si quieres chatear tú mismo con el aspirante (todos los mensajes siguen guardándose en MariaDB). Si se inscribió por llamada o en campus, usa "Finalizar Proceso a Mano".',
    tip: 'Al marcar a alguien como "Inscrito", su chat se resguarda como 🏆 Caso de Éxito para estudio futuro.'
  },
  {
    step: '4',
    icon: '📦',
    title: 'Exporta Conversaciones en .ZIP',
    desc: 'Dentro del perfil del postulante, toca "Exportar Conversación (.ZIP)" para descargar un respaldo igual al de WhatsApp con el chat en .txt, auditoría .json, resumen ejecutivo y adjuntos.',
    tip: 'Ideal para auditorías de admisiones o estudiar las mejores ventas de matrícula.'
  }
];

const FAQ_ITEMS = [
  {
    category: 'Bandeja & Auditoría',
    q: '¿Por qué antes se perdían mensajes o aparecía el mismo número repetido?',
    a: 'Antes, WhatsApp enviaba variantes del número (521..., +52..., 10 dígitos) y la vista tenía un límite de 1,000 mensajes. Ahora Metal-Uriel normaliza todos los números a una clave canónica única y guarda CADA mensaje permanentemente en MariaDB con rol exacto (Aspirante, Robot IA, Asesor o Sistema), fecha y hora.'
  },
  {
    category: 'Bandeja & Auditoría',
    q: '¿Cómo sé qué conversaciones están inconclusas y necesitan un humano?',
    a: 'En la Bandeja de Entrada toca el botón "⏳ Inconclusas". El sistema mide cuántos de los 11 datos oficiales UNID faltan y muestra el tiempo exacto sin avance (ej. "45m sin completar" o "3h sin completar") para que un asesor intervenga a tiempo.'
  },
  {
    category: 'Cierres & Casos de Éxito',
    q: '¿Qué son las conversaciones "🏆 Inscritos / Casos de Estudio"?',
    a: 'Cuando un postulante se inscribe (desde Kanban o con "Finalizar Proceso a Mano"), su conversación se marca automáticamente como Caso de Éxito permanente. Puedes filtrarlas con "🏆 Inscritos" y exportar su .ZIP para capacitar a nuevos asesores.'
  },
  {
    category: 'Cierres & Casos de Éxito',
    q: '¿Cómo finalizo a un postulante manualmente si se inscribió por teléfono o en campus?',
    a: 'Abre su chat, toca su foto de perfil en la barra superior y presiona "✅ Finalizar Proceso a Mano". Elige el estado final (por ejemplo, Inscrito), agrega tus notas de cierre y guarda. El bot se pausará automáticamente para no volver a pedirle datos.'
  },
  {
    category: 'Exportación & Respaldo',
    q: '¿Qué incluye el archivo .ZIP al exportar una conversación?',
    a: 'Igual que WhatsApp, descarga un paquete comprimido con: 1) Chat_WhatsApp_Nombre.txt con cada mensaje fechado y etiquetado por rol, 2) expediente_auditoria.json con los 11 datos y metadatos forenses, 3) resumen_ejecutivo.md y 4) carpeta adjuntos/ con los PDFs o imágenes enviados.'
  },
  {
    category: 'App Android & Conexión',
    q: 'La app Android (APK) dice "Tiempo de espera agotado (7s)". ¿Cómo lo soluciono?',
    a: 'Hay 3 causas comunes: 1) Usaste una IP virtual como 192.168.56.1 (VirtualBox) en vez de la IP Wi-Fi/Ethernet real de la PC (ej. 192.168.1.70:3000). 2) El celular y la PC no están en la misma red Wi-Fi. 3) El Firewall de Windows bloquea el puerto 3000 (ejecuta el comando de Firewall mostrado abajo en PowerShell como Administrador).'
  },
  {
    category: 'App Android & Conexión',
    q: '¿Puedo usar Metal-Uriel desde el navegador de mi celular o tablet sin instalar el APK?',
    a: '¡Sí! La interfaz es 100% responsiva. Solo abre Chrome o Safari en tu celular y entra a la IP LAN de la PC (ej. http://192.168.1.70:3000) o a la URL HTTPS del campus. Tendrás barra de navegación inferior y vista de chats adaptada a pantalla táctil.'
  },
  {
    category: 'IA & Handover',
    q: '¿Si pauso la IA para contestar yo mismo, los mensajes del prospecto se siguen guardando?',
    a: 'Sí. Incluso con la IA en pausa (Control Humano), cada mensaje que llega de WhatsApp y cada respuesta que tú escribes se almacena en la bóveda permanente de MariaDB con tu nombre de asesor y hora exacta.'
  },
  {
    category: 'IA & Handover',
    q: '¿Qué pasa si un proveedor de IA (Gemini, OpenAI, Claude) se queda sin saldo o falla?',
    a: 'La Cascada Inteligente detecta el error automáticamente y cambia en milisegundos al siguiente motor configurado, conservando toda la memoria de la conversación para que el aspirante jamás note una interrupción.'
  }
];

export default function HelpCenterFaq({
  healthFull,
  onNavigateTab,
  onOpenServerModal,
  onToast
}) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todas');

  const hw = healthFull?.hardware || null;
  const primaryLanUrl = hw?.primaryLanUrl || hw?.lanUrls?.[0] || 'http://192.168.1.x:3000';
  const firewallCmd = hw?.firewallCommand || 'netsh advfirewall firewall add rule name="Metal-Uriel TCP 3000" dir=in action=allow protocol=TCP localport=3000';

  const categories = useMemo(() => ['Todas', ...Array.from(new Set(FAQ_ITEMS.map((i) => i.category)))], []);

  const filteredFaqs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      if (activeCategory !== 'Todas' && item.category !== activeCategory) return false;
      if (!q) return true;
      return (
        item.q.toLowerCase().includes(q) ||
        item.a.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [search, activeCategory]);

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast?.(`📋 ${label} copiado al portapapeles.`);
    } catch (_) {
      onToast?.(`Copia manual: ${text}`, 'info');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 pb-24 md:pb-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Encabezado Hero */}
        <section className="rounded-3xl bg-gradient-to-br from-[#0F1E38] via-[#111B2E] to-[#0B1220] border border-amber-400/30 p-5 sm:p-7 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[11px] font-black uppercase tracking-wider">
                📚 Centro de Ayuda UNID
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                Tutorial, Preguntas Frecuentes y Soporte para Asesores
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                Aprende en 2 minutos a rescatar conversaciones inconclusas, revisar expedientes tocando la foto del postulante, cerrar inscripciones a mano y conectar tu app móvil Android.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigateTab?.('inbox')}
                className="min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-[#FFC72C] to-amber-500 text-slate-950 font-black text-xs shadow hover:brightness-110 transition"
              >
                💬 Ir a Bandeja de Chats
              </button>
              <button
                type="button"
                onClick={() => onOpenServerModal?.()}
                className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-bold text-xs transition"
              >
                📡 Conectar Servidor / Móvil
              </button>
            </div>
          </div>
        </section>

        {/* Tutorial Visual en 4 Pasos */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-black text-white">
              🧭 Flujo Diario del Asesor (4 Pasos)
            </h3>
            <span className="text-[11px] text-slate-400">Guía práctica de uso</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {TUTORIAL_STEPS.map((s) => (
              <article
                key={s.step}
                className="rounded-2xl bg-[#111B2E] border border-slate-800 hover:border-amber-400/40 p-4 space-y-2 transition"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-lg shrink-0">
                    {s.icon}
                  </span>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                      Paso {s.step}
                    </span>
                    <h4 className="text-sm font-black text-white leading-tight">{s.title}</h4>
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{s.desc}</p>
                <div className="pt-1 text-[11px] text-sky-300/90 bg-sky-950/30 border border-sky-500/20 rounded-xl px-3 py-1.5">
                  💡 {s.tip}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Tarjeta dedicada de App Android APK + Red Local + Firewall */}
        <section className="rounded-2xl bg-[#0F172A] border border-emerald-500/35 p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-black text-emerald-300">
                📱 Cómo Conectar tu Celular / App Android (APK) sin Errores
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Usa la dirección Wi-Fi / Ethernet real de esta computadora (nunca la IP virtual de VirtualBox <code className="text-amber-300">192.168.56.x</code>).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                1. URL Real Detectada para tu Celular
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs sm:text-sm font-mono text-emerald-300 bg-slate-900 px-3 py-2 rounded-lg border border-slate-700 truncate">
                  {primaryLanUrl}
                </code>
                <button
                  type="button"
                  onClick={() => copyText(primaryLanUrl, 'URL LAN')}
                  className="min-h-[38px] px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-xs font-bold shrink-0"
                >
                  📋 Copiar
                </button>
              </div>
              {hw?.virtualUrls?.length > 0 && (
                <p className="text-[11px] text-amber-300/90">
                  ⚠️ Ignora adaptadores virtuales detectados: <code className="font-mono">{hw.virtualUrls.join(', ')}</code>
                </p>
              )}
            </div>

            <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                2. Abrir Puerto 3000 en Firewall de Windows (si da timeout)
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] font-mono text-sky-300 bg-slate-900 px-3 py-2 rounded-lg border border-slate-700 truncate">
                  {firewallCmd}
                </code>
                <button
                  type="button"
                  onClick={() => copyText(firewallCmd, 'Comando de Firewall')}
                  className="min-h-[38px] px-3 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 text-xs font-bold shrink-0"
                >
                  📋 Copiar
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Ejecuta este comando una sola vez en PowerShell como Administrador en la PC donde corre Metal-Uriel.
              </p>
            </div>
          </div>
        </section>

        {/* Buscador y Preguntas Frecuentes (FAQ) */}
        <section className="space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm sm:text-base font-black text-white">
              ❓ Preguntas Frecuentes (FAQ)
            </h3>
            <div className="relative w-full sm:w-80">
              <label htmlFor="faq-search" className="sr-only">
                Buscar en preguntas frecuentes
              </label>
              <input
                id="faq-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar: ZIP, APK, inconclusas, IA..."
                className="w-full min-h-[42px] rounded-xl bg-[#0F172A] border border-slate-700 focus:border-amber-400 px-3.5 text-xs sm:text-sm text-white placeholder-slate-500 outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`min-h-[36px] px-3 rounded-full text-xs font-bold border transition ${
                  activeCategory === cat
                    ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="space-y-2.5">
            {filteredFaqs.length === 0 ? (
              <div className="rounded-2xl bg-[#111B2E] border border-slate-800 p-6 text-center text-xs text-slate-400">
                No encontramos resultados para "{search}". Intenta con otra palabra clave.
              </div>
            ) : (
              filteredFaqs.map((item, idx) => (
                <details
                  key={idx}
                  open={idx === 0 && !search}
                  className="group rounded-2xl bg-[#111B2E] border border-slate-800 open:border-amber-400/40 transition"
                >
                  <summary className="cursor-pointer list-none px-4 py-3.5 flex items-center justify-between gap-3 select-none min-h-[48px]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="shrink-0 px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-bold text-amber-300">
                        {item.category}
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-slate-100 leading-snug">
                        {item.q}
                      </span>
                    </div>
                    <span className="text-slate-400 text-xs shrink-0 transition group-open:rotate-180">▼</span>
                  </summary>
                  <div className="px-4 pb-4 pt-1 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-slate-800/70">
                    {item.a}
                  </div>
                </details>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
