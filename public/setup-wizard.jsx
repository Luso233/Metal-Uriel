// =========================================================================
// Metal-Uriel v2.0 — Asistente Plug & Play de Primera Configuración (Setup Wizard)
// Validación estricta por tipo/longitud de credenciales + Tests en vivo + RBAC CSPRNG
// =========================================================================
(function () {
  const { useState, useEffect, useRef } = React;

  const PLACEHOLDER_RE = /(tu_api_key|tu_token|tu_password|tu_phone_number|tu_app_password|placeholder|changeme|example|xxxxxx|reemplaza|pon_tu_)/i;

  // Reglas idénticas a lib/setup-utils.js (client UX + server security)
  const CLIENT_RULES = {
    PORT: { label: 'Puerto HTTP', minLen: 2, maxLen: 5, pattern: '^\\d{2,5}$', regex: /^\d{2,5}$/, hint: 'Solo dígitos (estándar: 3000).' },
    DB_HOST: { label: 'Host MariaDB', minLen: 1, maxLen: 253, pattern: '^[a-zA-Z0-9._-]+$', regex: /^[a-zA-Z0-9._-]+$/, hint: 'Usa "localhost" o "127.0.0.1" si MariaDB corre en esta misma PC.' },
    DB_PORT: { label: 'Puerto MariaDB', minLen: 2, maxLen: 5, pattern: '^\\d{2,5}$', regex: /^\d{2,5}$/, hint: 'Solo números (estándar MariaDB: 3306).' },
    DB_USER: { label: 'Usuario MariaDB', minLen: 1, maxLen: 64, pattern: '^[a-zA-Z0-9_.-]+$', regex: /^[a-zA-Z0-9_.-]+$/, hint: 'Usuario con permisos para crear BD (ej. root o metal_uriel).' },
    DB_PASSWORD: { label: 'Contraseña MariaDB', minLen: 0, maxLen: 128, hint: 'Contraseña del motor MariaDB (recomendado ≥ 8 caracteres).' },
    DB_NAME: { label: 'Nombre de Base de Datos', minLen: 2, maxLen: 64, pattern: '^[a-zA-Z][a-zA-Z0-9_]*$', regex: /^[a-zA-Z][a-zA-Z0-9_]*$/, hint: 'Letras, números y guion bajo iniciando con letra (default: unid_admisiones).' },
    GEMINI_API_KEY: { label: 'Google Gemini API Key', minLen: 35, maxLen: 55, pattern: '^AIza[0-9A-Za-z_-]{31,51}$', regex: /^AIza[0-9A-Za-z_-]{31,51}$/, hint: 'Inicia con "AIza", longitud típica de 39 caracteres (solo letras, números, _ y -).' },
    ANTHROPIC_API_KEY: { label: 'Anthropic Claude API Key', minLen: 40, maxLen: 180, pattern: '^sk-ant-[0-9A-Za-z_-]{33,173}$', regex: /^sk-ant-[0-9A-Za-z_-]{33,173}$/, hint: 'Inicia con "sk-ant-", 40 a 180 caracteres sin espacios.' },
    OPENAI_API_KEY: { label: 'OpenAI API Key', minLen: 32, maxLen: 220, pattern: '^sk-[0-9A-Za-z_-]{29,217}$', regex: /^sk-[0-9A-Za-z_-]{29,217}$/, hint: 'Inicia con "sk-" o "sk-proj-", 32 a 220 caracteres sin espacios.' },
    DEEPSEEK_API_KEY: { label: 'DeepSeek API Key', minLen: 24, maxLen: 120, pattern: '^sk-[0-9A-Za-z_-]{21,117}$', regex: /^sk-[0-9A-Za-z_-]{21,117}$/, hint: 'Inicia con "sk-", 24 a 120 caracteres sin espacios.' },
    GROQ_API_KEY: { label: 'Groq Cloud API Key', minLen: 40, maxLen: 120, pattern: '^gsk_[0-9A-Za-z_-]{36,116}$', regex: /^gsk_[0-9A-Za-z_-]{36,116}$/, hint: 'Inicia con "gsk_", 40 a 120 caracteres sin espacios.' },
    OLLAMA_BASE_URL: { label: 'URL de Ollama Local', minLen: 10, maxLen: 250, pattern: '^https?://[a-zA-Z0-9._-]+(:\\d{1,5})?(/\\S*)?$', regex: /^https?:\/\/[a-zA-Z0-9._-]+(:\d{1,5})?(\/\S*)?$/, hint: 'Ejemplo: http://127.0.0.1:11434' },
    OLLAMA_MODEL: { label: 'Modelo Ollama', minLen: 2, maxLen: 80, pattern: '^[a-zA-Z0-9._:/-]+$', regex: /^[a-zA-Z0-9._:/-]+$/, hint: 'Para 8 GB RAM usa modelos <= 3B: qwen2.5:3b, llama3.2:3b o phi3:mini.' },
    OLLAMA_API_KEY: { label: 'Token Ollama (Opcional)', minLen: 8, maxLen: 200, pattern: '^\\S{8,200}$', regex: /^\S{8,200}$/, hint: 'Opcional: solo si pusiste autenticación Bearer delante de Ollama.' },
    OLLAMA_TIMEOUT_MS: { label: 'Timeout Ollama (ms)', minLen: 4, maxLen: 5, pattern: '^\\d{4,5}$', regex: /^\d{4,5}$/, hint: 'Entre 5000 y 60000 ms (recomendado: 15000 ms para no trabar WhatsApp).' },
    WHATSAPP_PHONE_NUMBER_ID: { label: 'WhatsApp Phone Number ID', minLen: 10, maxLen: 20, pattern: '^\\d{10,20}$', regex: /^\d{10,20}$/, hint: 'SOLO NÚMEROS (10 a 20 dígitos, ej. 1332834883256423). Cópialo de Meta Developers.' },
    WHATSAPP_TOKEN: { label: 'Meta WhatsApp Access Token', minLen: 80, maxLen: 500, pattern: '^EAA[0-9A-Za-z_-]{77,497}$', regex: /^EAA[0-9A-Za-z_-]{77,497}$/, hint: 'Inicia con "EAA", solo letras y números (80 a 500 caracteres sin espacios).' },
    META_VERIFY_TOKEN: { label: 'Meta Webhook Verify Token', minLen: 8, maxLen: 128, pattern: '^[0-9A-Za-z_-]{8,128}$', regex: /^[0-9A-Za-z_-]{8,128}$/, hint: '8 a 128 caracteres (letras, números, _ o -). Debe coincidir con el Webhook en Meta.' },
    JWT_SECRET: { label: 'JWT Secret', minLen: 32, maxLen: 128, pattern: '^\\S{32,128}$', regex: /^\S{32,128}$/, hint: 'Mínimo 32 caracteres aleatorios sin espacios.' },
    ENCRYPTION_MASTER_KEY: { label: 'Llave Maestra AES-256-GCM', minLen: 32, maxLen: 128, pattern: '^\\S{32,128}$', regex: /^\S{32,128}$/, hint: 'Mínimo 32 caracteres aleatorios sin espacios para cifrar secretos en MariaDB.' },
    DEV_EMAIL: { label: 'Correo del Desarrollador', minLen: 6, maxLen: 180, regex: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, hint: 'Tu correo institucional (@red.unid.mx) o administrativo.' },
    DEV_NAME: { label: 'Nombre del Desarrollador', minLen: 3, maxLen: 140, hint: 'Nombre completo visible en el Centro de Mando.' },
    DEV_PASSWORD: { label: 'Contraseña del Desarrollador', minLen: 12, maxLen: 128, pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9\\s]).{12,128}$', regex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{12,128}$/, hint: 'Mín. 12 caracteres: mayúscula, minúscula, número y símbolo (sin espacios).' },
    ADMIN_SEDE_EMAIL: { label: 'Correo Admin de Sede', minLen: 6, maxLen: 180, regex: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, hint: 'Correo de la Jefatura de Admisiones (opcional).' },
    ADMIN_SEDE_PASSWORD: { label: 'Contraseña Admin de Sede', minLen: 12, maxLen: 128, pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9\\s]).{12,128}$', regex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{12,128}$/, hint: 'Mín. 12 caracteres con mayúscula, minúscula, número y símbolo.' },
    SMTP_HOST: { label: 'Servidor SMTP', minLen: 4, maxLen: 253, pattern: '^[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$', regex: /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, hint: 'Ej. smtp.gmail.com o smtp.office365.com' },
    SMTP_PORT: { label: 'Puerto SMTP', minLen: 2, maxLen: 5, pattern: '^\\d{2,5}$', regex: /^\d{2,5}$/, hint: 'Estándar: 587 (STARTTLS) o 465 (SSL).' },
    SMTP_USER: { label: 'Usuario SMTP', minLen: 5, maxLen: 180, regex: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, hint: 'Correo emisor de notificaciones.' },
    SMTP_PASS: { label: 'Contraseña / App Password SMTP', minLen: 8, maxLen: 128, hint: 'En Gmail usa App Password de 16 caracteres (sin espacios).' },
    ADMISSIONS_NOTIFICATION_EMAIL: { label: 'Correo de Admisiones', minLen: 6, maxLen: 180, regex: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, hint: 'Recibirá alertas de Nuevo Contacto, 11 Datos e Inscrito.' },
    ALERT_ADMIN_EMAIL: { label: 'Correo de Alertas Life Support', minLen: 6, maxLen: 180, regex: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, hint: 'Tu correo para avisos de emergencia si falla la IA o MariaDB.' }
  };

  function validateClientField(key, rawValue, forceRequired = false) {
    const rule = CLIENT_RULES[key];
    if (!rule) return '';
    const val = rawValue === undefined || rawValue === null ? '' : String(rawValue).trim();
    if (val === '__KEEP_EXISTING__') return '';
    if (!val) return forceRequired ? `Error: "${rule.label}" es obligatorio.` : '';
    if (PLACEHOLDER_RE.test(val)) return `Error: "${rule.label}" contiene texto de ejemplo. Ingresa tu valor real.`;
    if (rule.minLen && val.length < rule.minLen) {
      return `Error: "${rule.label}" tiene ${val.length} caracteres (mínimo ${rule.minLen}). ${rule.hint}`;
    }
    if (rule.maxLen && val.length > rule.maxLen) {
      return `Error: "${rule.label}" excede ${rule.maxLen} caracteres.`;
    }
    if (rule.regex && !rule.regex.test(val)) {
      return `Error: Formato inválido en "${rule.label}". ${rule.hint}`;
    }
    if (key === 'OLLAMA_TIMEOUT_MS') {
      const n = Number(val);
      if (n < 5000 || n > 60000) return 'Error: El timeout debe estar entre 5000 y 60000 ms.';
    }
    if (key === 'SMTP_PORT') {
      const n = Number(val);
      if (![25, 465, 587, 2525].includes(n)) return 'Error: Usa un puerto SMTP estándar (587, 465, 2525 o 25).';
    }
    return '';
  }

  function browserRandomHex(bytes = 32) {
    const arr = new Uint8Array(bytes);
    window.crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  }

  function browserRandomPassword(len = 20) {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const syms = '!@#$%&*+-=?';
    const all = upper + lower + digits + syms;
    const pick = (s) => {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return s[buf[0] % s.length];
    };
    const chars = [pick(upper), pick(lower), pick(digits), pick(syms)];
    while (chars.length < len) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      const j = buf[0] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }

  const STEPS = [
    { id: 1, short: 'Base de Datos', title: 'Paso 1: Servidor MariaDB y Sede Principal' },
    { id: 2, short: 'Motores IA', title: 'Paso 2: Cascada de IA (Nube + Ollama Opcional)' },
    { id: 3, short: 'WhatsApp', title: 'Paso 3: Meta WhatsApp Cloud API' },
    { id: 4, short: 'Seguridad RBAC', title: 'Paso 4: Criptografía y Cuentas Administrativas' },
    { id: 5, short: 'Alertas y Fin', title: 'Paso 5: Correo SMTP, Alertas Life Support y Arranque' }
  ];

  // Campo reutilizable con validación post-interacción accesible (hint arriba, error en blur, limpieza en input)
  function WizardField({
    id, name, label, hint, value, onChange, onBlur, error, required,
    type = 'text', inputMode, pattern, minLength, maxLength, autoComplete,
    enterKeyHint = 'next', isSecret = false, placeholder = '', extraAction = null,
    keepExistingHint = ''
  }) {
    const [revealed, setRevealed] = useState(false);
    const inputType = isSecret ? (revealed ? 'text' : 'password') : type;
    const hintId = `${id}-hint`;
    const errId = `${id}-error`;
    const describedBy = error ? `${hintId} ${errId}` : hintId;
    const charLen = (value && value !== '__KEEP_EXISTING__') ? String(value).trim().length : 0;

    return (
      <div className="flex flex-col gap-1.5 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={id} className="text-sm font-bold text-slate-100">
            {label} {required && <span className="text-amber-400" aria-hidden="true">*</span>}
          </label>
          <div className="flex items-center gap-2">
            {charLen > 0 && (
              <span className="text-[11px] font-mono text-slate-400">{charLen} chars</span>
            )}
            {extraAction}
          </div>
        </div>

        {/* Regla / ayuda SIEMPRE arriba del input para no ser tapada por autofill/teclado */}
        <span id={hintId} className="text-xs text-slate-400 leading-snug">
          {hint}
          {keepExistingHint && (
            <span className="ml-1.5 text-emerald-400 font-semibold">{keepExistingHint}</span>
          )}
        </span>

        <div className="relative flex items-center gap-2">
          <input
            id={id}
            name={name}
            type={inputType}
            inputMode={inputMode}
            pattern={pattern}
            minLength={minLength}
            maxLength={maxLength}
            required={required}
            value={value === '__KEEP_EXISTING__' ? '' : (value || '')}
            placeholder={value === '__KEEP_EXISTING__' ? '•••••••• (Se conservará el valor actual guardado)' : placeholder}
            onChange={(e) => onChange(name, e.target.value)}
            onBlur={() => onBlur(name)}
            autoComplete={autoComplete || (isSecret ? 'new-password' : 'off')}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint={enterKeyHint}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={describedBy}
            className={`wizard-input w-full rounded-xl bg-[#0F172A] text-slate-100 px-3.5 py-2.5 border font-mono transition ${
              error ? 'user-invalid-fallback border-red-500' : (charLen > 0 ? 'user-valid-fallback border-emerald-500/70' : 'border-slate-600')
            }`}
          />
          {isSecret && (
            <button
              type="button"
              onClick={() => setRevealed(r => !r)}
              aria-pressed={revealed ? 'true' : 'false'}
              aria-label={revealed ? `Ocultar ${label}` : `Mostrar ${label}`}
              className="wizard-btn shrink-0 min-h-[48px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-slate-200 transition"
            >
              {revealed ? '🙈 Ocultar' : '👁️ Ver'}
            </button>
          )}
        </div>

        {error && (
          <div id={errId} className="text-xs font-semibold text-red-400 flex items-start gap-1.5 mt-0.5">
            <span role="img" aria-label="Error">❌</span>
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }

  function SetupWizard({ setupStatus, campusesList = [], authToken = null, isReconfigure = false, onComplete, onCancel }) {
    const [step, setStep] = useState(1);
    const [form, setForm] = useState(() => ({
      PORT: String(setupStatus?.port || 3000),
      PRIMARY_CAMPUS: setupStatus?.primaryCampus || 'campeche',
      DB_HOST: 'localhost',
      DB_PORT: '3306',
      DB_USER: 'root',
      DB_PASSWORD: '',
      DB_NAME: 'unid_admisiones',
      DEFAULT_AI_MODEL: 'auto-fallback',
      GEMINI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      DEEPSEEK_API_KEY: '',
      GROQ_API_KEY: '',
      OLLAMA_ENABLED: false,
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
      OLLAMA_MODEL: 'qwen2.5:3b',
      OLLAMA_API_KEY: '',
      OLLAMA_TIMEOUT_MS: '15000',
      SKIP_WHATSAPP: false,
      WHATSAPP_PHONE_NUMBER_ID: '',
      WHATSAPP_TOKEN: '',
      META_VERIFY_TOKEN: 'unid_meta_' + browserRandomHex(10),
      JWT_SECRET: browserRandomHex(32),
      ENCRYPTION_MASTER_KEY: browserRandomHex(32),
      DEV_EMAIL: '00774343@red.unid.mx',
      DEV_NAME: 'Luis Felipe Quintero Cervera',
      DEV_PASSWORD: '',
      ADMIN_SEDE_EMAIL: '',
      ADMIN_SEDE_NAME: 'Jefatura de Admisiones UNID',
      ADMIN_SEDE_PASSWORD: '',
      ADMISSIONS_NOTIFICATION_EMAIL: '',
      ALERT_ADMIN_EMAIL: '',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '587',
      SMTP_USER: '',
      SMTP_PASS: ''
    }));

    const [existingFlags, setExistingFlags] = useState({});
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [testResults, setTestResults] = useState({});
    const [testingKey, setTestingKey] = useState(null);
    const [ollamaDetectedModels, setOllamaDetectedModels] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [liveAnnouncement, setLiveAnnouncement] = useState('');
    const [copiedLabel, setCopiedLabel] = useState('');

    const stepHeadingRef = useRef(null);
    const formRef = useRef(null);

    const authHeaders = () => {
      const h = { 'Content-Type': 'application/json' };
      if (authToken) h['Authorization'] = `Bearer ${authToken}`;
      return h;
    };

    // Cargar configuración actual (sin exponer secretos) si es reconfiguración de Desarrollador
    useEffect(() => {
      if (!isReconfigure) return;
      fetch('/api/setup/current-config', { headers: authHeaders() })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          setExistingFlags(data);
          setForm(prev => ({
            ...prev,
            PORT: data.PORT || prev.PORT,
            PRIMARY_CAMPUS: data.PRIMARY_CAMPUS || prev.PRIMARY_CAMPUS,
            DB_HOST: data.DB_HOST || prev.DB_HOST,
            DB_PORT: data.DB_PORT || prev.DB_PORT,
            DB_USER: data.DB_USER || prev.DB_USER,
            DB_PASSWORD: data.hasDbPassword ? '__KEEP_EXISTING__' : '',
            DB_NAME: data.DB_NAME || prev.DB_NAME,
            GEMINI_API_KEY: data.hasGeminiKey ? '__KEEP_EXISTING__' : '',
            ANTHROPIC_API_KEY: data.hasAnthropicKey ? '__KEEP_EXISTING__' : '',
            OPENAI_API_KEY: data.hasOpenAiKey ? '__KEEP_EXISTING__' : '',
            DEEPSEEK_API_KEY: data.hasDeepSeekKey ? '__KEEP_EXISTING__' : '',
            GROQ_API_KEY: data.hasGroqKey ? '__KEEP_EXISTING__' : '',
            OLLAMA_ENABLED: Boolean(data.OLLAMA_ENABLED),
            OLLAMA_BASE_URL: data.OLLAMA_BASE_URL || prev.OLLAMA_BASE_URL,
            OLLAMA_MODEL: data.OLLAMA_MODEL || prev.OLLAMA_MODEL,
            OLLAMA_TIMEOUT_MS: data.OLLAMA_TIMEOUT_MS || prev.OLLAMA_TIMEOUT_MS,
            SKIP_WHATSAPP: !data.WHATSAPP_PHONE_NUMBER_ID && !data.hasWhatsAppToken,
            WHATSAPP_PHONE_NUMBER_ID: data.WHATSAPP_PHONE_NUMBER_ID || '',
            WHATSAPP_TOKEN: data.hasWhatsAppToken ? '__KEEP_EXISTING__' : '',
            META_VERIFY_TOKEN: data.META_VERIFY_TOKEN || prev.META_VERIFY_TOKEN,
            JWT_SECRET: data.hasJwtSecret ? '__KEEP_EXISTING__' : prev.JWT_SECRET,
            ENCRYPTION_MASTER_KEY: data.hasEncryptionKey ? '__KEEP_EXISTING__' : prev.ENCRYPTION_MASTER_KEY,
            ADMISSIONS_NOTIFICATION_EMAIL: data.ADMISSIONS_NOTIFICATION_EMAIL || '',
            ALERT_ADMIN_EMAIL: data.ALERT_ADMIN_EMAIL || '',
            SMTP_HOST: data.SMTP_HOST || prev.SMTP_HOST,
            SMTP_PORT: data.SMTP_PORT || prev.SMTP_PORT,
            SMTP_USER: data.SMTP_USER || '',
            SMTP_PASS: data.hasSmtpPass ? '__KEEP_EXISTING__' : ''
          }));
        })
        .catch(() => {});
    }, [isReconfigure]);

    // Mover foco accesible al encabezado al cambiar de paso
    useEffect(() => {
      if (stepHeadingRef.current) {
        stepHeadingRef.current.focus();
      }
    }, [step]);

    const handleFieldChange = (key, val) => {
      setForm(prev => ({ ...prev, [key]: val }));
      setSubmitError('');
      // En input: SOLO limpiar error existente una vez que el usuario lo corrija (no gritar mientras escribe)
      if (errors[key] || touched[key]) {
        const nextErr = validateClientField(key, val, false);
        if (!nextErr) {
          setErrors(prev => {
            const copy = { ...prev };
            delete copy[key];
            delete copy.AI_PROVIDERS;
            return copy;
          });
        }
      }
    };

    const isFieldRequiredNow = (key) => {
      if (['PORT', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME', 'META_VERIFY_TOKEN', 'JWT_SECRET', 'ENCRYPTION_MASTER_KEY'].includes(key)) {
        return true;
      }
      if (!isReconfigure && ['DEV_EMAIL', 'DEV_NAME', 'DEV_PASSWORD'].includes(key)) return true;
      if (form.OLLAMA_ENABLED && ['OLLAMA_BASE_URL', 'OLLAMA_MODEL', 'OLLAMA_TIMEOUT_MS'].includes(key)) return true;
      if (!form.SKIP_WHATSAPP && ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TOKEN'].includes(key)) return true;
      if (form.ADMIN_SEDE_EMAIL && form.ADMIN_SEDE_EMAIL.trim() && key === 'ADMIN_SEDE_PASSWORD') return true;
      const anySmtp = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].some(k => form[k] && form[k] !== '' && form[k] !== 'smtp.gmail.com');
      if (anySmtp && ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'].includes(key)) return true;
      return false;
    };

    const handleFieldBlur = (key) => {
      setTouched(prev => ({ ...prev, [key]: true }));
      const val = form[key];
      // Solo mostrar error si el usuario ingresó algo o el campo es requerido
      if (val === '' && !isFieldRequiredNow(key)) {
        setErrors(prev => {
          const c = { ...prev };
          delete c[key];
          return c;
        });
        return;
      }
      const err = validateClientField(key, val, isFieldRequiredNow(key));
      setErrors(prev => {
        const c = { ...prev };
        if (err) c[key] = err;
        else delete c[key];
        return c;
      });
      if (err) setLiveAnnouncement(err);
    };

    const validateStep = (targetStep) => {
      const stepErrors = {};
      const checkKeys = (keys) => {
        for (const k of keys) {
          const err = validateClientField(k, form[k], isFieldRequiredNow(k));
          if (err) stepErrors[k] = err;
        }
      };

      if (targetStep === 1) {
        checkKeys(['PORT', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']);
      } else if (targetStep === 2) {
        checkKeys(['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GROQ_API_KEY']);
        if (form.OLLAMA_ENABLED) {
          checkKeys(['OLLAMA_BASE_URL', 'OLLAMA_MODEL', 'OLLAMA_API_KEY', 'OLLAMA_TIMEOUT_MS']);
        }
        const hasAnyCloud = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GROQ_API_KEY']
          .some(k => form[k] && String(form[k]).trim() && !stepErrors[k]);
        if (!hasAnyCloud && !form.OLLAMA_ENABLED) {
          stepErrors.AI_PROVIDERS = 'Error: Configura al menos un motor de IA válido (recomendado: Google Gemini) o habilita Ollama Local.';
        }
      } else if (targetStep === 3) {
        checkKeys(['META_VERIFY_TOKEN']);
        if (!form.SKIP_WHATSAPP) {
          checkKeys(['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TOKEN']);
        }
      } else if (targetStep === 4) {
        checkKeys(['JWT_SECRET', 'ENCRYPTION_MASTER_KEY']);
        if (!isReconfigure) {
          checkKeys(['DEV_EMAIL', 'DEV_NAME', 'DEV_PASSWORD']);
        } else if (form.DEV_PASSWORD && form.DEV_PASSWORD.trim()) {
          checkKeys(['DEV_PASSWORD']);
        }
        if (form.ADMIN_SEDE_EMAIL && form.ADMIN_SEDE_EMAIL.trim()) {
          checkKeys(['ADMIN_SEDE_EMAIL', 'ADMIN_SEDE_PASSWORD']);
        }
      } else if (targetStep === 5) {
        checkKeys(['ADMISSIONS_NOTIFICATION_EMAIL', 'ALERT_ADMIN_EMAIL']);
        const anySmtp = Boolean((form.SMTP_USER && form.SMTP_USER.trim()) || (form.SMTP_PASS && form.SMTP_PASS.trim()));
        if (anySmtp) {
          checkKeys(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']);
        }
      }

      setErrors(stepErrors);
      const firstKey = Object.keys(stepErrors)[0];
      if (firstKey) {
        setLiveAnnouncement(stepErrors[firstKey]);
        const el = formRef.current?.querySelector(`[name="${firstKey}"]`);
        if (el) el.focus();
        return false;
      }
      return true;
    };

    const runLiveTest = async (testId, endpoint, payload) => {
      setTestingKey(testId);
      setTestResults(prev => ({ ...prev, [testId]: null }));
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          setTestResults(prev => ({ ...prev, [testId]: { ok: true, message: data.message } }));
          if (testId === 'ollama' && Array.isArray(data.installedModels)) {
            setOllamaDetectedModels(data.installedModels);
          }
          setLiveAnnouncement(data.message);
        } else {
          setTestResults(prev => ({ ...prev, [testId]: { ok: false, message: data.error || 'Falló la verificación.' } }));
          setLiveAnnouncement(data.error || 'Falló la verificación.');
        }
      } catch (err) {
        setTestResults(prev => ({ ...prev, [testId]: { ok: false, message: 'Error de red: ' + err.message } }));
      } finally {
        setTestingKey(null);
      }
    };

    const copyValue = async (text, label) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedLabel(label);
        setLiveAnnouncement(`${label} copiado al portapapeles.`);
        setTimeout(() => setCopiedLabel(''), 2500);
      } catch (_) {}
    };

    const handleStepSubmit = async (e) => {
      e.preventDefault();
      if (!validateStep(step)) return;
      if (step < 5) {
        setStep(s => s + 1);
        return;
      }

      // Paso 5: envío final al backend
      setSubmitting(true);
      setSubmitError('');
      try {
        const res = await fetch('/api/setup/complete', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(form)
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setSubmitError(data.error || 'No se pudo completar la configuración.');
          if (data.errors) setErrors(data.errors);
          setLiveAnnouncement(data.error || 'Error al guardar configuración.');
          return;
        }
        setLiveAnnouncement('Metal-Uriel configurado exitosamente.');
        if (onComplete) onComplete(data);
      } catch (err) {
        setSubmitError('Error de conexión con el servidor: ' + err.message);
      } finally {
        setSubmitting(false);
      }
    };

    const hw = setupStatus?.hardware || {};
    const hwBannerStyle = hw.ollamaRecommendation === 'not_recommended'
      ? 'bg-red-950/50 border-red-500/40 text-red-200'
      : hw.ollamaRecommendation === 'caution_tiny'
        ? 'bg-amber-950/50 border-amber-500/40 text-amber-200'
        : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200';

    const renderTestBadge = (testId) => {
      const res = testResults[testId];
      if (!res) return null;
      return (
        <div role="status" className={`mt-2 px-3 py-2 rounded-xl text-xs font-semibold border flex items-start gap-2 ${
          res.ok ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-red-950/60 border-red-500/40 text-red-300'
        }`}>
          <span aria-hidden="true">{res.ok ? '✅' : '❌'}</span>
          <span>{res.message}</span>
        </div>
      );
    };

    return (
      <div className="fixed inset-0 z-50 bg-[#071122] overflow-y-auto px-4 py-6 sm:py-10">
        {/* Región única polite para anuncios accesibles */}
        <div aria-live="polite" className="visually-hidden">{liveAnnouncement}</div>

        <div className="max-w-3xl mx-auto space-y-6">
          {/* Header Institucional */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0F172A] border border-amber-500/30 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FFC72C] to-red-600 flex items-center justify-center text-2xl shadow-lg">
                🐺
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-black text-white">
                  {isReconfigure ? 'Reconfigurar Servidor Metal-Uriel' : 'Instalación Plug & Play • Metal-Uriel v2.0'}
                </h1>
                <p className="text-xs text-slate-400">
                  Asistente inicial de credenciales, base de datos MariaDB, cascada IA y seguridad RBAC
                </p>
              </div>
            </div>
            {isReconfigure && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="wizard-btn min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-slate-200"
              >
                ✕ Volver al Panel
              </button>
            )}
          </div>

          {/* Barra de Progreso Accesible */}
          <nav aria-label="Progreso de configuración" className="bg-[#0F172A] border border-slate-800 rounded-2xl p-3">
            <ol className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {STEPS.map(s => {
                const isActive = step === s.id;
                const isDone = step > s.id;
                return (
                  <li key={s.id} aria-current={isActive ? 'step' : undefined}>
                    <button
                      type="button"
                      onClick={() => {
                        if (s.id < step || validateStep(step)) setStep(s.id);
                      }}
                      className={`wizard-btn w-full min-h-[48px] px-2.5 py-2 rounded-xl text-left border transition flex items-center gap-2 ${
                        isActive
                          ? 'bg-amber-500/15 border-amber-400 text-amber-300'
                          : isDone
                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full text-xs font-black flex items-center justify-center shrink-0 ${
                        isActive ? 'bg-amber-400 text-slate-950' : isDone ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {isDone ? '✓' : s.id}
                      </span>
                      <span className="text-xs font-bold leading-tight">{s.short}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Tarjeta Principal del Formulario */}
          <form
            ref={formRef}
            method="POST"
            action="/api/setup/complete"
            noValidate
            onSubmit={handleStepSubmit}
            aria-labelledby="wizard-step-heading"
            className="bg-[#0F172A] border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5"
          >
            <h2
              id="wizard-step-heading"
              ref={stepHeadingRef}
              tabIndex={-1}
              className="text-lg font-black text-amber-300 focus:outline-none"
            >
              {STEPS[step - 1].title}
            </h2>

            {/* ================= PASO 1: MARIADB & SEDE ================= */}
            {step === 1 && (
              <fieldset className="space-y-2 border-0 p-0 m-0">
                <legend className="visually-hidden">Conexión a MariaDB y Sede Principal</legend>

                <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-700 text-xs text-slate-300 space-y-1 mb-4">
                  <div className="font-bold text-amber-300">💻 Auditoría Automática del Equipo</div>
                  <div>SO: <span className="font-mono text-white">{hw.platform || 'Detectando...'}</span> • CPU: <span className="font-mono text-white">{hw.cpuCores || '?'} núcleos</span> • RAM libre: <span className="font-mono text-emerald-300">{hw.freeMemGB || '?'} / {hw.totalMemGB || '?'} GB</span></div>
                  {hw.lanUrls?.length > 0 && (
                    <div>URLs en Red Local (Admisiones): <span className="font-mono text-sky-300">{hw.lanUrls.join('  |  ')}</span></div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 mb-4">
                  <label htmlFor="PRIMARY_CAMPUS" className="text-sm font-bold text-slate-100">
                    Sede Principal UNID <span className="text-amber-400" aria-hidden="true">*</span>
                  </label>
                  <span id="PRIMARY_CAMPUS-hint" className="text-xs text-slate-400">
                    Campus predeterminado al que se vincularán WhatsApp y el ciclo escolar inicial.
                  </span>
                  <select
                    id="PRIMARY_CAMPUS"
                    name="PRIMARY_CAMPUS"
                    value={form.PRIMARY_CAMPUS}
                    onChange={(e) => handleFieldChange('PRIMARY_CAMPUS', e.target.value)}
                    aria-describedby="PRIMARY_CAMPUS-hint"
                    className="wizard-input w-full rounded-xl bg-[#0F172A] text-slate-100 px-3.5 py-2.5 border border-slate-600"
                  >
                    {(campusesList.length > 0 ? campusesList : [{ id: 'campeche', name: 'Campus San Francisco de Campeche' }]).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <WizardField
                  id="DB_HOST" name="DB_HOST" label="Host de MariaDB" required
                  hint={CLIENT_RULES.DB_HOST.hint} value={form.DB_HOST}
                  pattern={CLIENT_RULES.DB_HOST.pattern}
                  onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.DB_HOST}
                />
                <WizardField
                  id="DB_PORT" name="DB_PORT" label="Puerto de MariaDB" required
                  inputMode="numeric" pattern={CLIENT_RULES.DB_PORT.pattern}
                  hint={CLIENT_RULES.DB_PORT.hint} value={form.DB_PORT}
                  onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.DB_PORT}
                />
                <WizardField
                  id="DB_USER" name="DB_USER" label="Usuario de MariaDB" required
                  hint={CLIENT_RULES.DB_USER.hint} value={form.DB_USER}
                  pattern={CLIENT_RULES.DB_USER.pattern}
                  onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.DB_USER}
                />
                <WizardField
                  id="DB_PASSWORD" name="DB_PASSWORD" label="Contraseña de MariaDB" isSecret
                  hint={CLIENT_RULES.DB_PASSWORD.hint} value={form.DB_PASSWORD}
                  keepExistingHint={existingFlags.hasDbPassword ? '(Guardada actualmente)' : ''}
                  onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.DB_PASSWORD}
                />
                <WizardField
                  id="DB_NAME" name="DB_NAME" label="Nombre de la Base de Datos (se crea automáticamente)" required
                  hint={CLIENT_RULES.DB_NAME.hint} value={form.DB_NAME}
                  pattern={CLIENT_RULES.DB_NAME.pattern}
                  onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.DB_NAME}
                />

                <div className="pt-1">
                  <button
                    type="button"
                    disabled={testingKey === 'db'}
                    onClick={() => runLiveTest('db', '/api/setup/test-db', {
                      DB_HOST: form.DB_HOST, DB_PORT: form.DB_PORT, DB_USER: form.DB_USER,
                      DB_PASSWORD: form.DB_PASSWORD, DB_NAME: form.DB_NAME
                    })}
                    className="wizard-btn min-h-[48px] px-4 rounded-xl bg-sky-600/20 hover:bg-sky-600/35 border border-sky-400/50 text-sky-200 text-xs font-bold transition"
                  >
                    {testingKey === 'db' ? '⏳ Probando conexión MariaDB...' : '🔌 Probar Conexión con MariaDB'}
                  </button>
                  {renderTestBadge('db')}
                </div>
              </fieldset>
            )}

            {/* ================= PASO 2: MOTORES IA + OLLAMA ================= */}
            {step === 2 && (
              <fieldset className="space-y-2 border-0 p-0 m-0">
                <legend className="visually-hidden">Proveedores de Inteligencia Artificial y Ollama Local</legend>

                {errors.AI_PROVIDERS && (
                  <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-xs font-bold text-red-300 flex items-center gap-2 mb-3">
                    <span role="img" aria-label="Error">❌</span>
                    <span>{errors.AI_PROVIDERS}</span>
                  </div>
                )}

                <WizardField
                  id="GEMINI_API_KEY" name="GEMINI_API_KEY" label="1. Google Gemini API Key (Principal — Gemini 3.8 Flash)" isSecret
                  hint={CLIENT_RULES.GEMINI_API_KEY.hint} value={form.GEMINI_API_KEY}
                  pattern={CLIENT_RULES.GEMINI_API_KEY.pattern} minLength={35} maxLength={55}
                  placeholder="AIzaSy..."
                  keepExistingHint={existingFlags.hasGeminiKey ? `(${existingFlags.maskedGeminiKey})` : ''}
                  onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.GEMINI_API_KEY}
                  extraAction={
                    <button
                      type="button"
                      disabled={testingKey === 'google'}
                      onClick={() => runLiveTest('google', '/api/setup/test-ai', { provider: 'google', apiKey: form.GEMINI_API_KEY })}
                      className="wizard-btn px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-[11px] font-bold"
                    >
                      {testingKey === 'google' ? '⏳ Probando...' : '⚡ Probar Gemini'}
                    </button>
                  }
                />
                {renderTestBadge('google')}

                <div className="pt-2 pb-1 border-t border-slate-800">
                  <p className="text-xs font-bold text-slate-300 mb-3">Respaldos en la Nube (Opcionales — Circuit Breaker automático):</p>
                  <WizardField
                    id="OPENAI_API_KEY" name="OPENAI_API_KEY" label="2. OpenAI API Key (Respaldo GPT-4o-mini)" isSecret
                    hint={CLIENT_RULES.OPENAI_API_KEY.hint} value={form.OPENAI_API_KEY}
                    pattern={CLIENT_RULES.OPENAI_API_KEY.pattern} placeholder="sk-proj-..."
                    keepExistingHint={existingFlags.hasOpenAiKey ? '(Configurada)' : ''}
                    onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.OPENAI_API_KEY}
                    extraAction={
                      <button
                        type="button"
                        disabled={testingKey === 'openai'}
                        onClick={() => runLiveTest('openai', '/api/setup/test-ai', { provider: 'openai', apiKey: form.OPENAI_API_KEY })}
                        className="wizard-btn px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-[11px] font-bold"
                      >
                        {testingKey === 'openai' ? '⏳...' : 'Probar OpenAI'}
                      </button>
                    }
                  />
                  {renderTestBadge('openai')}

                  <WizardField
                    id="ANTHROPIC_API_KEY" name="ANTHROPIC_API_KEY" label="3. Anthropic Claude API Key (Opcional)" isSecret
                    hint={CLIENT_RULES.ANTHROPIC_API_KEY.hint} value={form.ANTHROPIC_API_KEY}
                    pattern={CLIENT_RULES.ANTHROPIC_API_KEY.pattern} placeholder="sk-ant-api03-..."
                    keepExistingHint={existingFlags.hasAnthropicKey ? '(Configurada)' : ''}
                    onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.ANTHROPIC_API_KEY}
                  />

                  <WizardField
                    id="GROQ_API_KEY" name="GROQ_API_KEY" label="4. Groq Cloud API Key (Opcional — Tier gratuito ultra rápido)" isSecret
                    hint={CLIENT_RULES.GROQ_API_KEY.hint} value={form.GROQ_API_KEY}
                    pattern={CLIENT_RULES.GROQ_API_KEY.pattern} placeholder="gsk_..."
                    keepExistingHint={existingFlags.hasGroqKey ? '(Configurada)' : ''}
                    onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.GROQ_API_KEY}
                    extraAction={
                      <button
                        type="button"
                        disabled={testingKey === 'groq'}
                        onClick={() => runLiveTest('groq', '/api/setup/test-ai', { provider: 'groq', apiKey: form.GROQ_API_KEY })}
                        className="wizard-btn px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-[11px] font-bold"
                      >
                        {testingKey === 'groq' ? '⏳...' : 'Probar Groq'}
                      </button>
                    }
                  />
                  {renderTestBadge('groq')}

                  <WizardField
                    id="DEEPSEEK_API_KEY" name="DEEPSEEK_API_KEY" label="5. DeepSeek API Key (Opcional)" isSecret
                    hint={CLIENT_RULES.DEEPSEEK_API_KEY.hint} value={form.DEEPSEEK_API_KEY}
                    pattern={CLIENT_RULES.DEEPSEEK_API_KEY.pattern} placeholder="sk-..."
                    keepExistingHint={existingFlags.hasDeepSeekKey ? '(Configurada)' : ''}
                    onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.DEEPSEEK_API_KEY}
                  />
                </div>

                {/* Sección Ollama Local Opcional */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-700 space-y-3 mt-4">
                  <div className="flex items-start gap-3">
                    <input
                      id="OLLAMA_ENABLED"
                      name="OLLAMA_ENABLED"
                      type="checkbox"
                      checked={Boolean(form.OLLAMA_ENABLED)}
                      onChange={(e) => handleFieldChange('OLLAMA_ENABLED', e.target.checked)}
                      className="mt-1 w-5 h-5 accent-[#FFC72C] rounded cursor-pointer"
                    />
                    <label htmlFor="OLLAMA_ENABLED" className="text-sm font-bold text-white cursor-pointer">
                      🦙 Habilitar Ollama Local como ÚLTIMO recurso en la cascada (Opcional)
                    </label>
                  </div>

                  <div className={`p-3 rounded-xl border text-xs leading-relaxed ${hwBannerStyle}`}>
                    <strong>Diagnóstico de Hardware para Ollama:</strong> {hw.ollamaNote || 'Verifica RAM libre antes de activar modelos locales.'}
                  </div>

                  {form.OLLAMA_ENABLED && (
                    <div className="pt-2 space-y-2">
                      <WizardField
                        id="OLLAMA_BASE_URL" name="OLLAMA_BASE_URL" label="URL del Servicio Ollama" required
                        hint={CLIENT_RULES.OLLAMA_BASE_URL.hint} value={form.OLLAMA_BASE_URL}
                        pattern={CLIENT_RULES.OLLAMA_BASE_URL.pattern}
                        onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.OLLAMA_BASE_URL}
                      />
                      <WizardField
                        id="OLLAMA_MODEL" name="OLLAMA_MODEL" label="Modelo Ollama (Recomendado <= 3B en 8 GB RAM)" required
                        hint={CLIENT_RULES.OLLAMA_MODEL.hint} value={form.OLLAMA_MODEL}
                        pattern={CLIENT_RULES.OLLAMA_MODEL.pattern}
                        onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.OLLAMA_MODEL}
                      />
                      <WizardField
                        id="OLLAMA_TIMEOUT_MS" name="OLLAMA_TIMEOUT_MS" label="Timeout Máximo Ollama (ms)" required
                        inputMode="numeric" pattern={CLIENT_RULES.OLLAMA_TIMEOUT_MS.pattern}
                        hint={CLIENT_RULES.OLLAMA_TIMEOUT_MS.hint} value={form.OLLAMA_TIMEOUT_MS}
                        onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.OLLAMA_TIMEOUT_MS}
                      />
                      <WizardField
                        id="OLLAMA_API_KEY" name="OLLAMA_API_KEY" label="Token Bearer de Ollama (Opcional)" isSecret
                        hint={CLIENT_RULES.OLLAMA_API_KEY.hint} value={form.OLLAMA_API_KEY}
                        onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.OLLAMA_API_KEY}
                      />

                      <button
                        type="button"
                        disabled={testingKey === 'ollama'}
                        onClick={() => runLiveTest('ollama', '/api/setup/test-ai', {
                          provider: 'ollama', ollamaUrl: form.OLLAMA_BASE_URL, ollamaModel: form.OLLAMA_MODEL, ollamaApiKey: form.OLLAMA_API_KEY
                        })}
                        className="wizard-btn min-h-[44px] px-4 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-400/50 text-emerald-200 text-xs font-bold"
                      >
                        {testingKey === 'ollama' ? '⏳ Detectando Ollama...' : '🔍 Detectar Ollama y Modelos Instalados'}
                      </button>
                      {renderTestBadge('ollama')}

                      {ollamaDetectedModels.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {ollamaDetectedModels.map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => handleFieldChange('OLLAMA_MODEL', m)}
                              className="wizard-btn px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-500/20 border border-slate-600 text-[11px] font-mono text-amber-200"
                            >
                              Usar: {m}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </fieldset>
            )}

            {/* ================= PASO 3: META WHATSAPP CLOUD API ================= */}
            {step === 3 && (
              <fieldset className="space-y-2 border-0 p-0 m-0">
                <legend className="visually-hidden">Credenciales Oficiales de Meta WhatsApp Cloud API</legend>

                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-700 mb-4">
                  <input
                    id="SKIP_WHATSAPP"
                    name="SKIP_WHATSAPP"
                    type="checkbox"
                    checked={Boolean(form.SKIP_WHATSAPP)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      handleFieldChange('SKIP_WHATSAPP', checked);
                      if (checked) {
                        setErrors(prev => {
                          const c = { ...prev };
                          delete c.WHATSAPP_PHONE_NUMBER_ID;
                          delete c.WHATSAPP_TOKEN;
                          return c;
                        });
                      }
                    }}
                    className="mt-1 w-5 h-5 accent-[#FFC72C] rounded cursor-pointer"
                  />
                  <label htmlFor="SKIP_WHATSAPP" className="text-xs sm:text-sm text-slate-200 cursor-pointer">
                    <strong>Configurar WhatsApp Cloud API después</strong> (arrancar primero en modo Simulador / Red Local y añadir el token permanente desde Configuración de Sedes).
                  </label>
                </div>

                {!form.SKIP_WHATSAPP && (
                  <>
                    <WizardField
                      id="WHATSAPP_PHONE_NUMBER_ID" name="WHATSAPP_PHONE_NUMBER_ID" label="WhatsApp Phone Number ID" required
                      inputMode="numeric" pattern={CLIENT_RULES.WHATSAPP_PHONE_NUMBER_ID.pattern}
                      minLength={10} maxLength={20} placeholder="1332834883256423"
                      hint={CLIENT_RULES.WHATSAPP_PHONE_NUMBER_ID.hint} value={form.WHATSAPP_PHONE_NUMBER_ID}
                      onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.WHATSAPP_PHONE_NUMBER_ID}
                    />
                    <WizardField
                      id="WHATSAPP_TOKEN" name="WHATSAPP_TOKEN" label="Meta WhatsApp Permanent Access Token" required isSecret
                      pattern={CLIENT_RULES.WHATSAPP_TOKEN.pattern} minLength={80} maxLength={500} placeholder="EAAG..."
                      hint={CLIENT_RULES.WHATSAPP_TOKEN.hint} value={form.WHATSAPP_TOKEN}
                      keepExistingHint={existingFlags.hasWhatsAppToken ? `(${existingFlags.maskedWhatsAppToken})` : ''}
                      onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.WHATSAPP_TOKEN}
                    />

                    <div className="pb-3">
                      <button
                        type="button"
                        disabled={testingKey === 'whatsapp'}
                        onClick={() => runLiveTest('whatsapp', '/api/setup/test-whatsapp', {
                          WHATSAPP_PHONE_NUMBER_ID: form.WHATSAPP_PHONE_NUMBER_ID,
                          WHATSAPP_TOKEN: form.WHATSAPP_TOKEN
                        })}
                        className="wizard-btn min-h-[48px] px-4 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-400/50 text-emerald-200 text-xs font-bold"
                      >
                        {testingKey === 'whatsapp' ? '⏳ Consultando Meta Graph API...' : '💬 Verificar Número y Token con Meta Graph API'}
                      </button>
                      {renderTestBadge('whatsapp')}
                    </div>
                  </>
                )}

                <WizardField
                  id="META_VERIFY_TOKEN" name="META_VERIFY_TOKEN" label="Meta Webhook Verify Token" required
                  pattern={CLIENT_RULES.META_VERIFY_TOKEN.pattern} minLength={8} maxLength={128}
                  hint={CLIENT_RULES.META_VERIFY_TOKEN.hint} value={form.META_VERIFY_TOKEN}
                  onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.META_VERIFY_TOKEN}
                  extraAction={
                    <button
                      type="button"
                      onClick={() => handleFieldChange('META_VERIFY_TOKEN', 'unid_meta_' + browserRandomHex(10))}
                      className="wizard-btn px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-300 text-[11px] font-bold"
                    >
                      🎲 Generar
                    </button>
                  }
                />
              </fieldset>
            )}

            {/* ================= PASO 4: SEGURIDAD Y CUENTAS RBAC ================= */}
            {step === 4 && (
              <fieldset className="space-y-2 border-0 p-0 m-0">
                <legend className="visually-hidden">Criptografía y Cuentas Administrativas RBAC</legend>

                <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-purple-950/30 border border-purple-500/30 mb-4">
                  <div className="text-xs text-purple-200">
                    <strong>🔐 Blindaje de Producción:</strong> Genera llaves criptográficas únicas de 256 bits para este servidor (se desactivan contraseñas demo).
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleFieldChange('JWT_SECRET', browserRandomHex(32));
                      handleFieldChange('ENCRYPTION_MASTER_KEY', browserRandomHex(32));
                    }}
                    className="wizard-btn px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold"
                  >
                    🔑 Regenerar Llaves 256-bit
                  </button>
                </div>

                <WizardField
                  id="JWT_SECRET" name="JWT_SECRET" label="JWT Secret (Firma de Sesiones)" required isSecret
                  hint={CLIENT_RULES.JWT_SECRET.hint} value={form.JWT_SECRET}
                  minLength={32} maxLength={128}
                  keepExistingHint={existingFlags.hasJwtSecret ? '(Llave 256-bit activa)' : ''}
                  onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.JWT_SECRET}
                />
                <WizardField
                  id="ENCRYPTION_MASTER_KEY" name="ENCRYPTION_MASTER_KEY" label="Llave Maestra AES-256-GCM (Bóveda MariaDB)" required isSecret
                  hint={CLIENT_RULES.ENCRYPTION_MASTER_KEY.hint} value={form.ENCRYPTION_MASTER_KEY}
                  minLength={32} maxLength={128}
                  keepExistingHint={existingFlags.hasEncryptionKey ? '(Llave 256-bit activa)' : ''}
                  onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.ENCRYPTION_MASTER_KEY}
                />

                <div className="pt-3 border-t border-slate-800">
                  <h3 className="text-sm font-black text-amber-300 mb-3">
                    🛠️ Cuenta Superadmin / Desarrollador {isReconfigure ? '(deja la contraseña vacía para mantener la actual)' : ''}
                  </h3>
                  <WizardField
                    id="DEV_EMAIL" name="DEV_EMAIL" label="Correo Institucional del Desarrollador" type="email" required={!isReconfigure}
                    autoComplete="username" hint={CLIENT_RULES.DEV_EMAIL.hint} value={form.DEV_EMAIL}
                    onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.DEV_EMAIL}
                  />
                  <WizardField
                    id="DEV_NAME" name="DEV_NAME" label="Nombre Completo" required={!isReconfigure}
                    autoComplete="name" hint={CLIENT_RULES.DEV_NAME.hint} value={form.DEV_NAME}
                    onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.DEV_NAME}
                  />
                  <WizardField
                    id="DEV_PASSWORD" name="DEV_PASSWORD" label="Contraseña Fuerte del Desarrollador" isSecret required={!isReconfigure}
                    autoComplete="new-password" pattern={CLIENT_RULES.DEV_PASSWORD.pattern} minLength={12} maxLength={128}
                    hint={CLIENT_RULES.DEV_PASSWORD.hint} value={form.DEV_PASSWORD}
                    onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.DEV_PASSWORD}
                    extraAction={
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleFieldChange('DEV_PASSWORD', browserRandomPassword(20))}
                          className="wizard-btn px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-200 text-[11px] font-bold"
                        >
                          🎲 Generar 20 chars
                        </button>
                        {form.DEV_PASSWORD && (
                          <button
                            type="button"
                            onClick={() => copyValue(form.DEV_PASSWORD, 'Contraseña Desarrollador')}
                            className="wizard-btn px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-[11px] font-bold"
                          >
                            {copiedLabel === 'Contraseña Desarrollador' ? '✅ Copiada' : '📋 Copiar'}
                          </button>
                        )}
                      </div>
                    }
                  />
                </div>

                <div className="pt-3 border-t border-slate-800">
                  <h3 className="text-sm font-bold text-slate-200 mb-3">
                    🏛️ Cuenta Inicial de Administrador de Sede / Jefatura de Admisiones (Opcional)
                  </h3>
                  <WizardField
                    id="ADMIN_SEDE_EMAIL" name="ADMIN_SEDE_EMAIL" label="Correo Institucional de Jefatura" type="email"
                    hint={CLIENT_RULES.ADMIN_SEDE_EMAIL.hint} value={form.ADMIN_SEDE_EMAIL} placeholder="admisiones.campeche@red.unid.mx"
                    onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.ADMIN_SEDE_EMAIL}
                  />
                  {form.ADMIN_SEDE_EMAIL && form.ADMIN_SEDE_EMAIL.trim() && (
                    <WizardField
                      id="ADMIN_SEDE_PASSWORD" name="ADMIN_SEDE_PASSWORD" label="Contraseña Fuerte para Jefatura" isSecret required
                      autoComplete="new-password" pattern={CLIENT_RULES.ADMIN_SEDE_PASSWORD.pattern} minLength={12} maxLength={128}
                      hint={CLIENT_RULES.ADMIN_SEDE_PASSWORD.hint} value={form.ADMIN_SEDE_PASSWORD}
                      onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.ADMIN_SEDE_PASSWORD}
                      extraAction={
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleFieldChange('ADMIN_SEDE_PASSWORD', browserRandomPassword(20))}
                            className="wizard-btn px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-200 text-[11px] font-bold"
                          >
                            🎲 Generar
                          </button>
                          {form.ADMIN_SEDE_PASSWORD && (
                            <button
                              type="button"
                              onClick={() => copyValue(form.ADMIN_SEDE_PASSWORD, 'Contraseña Jefatura')}
                              className="wizard-btn px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-[11px] font-bold"
                            >
                              {copiedLabel === 'Contraseña Jefatura' ? '✅ Copiada' : '📋 Copiar'}
                            </button>
                          )}
                        </div>
                      }
                    />
                  )}
                </div>
              </fieldset>
            )}

            {/* ================= PASO 5: SMTP, LIFE SUPPORT & LANZAMIENTO ================= */}
            {step === 5 && (
              <fieldset className="space-y-2 border-0 p-0 m-0">
                <legend className="visually-hidden">Correo SMTP, Alertas de Mantenimiento y Finalización</legend>

                <WizardField
                  id="ADMISSIONS_NOTIFICATION_EMAIL" name="ADMISSIONS_NOTIFICATION_EMAIL" type="email"
                  label="Correo de Notificaciones de Admisiones (Opcional)" placeholder="admisiones.campeche@unid.mx"
                  hint={CLIENT_RULES.ADMISSIONS_NOTIFICATION_EMAIL.hint} value={form.ADMISSIONS_NOTIFICATION_EMAIL}
                  onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.ADMISSIONS_NOTIFICATION_EMAIL}
                />
                <WizardField
                  id="ALERT_ADMIN_EMAIL" name="ALERT_ADMIN_EMAIL" type="email"
                  label="🚨 Correo de Alertas Críticas / Life Support (Muy Recomendado)" placeholder="tu.correo@gmail.com"
                  hint={CLIENT_RULES.ALERT_ADMIN_EMAIL.hint} value={form.ALERT_ADMIN_EMAIL}
                  onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.ALERT_ADMIN_EMAIL}
                />

                <div className="pt-2 border-t border-slate-800">
                  <p className="text-xs font-bold text-slate-300 mb-3">Servidor SMTP Saliente (Opcional — si se omite usa vista previa Ethereal):</p>
                  <WizardField
                    id="SMTP_HOST" name="SMTP_HOST" label="Servidor SMTP"
                    hint={CLIENT_RULES.SMTP_HOST.hint} value={form.SMTP_HOST}
                    onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.SMTP_HOST}
                  />
                  <WizardField
                    id="SMTP_PORT" name="SMTP_PORT" label="Puerto SMTP" inputMode="numeric"
                    hint={CLIENT_RULES.SMTP_PORT.hint} value={form.SMTP_PORT}
                    onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.SMTP_PORT}
                  />
                  <WizardField
                    id="SMTP_USER" name="SMTP_USER" label="Cuenta Emisora SMTP" type="email" placeholder="notificaciones.unid@gmail.com"
                    hint={CLIENT_RULES.SMTP_USER.hint} value={form.SMTP_USER}
                    onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.SMTP_USER}
                  />
                  <WizardField
                    id="SMTP_PASS" name="SMTP_PASS" label="Contraseña / App Password SMTP" isSecret enterKeyHint="done"
                    hint={CLIENT_RULES.SMTP_PASS.hint} value={form.SMTP_PASS}
                    keepExistingHint={existingFlags.hasSmtpPass ? '(Guardada actualmente)' : ''}
                    onChange={handleFieldChange} onBlur={handleFieldBlur} error={errors.SMTP_PASS}
                  />

                  <div className="pb-3">
                    <button
                      type="button"
                      disabled={testingKey === 'smtp'}
                      onClick={() => runLiveTest('smtp', '/api/setup/test-smtp', {
                        SMTP_HOST: form.SMTP_HOST, SMTP_PORT: form.SMTP_PORT,
                        SMTP_USER: form.SMTP_USER, SMTP_PASS: form.SMTP_PASS,
                        testDestination: form.ALERT_ADMIN_EMAIL || form.ADMISSIONS_NOTIFICATION_EMAIL || form.SMTP_USER
                      })}
                      className="wizard-btn min-h-[48px] px-4 rounded-xl bg-sky-600/20 hover:bg-sky-600/35 border border-sky-400/50 text-sky-200 text-xs font-bold"
                    >
                      {testingKey === 'smtp' ? '⏳ Enviando correo de prueba...' : '📧 Probar SMTP y Enviar Correo de Prueba'}
                    </button>
                    {renderTestBadge('smtp')}
                  </div>
                </div>

                {/* Resumen de lanzamiento */}
                <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-100 space-y-1.5">
                  <div className="font-black text-emerald-300">✅ Resumen listo para desplegar en caliente:</div>
                  <div>• Base de datos: <span className="font-mono">{form.DB_USER}@{form.DB_HOST}:{form.DB_PORT}/{form.DB_NAME}</span> (auto-creación de 8 tablas)</div>
                  <div>• Motores IA activos: <span className="font-mono">
                    {[
                      form.GEMINI_API_KEY ? 'Gemini 3.8 Flash' : null,
                      form.ANTHROPIC_API_KEY ? 'Claude' : null,
                      form.OPENAI_API_KEY ? 'OpenAI' : null,
                      form.GROQ_API_KEY ? 'Groq' : null,
                      form.DEEPSEEK_API_KEY ? 'DeepSeek' : null,
                      form.OLLAMA_ENABLED ? `Ollama (${form.OLLAMA_MODEL})` : null
                    ].filter(Boolean).join(' → ') || 'Ninguno'}
                  </span></div>
                  <div>• WhatsApp Cloud API: <span className="font-mono">{form.SKIP_WHATSAPP ? 'Modo Simulador LAN (pendiente)' : `Phone ID ${form.WHATSAPP_PHONE_NUMBER_ID}`}</span></div>
                  <div>• Alertas Life Support: <span className="font-mono">{form.ALERT_ADMIN_EMAIL || form.ADMISSIONS_NOTIFICATION_EMAIL || 'Sin correo configurado'}</span></div>
                </div>
              </fieldset>
            )}

            {submitError && (
              <div role="alert" className="p-3.5 rounded-xl bg-red-950/70 border border-red-500/50 text-xs font-bold text-red-200 flex items-start gap-2">
                <span role="img" aria-label="Error">❌</span>
                <span>{submitError}</span>
              </div>
            )}

            {/* Navegación Inferior */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(s => s - 1)}
                  enterKeyHint="previous"
                  className="wizard-btn min-h-[48px] px-5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-sm font-bold text-slate-200 transition"
                >
                  ← Paso Anterior
                </button>
              ) : <div />}

              <button
                type="submit"
                disabled={submitting}
                enterKeyHint={step < 5 ? 'next' : 'done'}
                className="wizard-btn min-h-[48px] px-6 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] text-slate-950 font-black text-sm shadow-lg hover:brightness-110 transition disabled:opacity-60"
              >
                {submitting
                  ? '⏳ Guardando .env e inicializando MariaDB...'
                  : step < 5
                    ? 'Continuar al Siguiente Paso →'
                    : '🚀 Guardar Configuración y Arrancar Metal-Uriel'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  window.MetalUrielSetupWizard = SetupWizard;
  window.MetalUrielRandomPassword = browserRandomPassword;
})();
