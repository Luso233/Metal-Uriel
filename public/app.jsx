const { useState, useEffect, useRef, useMemo } = React;

// 11 Campos Obligatorios según el System Prompt
const REQUIRED_FIELDS = [
  { key: 'nombre_completo', label: '1. Nombre completo', icon: 'user' },
  { key: 'fecha_nacimiento', label: '2. Fecha de nacimiento', icon: 'calendar' },
  { key: 'sexo', label: '3. Sexo (M / F / Otro)', icon: 'users' },
  { key: 'estado_nacimiento', label: '4. Estado de nacimiento', icon: 'map-pin' },
  { key: 'telefono_celular', label: '5. Teléfono celular', icon: 'phone' },
  { key: 'correo_electronico', label: '6. Correo electrónico', icon: 'mail' },
  { key: 'bachillerato_procedencia', label: '7. Bachillerato de procedencia', icon: 'graduation-cap' },
  { key: 'carrera_interes', label: '8. Carrera de interés', icon: 'book-open' },
  { key: 'direccion', label: '9. Dirección completa y CP', icon: 'home' },
  { key: 'campus_interes', label: '10. Campus de interés', icon: 'building-2' },
  { key: 'modalidad_estudios', label: '11. Modalidad (Presencial / Online)', icon: 'laptop' }
];

// Columnas del tablero Kanban con estilo UNID
const KANBAN_COLUMNS = [
  { id: 'nuevo', title: 'Nuevos Prospectos', color: 'border-sky-500/40 bg-sky-950/20 text-sky-300', badge: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  { id: 'contactado', title: 'Contactados', color: 'border-amber-500/40 bg-amber-950/20 text-amber-300', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { id: 'en_proceso', title: 'En Proceso / Cita', color: 'border-purple-500/40 bg-purple-950/20 text-purple-300', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { id: 'inscrito', title: 'Inscritos 🎉', color: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { id: 'no_interesado', title: 'No Interesado', color: 'border-slate-600/40 bg-slate-900/40 text-slate-400', badge: 'bg-slate-700/50 text-slate-300 border-slate-600/30' }
];

// Sedes UNID por defecto
const DEFAULT_CAMPUSES = [
  { id: 'all', name: 'Todas las Sedes UNID (Nacional)' },
  { id: 'campeche', name: 'Campus San Francisco de Campeche' },
  { id: 'cancun', name: 'Campus Cancún' },
  { id: 'chetumal', name: 'Campus Chetumal' },
  { id: 'playa_del_carmen', name: 'Campus Playa del Carmen' },
  { id: 'cozumel', name: 'Campus Cozumel' },
  { id: 'merida', name: 'Campus Mérida' },
  { id: 'villahermosa', name: 'Campus Villahermosa' },
  { id: 'tijuana', name: 'Campus Tijuana' },
  { id: 'ensenada', name: 'Campus Ensenada' },
  { id: 'guadalajara', name: 'Campus Guadalajara' },
  { id: 'zapopan', name: 'Campus Zapopan' },
  { id: 'aguascalientes', name: 'Campus Aguascalientes' },
  { id: 'zacatecas', name: 'Campus Zacatecas' },
  { id: 'slp', name: 'Campus San Luis Potosí' },
  { id: 'toluca', name: 'Campus Toluca' },
  { id: 'tlalnepantla', name: 'Campus Tlalnepantla' },
  { id: 'morelia', name: 'Campus Morelia' },
  { id: 'uruapan', name: 'Campus Uruapan' },
  { id: 'pachuca', name: 'Campus Pachuca' },
  { id: 'tampico', name: 'Campus Tampico' },
  { id: 'durango', name: 'Campus Durango' },
  { id: 'online_nacional', name: 'UNID Online (100% Virtual)' }
];

// Casos de Prueba para el Laboratorio Flotante
const TEST_SUITE_CATEGORIES = [
  {
    id: 'caso_oficial_admisiones',
    title: '⭐ 0. Flujo Oficial UNID: Recopilación Progresiva & CURP Automática',
    cases: [
      {
        title: 'Paso 1: Solicitud de Información (Ing. Software y Sistemas)',
        desc: 'Inicia plática preguntando por la ingeniería y plan de estudios',
        text: 'Buenas tardes, me gustaría pedir informes sobre la Ingeniería en Software y Sistemas Computacionales para el campus Campeche.'
      },
      {
        title: 'Paso 2: Entrega de Datos Clave (Cálculo Automático de CURP)',
        desc: 'Datos de aspirante; la IA calcula la CURP sin pedirla',
        text: 'Claro que sí, me llamo Luis Felipe Pérez, nací el 2003-08-14 en Campeche. Hombre. Mi cel es 9811234567, correo luis.felipe@gmail.com. Egresé del COBACAM 01. Me interesa Ing. en Software y Sistemas Computacionales en modalidad Presencial en Campus Campeche. Vivo en Calle 10 #45 Col. Miramar, CP 24020.'
      },
      {
        title: 'Paso 3: Solicitud del Plan de Estudios en PDF',
        desc: 'Petición directa que activa el envío del folleto oficial',
        text: '¿Me puedes compartir el plan de estudios en PDF con las materias de la carrera?'
      },
      {
        title: 'Paso 4: Confirmación Final de Registro',
        desc: 'Aspirante confirma su inscripción para generar la ficha oficial',
        text: '¡Excelente! Estoy de acuerdo con toda la información y confirmo mi pre-registro para iniciar mi proceso.'
      }
    ]
  },
  {
    id: 'local_presencial',
    title: '🏛️ 1. Flujos Presenciales Locales (Campeche)',
    cases: [
      {
        title: 'Aspirante a Derecho (Campeche)',
        desc: 'Registro completo local escolarizado',
        text: 'Me llamo Carlos Alpuche Canul, nací el 2004-05-15 en Campeche. Soy hombre. Mi cel es 9811234567 y mi correo carlos.alpuche@gmail.com. Egresé del COBACAM plantel 01. Quiero la Licenciatura en Derecho. Vivo en Calle 12 #45 Col. Centro CP 24000 en Campeche. Me interesa modalidad Presencial.'
      },
      {
        title: 'Aspirante a Ing. Software (Campeche)',
        desc: 'Pregunta por materias y se inscribe presencial',
        text: '¡Hola! Soy Rodrigo Pech Uc, nací el 2004-09-12 en Campeche. Hombre. Mi celular es 9818819922 y mi correo rodrigo.pech@gmail.com. Egresé del CETIS 20. Quiero estudiar Ingeniería en Software y Sistemas Computacionales de forma Presencial en Campus Campeche. Vivo en Calle 49 #18 Col. San Román, CP 24040 en Campeche.'
      },
      {
        title: 'Aspirante a Mercadotecnia y Publicidad',
        desc: 'Interés en turno matutino y plan cuatrimestral',
        text: 'Hola Uriel, me llamo Sofia Escalante Ruiz, nací en Campeche el 2005-01-20. Mujer. Mi cel es 9811029384, correo sofia.escalante@gmail.com. Vengo del Colegio Cumbres Campeche. Deseo estudiar Mercadotecnia y Publicidad en modalidad Presencial en Campus Campeche. Vivo en Av. Resurgimiento 301, CP 24030.'
      }
    ]
  },
  {
    id: 'foraneos_online',
    title: '🌐 2. Aspirantes Foráneos (Licenciaturas Online)',
    cases: [
      {
        title: 'Aspirante de Tabasco (Diseño Gráfico Online)',
        desc: 'Reconoce foráneo y ofrece plataforma virtual',
        text: 'Hola Metal-Uriel, me llamo Valeria Méndez Cruz, nací en Tabasco el 2003-11-20. Soy mujer. Celular 9931238899, correo valeria.mendez@outlook.com. Salí del CBTIS 32 de Villahermosa. Vivo en Calle Juárez 302, CP 86000 en Villahermosa Tabasco. Quiero estudiar Diseño Gráfico Digital.'
      },
      {
        title: 'Aspirante de Yucatán (Psicología Online)',
        desc: 'Foráneo en Mérida interesado en Recursos Humanos',
        text: 'Hola, soy Roberto Gómez Pech, nací en Mérida Yucatán el 2004-02-10. Hombre. Mi cel es 9992345678, correo roberto.gomez@gmail.com. Salí de la Prepa 8 de Mérida. Vivo en Calle 60 #102 CP 97050 en Mérida. Me interesa la Licenciatura en Psicología Organizacional en modalidad Online.'
      },
      {
        title: 'Confirmación de Modalidad Online',
        desc: 'Acepta estudiar a distancia sin mudarse',
        text: '¡Excelente! Me parece perfecto cursar la carrera 100% en línea a través de la plataforma virtual sin necesidad de mudarme a Campeche. ¡Por favor registra mi ficha oficial!'
      }
    ]
  },
  {
    id: 'ejecutivas_dual',
    title: '👔 3. Modalidad Ejecutiva & Plan Dual (Trabajadores)',
    cases: [
      {
        title: 'Aspirante a Derecho Ejecutivo (Trabajador)',
        desc: 'Requiere horarios en sábados y validez SEP',
        text: 'Hola, trabajo de lunes a viernes y me interesa terminar mi carrera. Me llamo Manuel Tun Cocom, nací en Campeche el 1998-07-14. Celular 9811447788, correo manuel.tun@empresa.com. Salí del CONALEP Campeche. Vivo en Calle 10 #88 Col. Miramar CP 24020. Quiero la Licenciatura en Derecho Modalidad Ejecutiva.'
      },
      {
        title: 'Aspirante a Plan Dual en Administración',
        desc: 'Desea estudiar y trabajar con empresa aliada',
        text: 'Buenas tardes, quiero informes de la Licenciatura Dual en Administración y Dirección Empresarial para aprender directo en una empresa. Me llamo Andrea Baeza Kantun, nací el 2003-03-25 en Campeche. Cel 9817765544, correo andrea.baeza@gmail.com, Prepa CETIS 20, CP 24000 Campeche.'
      }
    ]
  },
  {
    id: 'pdf_brochures',
    title: '📄 4. Petición de Planes de Estudio y Costos (PDFs)',
    cases: [
      {
        title: 'Solicitud PDF: Ingeniería en Software',
        desc: 'Dispara envío de folleto de Sistemas',
        text: '¡Hola! Me interesa mucho la Ingeniería en Software y Sistemas Computacionales. ¿Me podrías enviar el plan de estudios oficial en PDF con las materias cuatrimestrales?'
      },
      {
        title: 'Solicitud PDF: Becas y Financiamiento',
        desc: 'Dispara folleto de becas UNID 2026',
        text: '¿Tienen opciones de becas por promedio o convenios empresariales? ¿Me mandas la información de costos y financiamiento en PDF?'
      },
      {
        title: 'Solicitud PDF: Arquitectura de Interiores',
        desc: 'Dispara folleto de Arquitectura',
        text: 'Hola Uriel, ¿cuentas con el folleto digital y RVOE de la Licenciatura en Arquitectura de Interiores?'
      }
    ]
  },
  {
    id: 'anti_hallucination',
    title: '🚫 5. Pruebas Anti-Alucinación (Carreras No Disponibles)',
    cases: [
      {
        title: 'Pide "Medicina General / Cirujano"',
        desc: 'El bot debe aclarar que no existe y sugerir afines',
        text: 'Hola Metal-Uriel, me gustaría estudiar Médico Cirujano o Medicina General en el campus. ¿Tienen esa carrera disponible y qué requisitos piden?'
      },
      {
        title: 'Pide "Ingeniería Aeroespacial o Mecatrónica"',
        desc: 'Debe aclarar y sugerir Ing. en Software y Sistemas',
        text: 'Quiero inscribirme a Ingeniería Aeroespacial o Robótica Avanzada. ¿La tienen en Campeche?'
      },
      {
        title: 'Pide "Licenciatura en Gastronomía"',
        desc: 'Debe sugerir Administración Turística o Mercadotecnia',
        text: 'Hola, me encanta la cocina y quiero estudiar Gastronomía y Artes Culinarias en la UNID. ¿Tienen esa carrera?'
      }
    ]
  },
  {
    id: 'edge_cases',
    title: '🔄 6. Corrección de Datos y Casos Límite',
    cases: [
      {
        title: 'Corrección de Teléfono y Correo',
        desc: 'Actualiza datos a mitad de conversación',
        text: 'Oye Uriel, me equivoqué en mi teléfono anterior. Mi número correcto es 9811998877 y mi nuevo correo es contacto.oficial@gmail.com, por favor actualízalos en mi registro.'
      },
      {
        title: 'Pregunta por Validez Oficial RVOE',
        desc: 'Verifica respuesta institucional de validez SEP',
        text: '¿Todos los planes de estudio de la UNID cuentan con Reconocimiento de Validez Oficial de Estudios (RVOE) emitido por la Secretaría de Educación Pública (SEP)?'
      }
    ]
  }
];

// Formateador de tiempo relativo para el Kanban y Chats
function formatTimeAgo(dateStr) {
  if (!dateStr) return 'Reciente';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Reciente';
  
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  
  if (diffSec < 60) return 'Ahora';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  if (diffSec < 172800) return 'Ayer';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function App() {
  // ================= ESTADOS PRINCIPALES =================
  const [activeTab, setActiveTab] = useState('inbox'); // 'inbox' (default) | 'kanban' | 'analytics' | 'brochures' | 'database' | 'inspector' | 'prompt' | 'tenant_config' | 'onboarding'
  
  // Estado de Conversaciones y Bandeja de Entrada en Vivo
  const [conversations, setConversations] = useState([]);
  const [selectedChatPhone, setSelectedChatPhone] = useState(null);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatFilterTab, setChatFilterTab] = useState('all'); // 'all' | 'nuevo' | 'contactado' | 'inscrito' | 'paused'
  const [isAdvisorMode, setIsAdvisorMode] = useState(true); // true = Enviar como Asesor Humano a WhatsApp | false = Simular Aspirante
  const [showFichaDrawer, setShowFichaDrawer] = useState(false);
  const [showBrochurePicker, setShowBrochurePicker] = useState(false);

  // Estados del Chat Activo
  const [phone, setPhone] = useState('+529811581001');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Datos de Aspirantes (MariaDB)
  const [aspirantes, setAspirantes] = useState([]);
  const [lastCompletedLead, setLastCompletedLead] = useState(null);
  const [liveExtractedFields, setLiveExtractedFields] = useState({});
  const [selectedLead, setSelectedLead] = useState(null);

  // Selector Multi-Campus Nacional UNID
  const [campusesList, setCampusesList] = useState(DEFAULT_CAMPUSES);
  const [selectedCampus, setSelectedCampus] = useState(() => {
    return localStorage.getItem('metal_uriel_campus') || 'campeche';
  });

  // Vista de Archivados en Kanban
  const [showArchiveView, setShowArchiveView] = useState(false);

  // Modal Flotante del Laboratorio de Pruebas
  const [showTestSuiteModal, setShowTestSuiteModal] = useState(false);
  const [selectedTestCategory, setSelectedTestCategory] = useState('caso_real_elvira');

  // Catálogo Oficial de Folletos & Planes de Estudio
  const [brochures, setBrochures] = useState([]);
  const [brochureFilter, setBrochureFilter] = useState('all');
  const [brochureSearch, setBrochureSearch] = useState('');

  // Selector de Modelos y Fallback Multi-Proveedor
  const [modelsList, setModelsList] = useState([]);
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('metal_uriel_model') || 'auto-fallback';
  });

  // Estados de Salud y Semáforo
  const [healthFull, setHealthFull] = useState(null);
  const [showHealthModal, setShowHealthModal] = useState(false);

  // Estados de Autenticación JWT y Office 365
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('metal_uriel_jwt') || null);
  const [authUser, setAuthUser] = useState(() => {
    const saved = localStorage.getItem('metal_uriel_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [showLoginModal, setShowLoginModal] = useState(() => !localStorage.getItem('metal_uriel_jwt'));
  const [authTab, setAuthTab] = useState('o365');
  const [o365Email, setO365Email] = useState('00774343@red.unid.mx');
  const [o365Name, setO365Name] = useState('Luis Felipe Pérez (Admin Sistemas)');
  const [loginForm, setLoginForm] = useState({ username: '00774343@red.unid.mx', password: 'admin', error: '', loading: false });

  // Banda Sonora Cibernética de Metal Sonic
  const [isPlayingBgm, setIsPlayingBgm] = useState(false);
  const [isMutedBgm, setIsMutedBgm] = useState(false);

  // Estados de Analytics
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Visor de MariaDB
  const [dbSearch, setDbSearch] = useState('');
  const [dbFilter, setDbFilter] = useState('all');

  // Editor de Prompt
  const [customPrompt, setCustomPrompt] = useState('');
  const [promptPresets, setPromptPresets] = useState([]);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptSavedNotification, setPromptSavedNotification] = useState(false);

  // SaaS Multi-Tenant & Configuración de Sedes
  const [tenantsList, setTenantsList] = useState([]);
  const [selectedTenantSlug, setSelectedTenantSlug] = useState('campeche');
  const [tenantForm, setTenantForm] = useState({
    whatsapp_phone_number_id: '',
    whatsapp_token: '',
    maskedWhatsAppToken: '',
    hasWhatsAppToken: false,
    meta_verify_token: 'unid_meta_verify_token_2026',
    email_notificaciones: '',
    custom_prompt: '',
    gemini_key: '',
    hasGeminiKey: false,
    openai_key: '',
    hasOpenAiKey: false,
    activa: true
  });
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantSaving, setTenantSaving] = useState(false);
  const [tenantSaveSuccess, setTenantSaveSuccess] = useState(false);
  const [tenantTesting, setTenantTesting] = useState(false);
  const [tenantTestResult, setTenantTestResult] = useState(null);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [faqOpenIndex, setFaqOpenIndex] = useState(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Estados para el CRUD de Usuarios RBAC (Exclusivo Desarrollador / Superadmin)
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userForm, setUserForm] = useState({
    correo_institucional: '',
    nombre_completo: '',
    matricula: '',
    password: '',
    rol: 'usuario',
    sede_id: 'campeche',
    activo: true
  });
  const [userFormMsg, setUserFormMsg] = useState({ text: '', type: '' });
  const [emailLogs, setEmailLogs] = useState([]);
  const [emailTesting, setEmailTesting] = useState(false);

  // Estados de Configuración SMTP en Vivo (Gmail App Password)
  const [smtpInfo, setSmtpInfo] = useState({ mode: 'ethereal_test', hasPass: false, maskedPass: '', user: 'Luisquintero2001@gmail.com' });
  const [smtpForm, setSmtpForm] = useState({
    host: 'smtp.gmail.com',
    port: '587',
    user: 'Luisquintero2001@gmail.com',
    pass: ''
  });
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpMsg, setSmtpMsg] = useState({ text: '', type: '' });

  // Estados del Pool Multimedia (Planes, Oferta, Horarios, Instalaciones) y Categorías CRUD
  const [ciclosList, setCiclosList] = useState([]);
  const [activeCiclo, setActiveCiclo] = useState('2026-3 Septiembre');
  const [newCicloInput, setNewCicloInput] = useState('');
  const [selectedCicloFilter, setSelectedCicloFilter] = useState('all');
  const [poolCategoryFilter, setPoolCategoryFilter] = useState('all');
  const [showPoolModal, setShowPoolModal] = useState(false);
  const [editingPoolId, setEditingPoolId] = useState(null);
  const [poolSaving, setPoolSaving] = useState(false);
  const [poolMsg, setPoolMsg] = useState({ type: '', text: '' });
  const [poolForm, setPoolForm] = useState({
    titulo: '',
    categoria: 'plan_estudios',
    ciclo_escolar: '2026-3 Septiembre',
    modalidad: 'Presencial',
    duracion: '3 años (9 cuatrimestres)',
    rvoe: 'SEP-RVOE-OFICIAL',
    descripcion_ia: '',
    tags: '',
    url_recurso: '',
    tipo_archivo: 'pdf',
    fileName: '',
    fileData: ''
  });

  // Estados CRUD de Categorías del Pool Multimedia
  const [poolCategories, setPoolCategories] = useState([
    { id: 1, slug: 'plan_estudios', nombre: 'Planes de Estudio', icono: '📚', color: 'amber', descripcion: 'Mapas curriculares y planes de estudio oficiales con RVOE SEP' },
    { id: 2, slug: 'oferta_educativa', nombre: 'Oferta Educativa', icono: '🎓', color: 'purple', descripcion: 'Catálogos generales de licenciaturas, maestrías y modalidades' },
    { id: 3, slug: 'horarios', nombre: 'Horarios de Clase', icono: '🕒', color: 'emerald', descripcion: 'Horarios de clase por turno y periodo cuatrimestral' },
    { id: 4, slug: 'instalaciones', nombre: 'Fotos e Instalaciones', icono: '🏛️', color: 'sky', descripcion: 'Fotografías del campus, laboratorios, cabinas y áreas comunes' },
    { id: 5, slug: 'becas_costos', nombre: 'Becas y Costos', icono: '💰', color: 'rose', descripcion: 'Tabuladores de colegiaturas, inscripciones, promociones y becas' }
  ]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryMsg, setCategoryMsg] = useState({ type: '', text: '' });
  const [categoryForm, setCategoryForm] = useState({
    nombre: '',
    icono: '📁',
    color: 'amber',
    descripcion: ''
  });

  // Helper de cabeceras autenticadas con JWT
  const getAuthHeaders = (extra = {}) => {
    const token = authToken || localStorage.getItem('metal_uriel_jwt');
    const headers = { ...extra };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const careerChartRef = useRef(null);
  const originChartRef = useRef(null);
  const statusChartRef = useRef(null);
  const chartInstances = useRef({});

  // ================= CARGA INICIAL Y POLLING EN VIVO =================
  useEffect(() => {
    fetchHealthFull();
    loadCampuses();
    loadModels();
    loadCiclos();
    loadAspirantes();
    loadConversations();
    loadPromptData();
    loadAnalytics();
    loadPoolCategories();
    loadBrochures();
    loadTenants();
    loadTenantDetails('campeche');
    loadUsers();
    loadEmailHistory();
    loadSmtpSettings();

    // Polling en vivo para sincronización de WhatsApp en tiempo real (cada 3.5 segundos)
    const liveInterval = setInterval(() => {
      loadConversations(true);
      loadAspirantes(true);
    }, 3500);

    const healthInterval = setInterval(fetchHealthFull, 12000);
    return () => {
      clearInterval(liveInterval);
      clearInterval(healthInterval);
    };
  }, []);

  // Auto-scroll en el chat
  useEffect(() => {
    if (autoScroll && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, autoScroll, selectedChatPhone]);

  // Actualizar iconos Lucide
  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });

  // Gráficas con Chart.js
  useEffect(() => {
    if (activeTab === 'analytics' && analyticsData && window.Chart) {
      Object.values(chartInstances.current).forEach(c => c && c.destroy && c.destroy());
      chartInstances.current = {};

      if (careerChartRef.current) {
        const careers = (analyticsData.byCareer || []).filter(c => c.count > 0);
        const labels = careers.map(c => c.career.length > 26 ? c.career.substring(0, 26) + '...' : c.career);
        const data = careers.map(c => c.count);

        chartInstances.current.careers = new window.Chart(careerChartRef.current, {
          type: 'bar',
          data: {
            labels: labels.length ? labels : ['Sin datos registrados'],
            datasets: [{
              label: 'Prospectos Interesados',
              data: data.length ? data : [0],
              backgroundColor: '#FFC72C',
              borderColor: '#F59E0B',
              borderWidth: 1.5,
              borderRadius: 6
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: 'rgba(51, 65, 85, 0.3)' } },
              y: { ticks: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } }, grid: { display: false } }
            }
          }
        });
      }

      if (originChartRef.current) {
        chartInstances.current.origin = new window.Chart(originChartRef.current, {
          type: 'doughnut',
          data: {
            labels: ['Locales (Presencial)', 'Foráneos (Online Nacional)'],
            datasets: [{
              data: [analyticsData.locales || 0, analyticsData.foraneos || 0],
              backgroundColor: ['#10B981', '#38BDF8'],
              borderColor: '#0F172A',
              borderWidth: 3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: '#cbd5e1', boxWidth: 12, padding: 12, font: { size: 11 } }
              }
            },
            cutout: '68%'
          }
        });
      }

      if (statusChartRef.current) {
        const s = analyticsData.byStatus || {};
        chartInstances.current.status = new window.Chart(statusChartRef.current, {
          type: 'bar',
          data: {
            labels: ['Nuevos', 'Contactados', 'En Proceso', 'Inscritos', 'No Interesado'],
            datasets: [{
              label: 'Prospectos Activos',
              data: [s.nuevo || 0, s.contactado || 0, s.en_proceso || 0, s.inscrito || 0, s.no_interesado || 0],
              backgroundColor: ['#38BDF8', '#FFC72C', '#A855F7', '#10B981', '#64748B'],
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } }, grid: { display: false } },
              y: { ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: 'rgba(51, 65, 85, 0.3)' } }
            }
          }
        });
      }
    }
    return () => {
      Object.values(chartInstances.current).forEach(c => c && c.destroy && c.destroy());
    };
  }, [activeTab, analyticsData]);

  // ================= MÉTODOS DE BANDEJA Y API =================
  const loadConversations = async (silent = false) => {
    try {
      const campusQuery = selectedCampus ? `?campus=${encodeURIComponent(selectedCampus)}` : '';
      const res = await fetch(`/api/conversations${campusQuery}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.conversations)) {
        setConversations(data.conversations);
        
        // Si no hay seleccionado o es la primera carga, seleccionar la primera
        if (!selectedChatPhone && data.conversations.length > 0) {
          const first = data.conversations[0];
          setSelectedChatPhone(first.cleanPhone || first.phone);
          setPhone(first.phone);
          setMessages(first.messages || []);
          if (first.leadData) setLiveExtractedFields(first.leadData);
        } else if (selectedChatPhone) {
          // Sincronizar mensajes del chat actual
          const current = data.conversations.find(c => (c.cleanPhone || c.phone) === selectedChatPhone);
          if (current && current.messages) {
            setMessages(current.messages);
            if (current.leadData) setLiveExtractedFields(current.leadData);
          }
        }
      }
    } catch (e) {
      if (!silent) console.error('Error cargando conversaciones:', e);
    }
  };

  const handleSelectConversation = (conv) => {
    const cleanId = conv.cleanPhone || conv.phone;
    setSelectedChatPhone(cleanId);
    setPhone(conv.phone);
    setMessages(conv.messages || []);
    if (conv.leadData) {
      setLiveExtractedFields(conv.leadData);
    }
    if (inputRef.current) inputRef.current.focus();
  };

  const handleToggleAiPause = async (targetPhone, currentPaused) => {
    const nextPaused = !currentPaused;
    try {
      const res = await fetch('/api/conversations/toggle-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: targetPhone, isPaused: nextPaused })
      });
      const data = await res.json();
      if (data.success) {
        setConversations(prev => prev.map(c => {
          if ((c.cleanPhone || c.phone) === (targetPhone.replace(/[\s\-\+]/g, '') || targetPhone)) {
            return { ...c, isPaused: nextPaused };
          }
          return c;
        }));
      }
    } catch (e) {
      alert('Error cambiando estado de IA: ' + e.message);
    }
  };

  const handleSendBrochureQuick = async (brochureId) => {
    if (!phone) return;
    try {
      setShowBrochurePicker(false);
      const res = await fetch('/api/conversations/send-brochure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, brochureId })
      });
      const data = await res.json();
      if (data.success) {
        loadConversations();
      }
    } catch (e) {
      alert('Error enviando folleto: ' + e.message);
    }
  };

  const fetchHealthFull = async () => {
    try {
      const res = await fetch('/api/health/full');
      const data = await res.json();
      setHealthFull(data);
    } catch (e) {
      setHealthFull({ overall: 'offline', error: e.message });
    }
  };

  const loadCampuses = async () => {
    try {
      const res = await fetch('/api/campuses');
      const data = await res.json();
      if (data.campuses && data.campuses.length > 0) {
        setCampusesList([{ id: 'all', name: 'Todas las Sedes UNID (Nacional)' }, ...data.campuses]);
      }
    } catch (e) {
      console.warn('Usando catálogo default de campus:', e.message);
    }
  };

  const handleChangeCampus = (campusId) => {
    setSelectedCampus(campusId);
    localStorage.setItem('metal_uriel_campus', campusId);
  };

  const loadModels = async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      if (data.models) {
        setModelsList(data.models);
        const exists = data.models.some(m => m.id === selectedModel);
        if (!exists) {
          setSelectedModel('auto-fallback');
          localStorage.setItem('metal_uriel_model', 'auto-fallback');
        }
      }
    } catch (e) {
      console.error('Error cargando modelos:', e);
    }
  };

  const loadCiclos = async () => {
    try {
      const res = await fetch('/api/ciclos', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        if (data.activeCiclo) setActiveCiclo(data.activeCiclo);
        if (Array.isArray(data.ciclos)) setCiclosList(data.ciclos);
      }
    } catch (e) {
      console.error('Error cargando ciclos escolares:', e);
    }
  };

  const handleSetActiveCiclo = async (targetCiclo) => {
    const clean = (targetCiclo || '').trim();
    if (!clean) return;
    try {
      const res = await fetch('/api/ciclos', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ciclo_escolar: clean, sede_id: selectedCampus })
      });
      const data = await res.json();
      if (data.success) {
        setActiveCiclo(data.activeCiclo || clean);
        if (Array.isArray(data.ciclos)) setCiclosList(data.ciclos);
        setNewCicloInput('');
      }
    } catch (e) {
      alert('Error cambiando ciclo escolar activo: ' + e.message);
    }
  };

  const loadPoolCategories = async () => {
    try {
      const res = await fetch('/api/pool/categories', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && Array.isArray(data.categories) && data.categories.length > 0) {
        setPoolCategories(data.categories);
      }
    } catch (e) {
      console.error('Error cargando categorías del Pool:', e);
    }
  };

  const handleSaveCategory = async (e) => {
    if (e) e.preventDefault();
    if (!categoryForm.nombre.trim()) {
      setCategoryMsg({ type: 'error', text: 'El nombre de la categoría es obligatorio.' });
      return;
    }
    setCategorySaving(true);
    setCategoryMsg({ type: '', text: '' });
    try {
      const url = editingCategoryId ? `/api/pool/categories/${editingCategoryId}` : '/api/pool/categories';
      const method = editingCategoryId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(categoryForm)
      });
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.categories)) {
          setPoolCategories(data.categories);
        } else {
          await loadPoolCategories();
        }
        setCategoryMsg({
          type: 'success',
          text: editingCategoryId ? '✅ Categoría actualizada correctamente.' : '✅ Nueva categoría creada en el Pool.'
        });
        setEditingCategoryId(null);
        setCategoryForm({ nombre: '', icono: '📁', color: 'amber', descripcion: '' });
        loadBrochures();
      } else {
        setCategoryMsg({ type: 'error', text: '❌ ' + (data.error || 'No se pudo guardar la categoría.') });
      }
    } catch (err) {
      setCategoryMsg({ type: 'error', text: '❌ Error de red: ' + err.message });
    } finally {
      setCategorySaving(false);
    }
  };

  const handleEditCategory = (cat) => {
    setEditingCategoryId(cat.id || cat.slug);
    setCategoryForm({
      nombre: cat.nombre || '',
      icono: cat.icono || '📁',
      color: cat.color || 'amber',
      descripcion: cat.descripcion || ''
    });
    setCategoryMsg({ type: '', text: '' });
    setShowCategoryModal(true);
  };

  const handleDeleteCategory = async (cat) => {
    const idOrSlug = cat.id || cat.slug;
    if (!confirm(`¿Seguro que deseas eliminar la categoría "${cat.nombre}"? Los recursos asociados se moverán automáticamente a otra categoría para no perderse.`)) return;
    try {
      const res = await fetch(`/api/pool/categories/${encodeURIComponent(idOrSlug)}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.categories)) {
          setPoolCategories(data.categories);
        } else {
          await loadPoolCategories();
        }
        if (poolCategoryFilter === cat.slug) {
          setPoolCategoryFilter('all');
        }
        setCategoryMsg({ type: 'success', text: `🗑️ Categoría "${cat.nombre}" eliminada.` });
        loadBrochures();
      } else {
        alert('No se pudo eliminar la categoría: ' + (data.error || 'Error'));
      }
    } catch (err) {
      alert('Error eliminando categoría: ' + err.message);
    }
  };

  const loadBrochures = async () => {
    try {
      const res = await fetch('/api/pool', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.items || data.brochures) {
        setBrochures(data.items || data.brochures);
      }
    } catch (e) {
      console.error('Error cargando Pool Multimedia:', e);
    }
  };

  const handlePoolFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setPoolMsg({ type: 'error', text: '❌ El archivo supera los 20 MB permitidos.' });
      return;
    }
    const isImg = file.type.startsWith('image/');
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPoolForm(prev => ({
        ...prev,
        fileName: file.name,
        fileData: ev.target.result,
        tipo_archivo: isImg ? 'imagen' : 'pdf',
        titulo: prev.titulo || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
      }));
      setPoolMsg({ type: 'success', text: `📎 Archivo cargado desde tu equipo: ${file.name}` });
    };
    reader.readAsDataURL(file);
  };

  const handleSavePoolItem = async (e) => {
    if (e) e.preventDefault();
    if (!poolForm.titulo || !poolForm.titulo.trim()) {
      setPoolMsg({ type: 'error', text: '❌ El título del recurso o carrera es obligatorio.' });
      return;
    }
    setPoolSaving(true);
    setPoolMsg({ type: '', text: '' });
    try {
      const targetId = editingPoolId ? encodeURIComponent(editingPoolId) : '';
      const url = editingPoolId ? `/api/pool/${targetId}` : '/api/pool';
      const method = editingPoolId ? 'PUT' : 'POST';
      const payload = {
        ...poolForm,
        carrera: poolForm.titulo.trim(),
        titulo: poolForm.titulo.trim(),
        ciclo_escolar: poolForm.ciclo_escolar || activeCiclo || '2026-3 Septiembre',
        sede_id: selectedCampus === 'all' ? 'campeche' : selectedCampus
      };
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setShowPoolModal(false);
        setEditingPoolId(null);
        setPoolMsg({ type: '', text: '' });
        setPoolForm({
          titulo: '',
          categoria: poolCategories[0]?.slug || 'plan_estudios',
          ciclo_escolar: activeCiclo || '2026-3 Septiembre',
          modalidad: 'Presencial',
          duracion: '3 años (9 cuatrimestres)',
          rvoe: 'SEP-RVOE-OFICIAL',
          descripcion_ia: '',
          tags: '',
          url_recurso: '',
          tipo_archivo: 'pdf',
          fileName: '',
          fileData: ''
        });
        await loadBrochures();
      } else {
        setPoolMsg({ type: 'error', text: '❌ Error guardando recurso: ' + (data.error || 'Error desconocido') });
      }
    } catch (err) {
      setPoolMsg({ type: 'error', text: '❌ Error de conexión: ' + err.message });
    } finally {
      setPoolSaving(false);
    }
  };

  const handleEditPoolItem = (b) => {
    const itemId = b.codigo_recurso || b.id || b.db_id;
    setEditingPoolId(itemId);
    setPoolMsg({ type: '', text: '' });
    setPoolForm({
      titulo: b.titulo || b.carrera || '',
      categoria: b.categoria || 'plan_estudios',
      ciclo_escolar: b.ciclo_escolar || activeCiclo || '2026-3 Septiembre',
      modalidad: b.modalidad || 'Presencial',
      duracion: b.duracion || '3 años (9 cuatrimestres)',
      rvoe: b.rvoe || 'SEP-RVOE-OFICIAL',
      descripcion_ia: b.descripcion_ia || '',
      tags: Array.isArray(b.tags) ? b.tags.join(', ') : (b.tags || ''),
      url_recurso: b.url_recurso || b.pdfUrl || '',
      tipo_archivo: b.tipo_archivo || 'pdf',
      fileName: b.fileName || '',
      fileData: ''
    });
    setShowPoolModal(true);
  };

  const handleDeletePoolItem = async (itemOrId, maybeTitle) => {
    const id = typeof itemOrId === 'object' && itemOrId !== null
      ? (itemOrId.codigo_recurso || itemOrId.id || itemOrId.db_id)
      : itemOrId;
    const title = typeof itemOrId === 'object' && itemOrId !== null
      ? (itemOrId.titulo || itemOrId.carrera || id)
      : (maybeTitle || id);
    if (!id) return;
    if (!confirm(`¿Seguro que deseas eliminar "${title}" del Pool Multimedia?`)) return;
    try {
      const res = await fetch(`/api/pool/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        await loadBrochures();
      } else {
        alert('No se pudo eliminar: ' + (data.error || 'Error'));
      }
    } catch (err) {
      alert('Error eliminando recurso: ' + err.message);
    }
  };

  const handleChangeModel = async (modelId) => {
    setSelectedModel(modelId);
    localStorage.setItem('metal_uriel_model', modelId);
    try {
      await fetch('/api/models/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId })
      });
      fetchHealthFull();
      loadModels();
    } catch (e) {
      console.error('Error actualizando modelo:', e);
    }
  };

  const loadAspirantes = async (silent = false) => {
    try {
      const campusQuery = selectedCampus ? `?campus=${encodeURIComponent(selectedCampus)}` : '';
      const res = await fetch(`/api/aspirantes${campusQuery}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setAspirantes(data.data || []);
      }
    } catch (e) {
      if (!silent) console.error('Error cargando aspirantes:', e);
    }
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();
      if (data.success) {
        setAnalyticsData(data);
      }
    } catch (e) {
      console.error('Error cargando analytics:', e);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadPromptData = async () => {
    try {
      const res = await fetch('/api/prompt');
      const data = await res.json();
      if (data.prompt) setCustomPrompt(data.prompt);
      if (data.presets) setPromptPresets(data.presets);
    } catch (e) {
      console.error('Error cargando prompt:', e);
    }
  };

  const handleSeedDemo = async () => {
    if (!confirm('🌱 ¿Deseas poblar la base de datos con 5 prospectos institucionales de demostración?')) return;
    try {
      const res = await fetch('/api/aspirantes/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await loadAspirantes();
        await loadConversations();
        await loadAnalytics();
        alert('🌱 Base de datos poblada exitosamente con 5 prospectos demo.');
      }
    } catch (e) {
      alert('Error cargando demo: ' + e.message);
    }
  };

  const handleTruncateDb = async () => {
    if (!confirm('🗑️ ¿Estás seguro de VACIAR por completo la base de datos (aspirantes + historial de chats) y limpiar toda la memoria caché para testing desde cero?')) return;
    try {
      const res = await fetch('/api/aspirantes/all', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setAspirantes([]);
        setConversations([]);
        setMessages([]);
        setSelectedChatPhone(null);
        setSelectedLead(null);
        setLastCompletedLead(null);
        setLiveExtractedFields({});
        await loadAnalytics();
        alert('🗑️ Base de datos (aspirantes + historial) y memoria caché vaciadas al 100%. Lista para testing desde cero.');
      } else {
        alert('Error al vaciar base de datos: ' + (data.error || 'Error desconocido'));
      }
    } catch (err) {
      alert('Error de conexión al vaciar DB: ' + err.message);
    }
  };

  const handleUpdateStatus = async (aspiranteId, nuevoEstado) => {
    try {
      const res = await fetch(`/api/aspirantes/${aspiranteId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ estado: nuevoEstado })
      });
      const data = await res.json();
      if (data.success) {
        loadAspirantes();
        loadConversations();
        loadAnalytics();
        loadEmailHistory();
      }
    } catch (e) {
      console.error('Error actualizando estado:', e);
    }
  };

  // ================= MÉTODOS CRUD DE USUARIOS RBAC Y NOTIFICACIONES =================
  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/users', { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setUsersList(data.users || []);
      }
    } catch (e) {
      console.error('Error cargando usuarios RBAC:', e);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadEmailHistory = async () => {
    try {
      const res = await fetch('/api/notifications/history', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        setEmailLogs(data.history || []);
      }
    } catch (e) {
      console.error('Error cargando bitácora de correos:', e);
    }
  };

  const loadSmtpSettings = async () => {
    try {
      const res = await fetch('/api/settings/smtp', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.smtp) {
        setSmtpInfo(data.smtp);
        setSmtpForm(prev => ({
          ...prev,
          host: data.smtp.host || 'smtp.gmail.com',
          port: data.smtp.port || '587',
          user: data.smtp.user || 'Luisquintero2001@gmail.com'
        }));
      }
    } catch (e) {
      console.error('Error cargando estado SMTP:', e);
    }
  };

  const handleSaveSmtpSettings = async (e) => {
    if (e) e.preventDefault();
    setSmtpSaving(true);
    setSmtpMsg({ text: '', type: '' });
    try {
      const res = await fetch('/api/settings/smtp', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(smtpForm)
      });
      const data = await res.json();
      if (data.success) {
        setSmtpMsg({ text: '✅ ' + data.message, type: 'success' });
        setSmtpForm(prev => ({ ...prev, pass: '' }));
        loadSmtpSettings();
      } else {
        setSmtpMsg({ text: '❌ ' + (data.error || 'Error guardando SMTP'), type: 'error' });
      }
    } catch (err) {
      setSmtpMsg({ text: '❌ Error de conexión: ' + err.message, type: 'error' });
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleTestEmailTrigger = async (evento) => {
    setEmailTesting(true);
    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ evento })
      });
      const data = await res.json();
      if (data.success) {
        loadEmailHistory();
      } else {
        alert('Error en prueba de correo: ' + (data.error || 'Error'));
      }
    } catch (e) {
      alert('Error disparando correo: ' + e.message);
    } finally {
      setEmailTesting(false);
    }
  };

  const handleSaveUser = async (e) => {
    if (e) e.preventDefault();
    setUserFormMsg({ text: '', type: '' });
    try {
      const url = editingUserId ? `/api/users/${editingUserId}` : '/api/users';
      const method = editingUserId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(userForm)
      });
      const data = await res.json();
      if (data.success) {
        setUserFormMsg({ text: editingUserId ? '✅ Usuario actualizado con éxito.' : '✅ Nuevo usuario creado exitosamente.', type: 'success' });
        setEditingUserId(null);
        setUserForm({
          correo_institucional: '',
          nombre_completo: '',
          matricula: '',
          password: '',
          rol: 'usuario',
          sede_id: 'campeche',
          activo: true
        });
        loadUsers();
      } else {
        setUserFormMsg({ text: '❌ ' + (data.error || 'Error guardando usuario'), type: 'error' });
      }
    } catch (err) {
      setUserFormMsg({ text: '❌ Error de red: ' + err.message, type: 'error' });
    }
  };

  const handleEditUserClick = (u) => {
    setEditingUserId(u.id);
    setUserForm({
      correo_institucional: u.correo_institucional || '',
      nombre_completo: u.nombre_completo || '',
      matricula: u.matricula || '',
      password: '',
      rol: u.rol || 'usuario',
      sede_id: u.sede_id || 'campeche',
      activo: Boolean(u.activo)
    });
    setUserFormMsg({ text: '', type: '' });
  };

  const handleDeleteUserClick = async (id) => {
    if (!confirm('¿Estás seguro de eliminar permanentemente esta cuenta de usuario?')) return;
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        loadUsers();
      } else {
        alert(data.error || 'No se pudo eliminar');
      }
    } catch (err) {
      alert('Error eliminando usuario: ' + err.message);
    }
  };

  const handleToggleArchive = async (aspiranteId, currentArchived) => {
    try {
      const res = await fetch(`/api/aspirantes/${aspiranteId}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivado: !currentArchived })
      });
      const data = await res.json();
      if (data.success) {
        loadAspirantes();
        loadConversations();
        loadAnalytics();
      }
    } catch (e) {
      console.error('Error alternando archivado:', e);
    }
  };

  const handleDeleteLead = async (aspiranteId) => {
    if (!confirm('¿Eliminar permanentemente a este prospecto de MariaDB?')) return;
    try {
      const res = await fetch(`/api/aspirantes/${aspiranteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        loadAspirantes();
        loadConversations();
        loadAnalytics();
        if (selectedLead && selectedLead.id === aspiranteId) setSelectedLead(null);
      }
    } catch (e) {
      alert('Error eliminando prospecto: ' + e.message);
    }
  };

  // SaaS Tenants & Config
  const loadTenants = async () => {
    try {
      const res = await fetch('/api/tenants');
      const data = await res.json();
      if (data.success) setTenantsList(data.tenants || []);
    } catch (e) {
      console.error('Error cargando sedes SaaS:', e);
    }
  };

  const loadTenantDetails = async (slug) => {
    setTenantLoading(true);
    try {
      const res = await fetch(`/api/tenants/${slug}`);
      const data = await res.json();
      if (data.success && data.tenant) {
        const t = data.tenant;
        setTenantForm({
          whatsapp_phone_number_id: t.whatsapp_phone_number_id || '',
          whatsapp_token: '',
          maskedWhatsAppToken: t.whatsapp_token || '',
          hasWhatsAppToken: Boolean(t.hasWhatsAppToken),
          meta_verify_token: t.meta_verify_token || 'unid_meta_verify_token_2026',
          email_notificaciones: t.email_notificaciones || '',
          custom_prompt: t.custom_prompt || '',
          gemini_key: '',
          hasGeminiKey: Boolean(t.hasGeminiKey),
          openai_key: '',
          hasOpenAiKey: Boolean(t.hasOpenAiKey),
          activa: t.activa !== undefined ? Boolean(t.activa) : true
        });
      }
    } catch (e) {
      console.error('Error cargando detalles de sede:', e);
    } finally {
      setTenantLoading(false);
    }
  };

  const handleSaveTenant = async (e) => {
    if (e) e.preventDefault();
    setTenantSaving(true);
    setTenantSaveSuccess(false);
    try {
      const payload = {
        whatsapp_phone_number_id: tenantForm.whatsapp_phone_number_id,
        meta_verify_token: tenantForm.meta_verify_token,
        email_notificaciones: tenantForm.email_notificaciones,
        custom_prompt: tenantForm.custom_prompt,
        activa: tenantForm.activa
      };
      if (tenantForm.whatsapp_token && tenantForm.whatsapp_token.trim()) {
        payload.whatsapp_token = tenantForm.whatsapp_token.trim();
      }
      if (tenantForm.gemini_key && tenantForm.gemini_key.trim()) {
        payload.gemini_key = tenantForm.gemini_key.trim();
      }
      if (tenantForm.openai_key && tenantForm.openai_key.trim()) {
        payload.openai_key = tenantForm.openai_key.trim();
      }

      const res = await fetch(`/api/tenants/${selectedTenantSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setTenantSaveSuccess(true);
        loadTenants();
        loadTenantDetails(selectedTenantSlug);
        setTimeout(() => setTenantSaveSuccess(false), 4000);
      } else {
        alert('Error guardando configuración: ' + (data.error || 'Error desconocido'));
      }
    } catch (err) {
      alert('Error de conexión guardando sede: ' + err.message);
    } finally {
      setTenantSaving(false);
    }
  };

  const handleTestTenant = async () => {
    setTenantTesting(true);
    setTenantTestResult(null);
    try {
      const res = await fetch(`/api/tenants/${selectedTenantSlug}/test-connection`, { method: 'POST' });
      const data = await res.json();
      setTenantTestResult(data);
    } catch (e) {
      setTenantTestResult({ success: false, error: e.message });
    } finally {
      setTenantTesting(false);
    }
  };

  // Enviar mensaje en el chat
  const handleSendMessage = async (overrideText = null) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim() || isLoading) return;

    const userMessageTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const currentPhone = phone || '+529811581001';

    // Modo 1: Asesor Humano (Envía mensaje a WhatsApp real y pausa la IA)
    if (isAdvisorMode) {
      setInputText('');
      const newMsg = {
        id: Date.now(),
        sender: 'advisor',
        senderName: authUser?.displayName || 'Lic. Admisiones UNID',
        text: textToSend.trim(),
        time: userMessageTime
      };
      setMessages(prev => [...prev, newMsg]);

      try {
        await fetch('/api/conversations/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: currentPhone,
            message: textToSend.trim(),
            senderName: authUser?.displayName || 'Lic. Admisiones UNID'
          })
        });
        loadConversations();
      } catch (e) {
        console.error('Error enviando mensaje como asesor:', e);
      }
      return;
    }

    // Modo 2: Simulador de Aspirante (Prueba interactiva con el LLM)
    const newUserMsg = {
      id: Date.now(),
      sender: 'user',
      text: textToSend.trim(),
      time: userMessageTime
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: currentPhone,
          message: textToSend,
          model: selectedModel
        })
      });

      const data = await res.json();

      if (data.partialFields) {
        setLiveExtractedFields(prev => ({ ...prev, ...data.partialFields }));
      }

      if (data.completed && data.leadData) {
        setLastCompletedLead(data.leadData);
        setLiveExtractedFields(data.leadData);
        loadAspirantes();
        loadAnalytics();
      }

      const botMessage = {
        id: Date.now() + 1,
        sender: 'bot',
        text: data.reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: data.modelUsed,
        documentAttachment: data.documentAttachment ? {
          title: data.documentAttachment.title,
          caption: data.documentAttachment.descripcion_ia || `Validez Oficial SEP: ${data.documentAttachment.rvoe} (${data.documentAttachment.modalidad})`,
          fileName: data.documentAttachment.fileName,
          tipo_archivo: data.documentAttachment.tipo_archivo || 'pdf',
          categoria: data.documentAttachment.categoria || 'plan_estudios',
          url: data.documentAttachment.pdfUrl || data.documentAttachment.url_recurso || data.documentAttachment.downloadUrl
        } : null
      };

      setMessages(prev => [...prev, botMessage]);
      loadConversations();
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'bot',
          text: '⚠️ Error al conectar con el servidor: ' + err.message,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSession = async () => {
    if (!confirm('¿Deseas reiniciar la sesión de este aspirante y limpiar su memoria contextual?')) return;
    try {
      await fetch('/api/session/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      setMessages([
        {
          id: Date.now(),
          sender: 'bot',
          text: '¡Hola! 🐺 Soy Metal-Uriel, embajador y asesor inteligente de admisiones de la UNID Campus San Francisco de Campeche. ¡Estoy a tus órdenes para orientarte en tu proceso de admisión, costos, becas y planes de estudio oficiales! ¿Qué carrera te llama la atención?',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modelUsed: selectedModel
        }
      ]);
      setLiveExtractedFields({});
      setLastCompletedLead(null);
      loadConversations();
    } catch (e) {
      alert('Error reiniciando sesión: ' + e.message);
    }
  };

  const handleSavePrompt = async () => {
    setPromptSaving(true);
    setPromptSavedNotification(false);
    try {
      const res = await fetch('/api/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: customPrompt })
      });
      const data = await res.json();
      if (data.success) {
        setPromptSavedNotification(true);
        setTimeout(() => setPromptSavedNotification(false), 3500);
      }
    } catch (e) {
      alert('Error guardando prompt: ' + e.message);
    } finally {
      setPromptSaving(false);
    }
  };

  const handleApplyPreset = (preset) => {
    setCustomPrompt(preset.prompt);
  };

  // Autenticación
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginForm(prev => ({ ...prev, loading: true, error: '' }));
    try {
      const endpoint = authTab === 'o365' ? '/api/auth/o365' : '/api/auth/login';
      const body = authTab === 'o365' 
        ? { email: o365Email, password: loginForm.password, name: o365Name }
        : { username: loginForm.username, password: loginForm.password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (data.success) {
        setAuthToken(data.token);
        setAuthUser(data.user);
        localStorage.setItem('metal_uriel_jwt', data.token);
        localStorage.setItem('metal_uriel_user', JSON.stringify(data.user));
        setShowLoginModal(false);

        const userRol = (data.user.rol || data.user.role || 'usuario').toLowerCase();
        // Si tiene sede asignada y no es desarrollador, fijar su campus
        if (userRol !== 'desarrollador' && data.user.sede_id) {
          setSelectedCampus(data.user.sede_id);
          localStorage.setItem('metal_uriel_campus', data.user.sede_id);
        }
        // BGM exclusivo para Desarrollador
        if (userRol === 'desarrollador') {
          setIsPlayingBgm(true);
          loadUsers();
          loadEmailHistory();
        } else {
          setIsPlayingBgm(false);
        }
        setActiveTab('inbox');
      } else {
        setLoginForm(prev => ({ ...prev, error: data.error || 'Credenciales inválidas.' }));
      }
    } catch (err) {
      setLoginForm(prev => ({ ...prev, error: 'Error de conexión: ' + err.message }));
    } finally {
      setLoginForm(prev => ({ ...prev, loading: false }));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('metal_uriel_jwt');
    localStorage.removeItem('metal_uriel_user');
    setAuthToken(null);
    setAuthUser(null);
    setShowLoginModal(true);
  };

  // ================= FILTROS Y CONTADORES =================
  const selectedCampusName = useMemo(() => {
    const c = campusesList.find(item => item.id === selectedCampus);
    return c ? c.name : 'Campus San Francisco de Campeche';
  }, [selectedCampus, campusesList]);

  const activeLeads = useMemo(() => {
    return aspirantes.filter(a => {
      if (a.archivado) return false;
      if (selectedCicloFilter !== 'all' && (a.ciclo_escolar || '2026-3 Septiembre') !== selectedCicloFilter) return false;
      return true;
    });
  }, [aspirantes, selectedCicloFilter]);

  const archivedLeads = useMemo(() => {
    return aspirantes.filter(a => {
      if (!a.archivado) return false;
      if (selectedCicloFilter !== 'all' && (a.ciclo_escolar || '2026-3 Septiembre') !== selectedCicloFilter) return false;
      return true;
    });
  }, [aspirantes, selectedCicloFilter]);

  const activeLeadsCount = activeLeads.length;
  const archivedLeadsCount = archivedLeads.length;

  // Jerarquía de Roles RBAC (Rol 1: Desarrollador, Rol 2: Administrador, Rol 3: Usuario)
  const currentUserRole = useMemo(() => {
    const r = String(authUser?.rol || authUser?.role || 'usuario').toLowerCase();
    if (r === 'desarrollador' || r === 'superadmin') return 'desarrollador';
    if (r === 'administrador' || r === 'admin') return 'administrador';
    return 'usuario';
  }, [authUser]);

  const isDesarrollador = currentUserRole === 'desarrollador';
  const isAdministrador = currentUserRole === 'administrador';
  const isUsuario = currentUserRole === 'usuario';
  const isAdmin = isDesarrollador || isAdministrador;

  // Filtrado de la lista de conversaciones en WhatsApp Web
  const filteredConversations = useMemo(() => {
    return conversations.filter(c => {
      // Filtro por Ciclo Escolar
      if (selectedCicloFilter !== 'all' && (c.ciclo_escolar || '2026-3 Septiembre') !== selectedCicloFilter) return false;

      // Filtro por tab
      if (chatFilterTab === 'nuevo' && c.estado_prospecto !== 'nuevo') return false;
      if (chatFilterTab === 'contactado' && (c.estado_prospecto !== 'contactado' && c.estado_prospecto !== 'en_proceso')) return false;
      if (chatFilterTab === 'inscrito' && c.estado_prospecto !== 'inscrito') return false;
      if (chatFilterTab === 'paused' && !c.isPaused) return false;

      // Filtro por búsqueda
      if (chatSearchQuery.trim()) {
        const q = chatSearchQuery.toLowerCase();
        const matchName = String(c.name || '').toLowerCase().includes(q);
        const matchPhone = String(c.phone || '').toLowerCase().includes(q);
        const matchCarrera = String(c.carrera || '').toLowerCase().includes(q);
        const matchLast = String(c.lastMessage || '').toLowerCase().includes(q);
        return matchName || matchPhone || matchCarrera || matchLast;
      }
      return true;
    });
  }, [conversations, chatFilterTab, chatSearchQuery, selectedCicloFilter]);

  // Conversación seleccionada actual
  const activeConversation = useMemo(() => {
    return conversations.find(c => (c.cleanPhone || c.phone) === selectedChatPhone) || conversations[0] || null;
  }, [conversations, selectedChatPhone]);

  return (
    <div className="h-screen w-screen flex bg-[#0A1014] text-slate-100 font-sans overflow-hidden select-none">
      
      {/* ================= REPRODUCTOR DE BANDA SONORA (METAL SONIC) ================= */}
      {isPlayingBgm && (
        <div className="hidden">
          <iframe
            id="bgm-player"
            width="100"
            height="100"
            src={`https://www.youtube.com/embed/nR9BxVgma_8?start=1515&autoplay=1&loop=1&playlist=nR9BxVgma_8&enablejsapi=1${isMutedBgm ? '&mute=1' : ''}`}
            title="Metal Sonic Cyber Theme"
            allow="autoplay"
          ></iframe>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. BARRA VERTICAL DE ICONOS (ESTILO WHATSAPP WEB COMPACT ~64px)           */}
      {/* ========================================================================= */}
      <aside className="w-16 bg-[#111B21] border-r border-[#222E35] flex flex-col items-center justify-between py-3 shrink-0 z-40">
        
        {/* Top: Logo & Navegación Principal */}
        <div className="flex flex-col items-center gap-4 w-full">
          
          {/* Logo UNID Metal */}
          <div
            onClick={() => setActiveTab('inbox')}
            className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FFC72C] to-red-600 flex items-center justify-center font-black text-slate-950 shadow-md cursor-pointer hover:scale-105 transition"
            title=":UNID Centro de Mando • Metal-Uriel"
          >
            🐺
          </div>

          <div className="w-8 h-[1px] bg-[#222E35]"></div>

          {/* Botón Principal: BANDEJA DE ENTRADA WHATSAPP */}
          <button
            onClick={() => setActiveTab('inbox')}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition relative group ${
              activeTab === 'inbox'
                ? 'bg-[#00A884]/20 text-[#00A884] border border-[#00A884]/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-100 hover:bg-[#202C33]'
            }`}
            title="Bandeja de Entrada WhatsApp (Live Chats)"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {conversations.length > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-[#00A884] text-slate-950 font-black text-[9px]">
                {conversations.length}
              </span>
            )}
            <span className="absolute left-16 bg-[#111B21] text-xs px-2.5 py-1 rounded-md border border-[#222E35] text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap shadow-xl pointer-events-none z-50">
              💬 Chats en Vivo
            </span>
          </button>

          {/* Tablero Kanban (Todos los roles) */}
          <button
            onClick={() => setActiveTab('kanban')}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition relative group ${
              activeTab === 'kanban'
                ? 'bg-[#FFC72C]/20 text-[#FFC72C] border border-[#FFC72C]/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-100 hover:bg-[#202C33]'
            }`}
            title="Tablero Kanban de Admisiones"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 3v18" />
              <path d="M15 3v18" />
            </svg>
            <span className="absolute left-16 bg-[#111B21] text-xs px-2.5 py-1 rounded-md border border-[#222E35] text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap shadow-xl pointer-events-none z-50">
              📋 Tablero Kanban ({activeLeadsCount})
            </span>
          </button>

          {/* Métricas & Analytics (Todos los roles) */}
          <button
            onClick={() => setActiveTab('analytics')}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition relative group ${
              activeTab === 'analytics'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-100 hover:bg-[#202C33]'
            }`}
            title="Métricas y Analytics Ejecutivos"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="M18 17V9" />
              <path d="M13 17V5" />
              <path d="M8 17v-3" />
            </svg>
            <span className="absolute left-16 bg-[#111B21] text-xs px-2.5 py-1 rounded-md border border-[#222E35] text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap shadow-xl pointer-events-none z-50">
              📊 Métricas & Analytics
            </span>
          </button>

          {/* Pool Multimedia: Planes de Estudio, Oferta, Horarios e Instalaciones (Abierto a los 3 roles) */}
          <button
            onClick={() => setActiveTab('brochures')}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition relative group ${
              activeTab === 'brochures'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-100 hover:bg-[#202C33]'
            }`}
            title="Pool Multimedia: Planes de Estudio, Horarios e Instalaciones"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
            <span className="absolute left-16 bg-[#111B21] text-xs px-2.5 py-1 rounded-md border border-[#222E35] text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap shadow-xl pointer-events-none z-50">
              📚 Pool Multimedia & Planes ({brochures.length})
            </span>
          </button>

          {/* 11 Datos IA (Exclusivo Desarrollador) */}
          {isDesarrollador && (
            <button
              onClick={() => setActiveTab('inspector')}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition relative group ${
                activeTab === 'inspector'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-[#202C33]'
              }`}
              title="Inspector de 11 Datos IA"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 17 2 2 4-4" />
                <path d="m3 7 2 2 4-4" />
                <path d="M13 6h8" />
                <path d="M13 12h8" />
                <path d="M13 18h8" />
              </svg>
              <span className="absolute left-16 bg-[#111B21] text-xs px-2.5 py-1 rounded-md border border-[#222E35] text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap shadow-xl pointer-events-none z-50">
                🎯 11 Datos IA
              </span>
            </button>
          )}

          {/* Personalidad Bot (Desarrollador y Administrador) */}
          {(isDesarrollador || isAdministrador) && (
            <>
              <div className="w-8 h-[1px] bg-[#222E35]"></div>
              <button
                onClick={() => setActiveTab('prompt')}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition relative group ${
                  activeTab === 'prompt'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#202C33]'
                }`}
                title="Personalidad & System Prompt"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 7h-9" />
                  <path d="M14 17H5" />
                  <circle cx="17" cy="17" r="3" />
                  <circle cx="7" cy="7" r="3" />
                </svg>
                <span className="absolute left-16 bg-[#111B21] text-xs px-2.5 py-1 rounded-md border border-[#222E35] text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap shadow-xl pointer-events-none z-50">
                  🤖 Personalidad Bot
                </span>
              </button>
            </>
          )}

          {/* Herramientas Exclusivas de Desarrollador (Superadmin) */}
          {isDesarrollador && (
            <>
              {/* MariaDB */}
              <button
                onClick={() => setActiveTab('database')}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition relative group ${
                  activeTab === 'database'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#202C33]'
                }`}
                title="Gestor MariaDB (Superadmin)"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5V19A9 3 0 0 0 21 19V5" />
                  <path d="M3 12A9 3 0 0 0 21 12" />
                </svg>
                <span className="absolute left-16 bg-[#111B21] text-xs px-2.5 py-1 rounded-md border border-[#222E35] text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap shadow-xl pointer-events-none z-50">
                  🗄️ MariaDB
                </span>
              </button>

              {/* Configuración Sedes SaaS */}
              <button
                onClick={() => setActiveTab('tenant_config')}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition relative group ${
                  activeTab === 'tenant_config'
                    ? 'bg-pink-500/20 text-pink-400 border border-pink-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#202C33]'
                }`}
                title="SaaS Sedes & WhatsApp Cloud API (Superadmin)"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                  <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                  <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
                  <path d="M10 6h4" />
                  <path d="M10 10h4" />
                  <path d="M10 14h4" />
                  <path d="M10 18h4" />
                </svg>
                <span className="absolute left-16 bg-[#111B21] text-xs px-2.5 py-1 rounded-md border border-[#222E35] text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap shadow-xl pointer-events-none z-50">
                  ⚙️ Configuración Sedes ({tenantsList.length || 23})
                </span>
              </button>

              {/* CRUD de Usuarios RBAC & Alertas Email */}
              <button
                onClick={() => {
                  setActiveTab('users_crud');
                  loadUsers();
                  loadEmailHistory();
                  loadSmtpSettings();
                }}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition relative group ${
                  activeTab === 'users_crud'
                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#202C33]'
                }`}
                title="Gestión de Usuarios RBAC & Notificaciones Email (Superadmin)"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className="absolute left-16 bg-[#111B21] text-xs px-2.5 py-1 rounded-md border border-[#222E35] text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap shadow-xl pointer-events-none z-50">
                  👥 Usuarios RBAC & Correos
                </span>
              </button>
            </>
          )}

          {/* Soporte & Onboarding (Todos los roles) */}
          <button
            onClick={() => setActiveTab('onboarding')}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition relative group ${
              activeTab === 'onboarding'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-100 hover:bg-[#202C33]'
            }`}
            title="Guía de Onboarding & Soporte"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
            <span className="absolute left-16 bg-[#111B21] text-xs px-2.5 py-1 rounded-md border border-[#222E35] text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap shadow-xl pointer-events-none z-50">
              🆘 Soporte & Ayuda
            </span>
          </button>
        </div>

        {/* Bottom: Herramientas del Sistema, BGM, Salud & Perfil */}
        <div className="flex flex-col items-center gap-3 w-full">
          
          {/* Toggle BGM Metal Sonic (Exclusivo Desarrollador) */}
          {isDesarrollador && (
            <button
              onClick={() => {
                if (!isPlayingBgm) {
                  setIsPlayingBgm(true);
                  setIsMutedBgm(false);
                } else {
                  setIsMutedBgm(!isMutedBgm);
                }
              }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                isPlayingBgm && !isMutedBgm
                  ? 'text-amber-400 bg-amber-950/60 border border-amber-500/40 animate-pulse'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#202C33]'
              }`}
              title={isPlayingBgm && !isMutedBgm ? 'BGM Cyber Metal Sonic activo (Silenciar)' : 'Reproducir BGM Metal Sonic'}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                {isPlayingBgm && !isMutedBgm ? (
                  <>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </>
                ) : (
                  <>
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </>
                )}
              </svg>
            </button>
          )}

          {/* Semáforo de Salud */}
          <button
            onClick={() => setShowHealthModal(true)}
            className="w-10 h-10 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-[#202C33] flex items-center justify-center transition relative"
            title="Ver Monitor de Salud y APIs"
          >
            <span className={`w-2.5 h-2.5 rounded-full ${
              healthFull?.overall === 'healthy' ? 'bg-emerald-400 shadow-sm shadow-emerald-500' : 'bg-amber-400 animate-ping'
            }`}></span>
          </button>

          {/* Avatar de Usuario & Logout */}
          <div
            onClick={handleLogout}
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-700 to-slate-900 border border-slate-600 flex items-center justify-center font-bold text-xs cursor-pointer hover:border-amber-400 transition"
            title={`${authUser?.displayName || 'Usuario'} (Clic para Cerrar Sesión)`}
          >
            {authUser?.matricula ? authUser.matricula.substring(0, 2) : 'UN'}
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. ÁREA PRINCIPAL (BANDEJA WHATSAPP O TABS SECUNDARIOS)                   */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col h-full bg-[#0C1317] overflow-hidden">
        
        {/* TOP BAR COMPACTA & ELEGANTE */}
        <header className="h-12 bg-[#111B21] border-b border-[#222E35] px-4 flex items-center justify-between shrink-0 z-30">
          
          <div className="flex items-center gap-3">
            <span className="font-black text-xs text-amber-400 tracking-wider flex items-center gap-1.5">
              <span>:UNID</span>
              <span className="text-slate-400 font-normal">|</span>
              <span className="text-slate-200">Centro de Mando</span>
            </span>

            {/* Badge de Rol Activo */}
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
              isDesarrollador
                ? 'bg-purple-950/80 text-purple-300 border-purple-500/40'
                : isAdministrador
                ? 'bg-sky-950/80 text-sky-300 border-sky-500/40'
                : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
            }`}>
              {isDesarrollador ? '👑 Desarrollador' : isAdministrador ? '🛡️ Administrador' : '🎧 Asesor'}
            </span>

            {/* Selector de Campus (Global para Desarrollador, Fijo en su sede_id para Admin/Usuario) */}
            <div className="flex items-center gap-1 bg-[#202C33] px-2.5 py-1 rounded-lg border border-slate-700/60">
              <i data-lucide="map-pin" className="w-3.5 h-3.5 text-amber-400"></i>
              {isDesarrollador ? (
                <select
                  value={selectedCampus}
                  onChange={(e) => handleChangeCampus(e.target.value)}
                  className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer"
                >
                  {campusesList.map(c => (
                    <option key={c.id} value={c.id} className="bg-[#111B21] text-slate-200">
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-slate-200 font-semibold" title="Sede asignada a tu cuenta">
                  {campusesList.find(c => c.id === (authUser?.sede_id || selectedCampus))?.name || `Sede: ${authUser?.sede_id || 'Campeche'}`}
                </span>
              )}
            </div>

            {/* Selector Rápido de Ciclo Escolar Activo */}
            <div className="hidden lg:flex items-center gap-1.5 bg-[#202C33] px-2.5 py-1 rounded-lg border border-amber-500/30" title="Ciclo Escolar Activo para nuevos registros y chats">
              <span className="text-[10px] text-amber-400 font-bold">📅 Ciclo:</span>
              <select
                value={activeCiclo}
                onChange={(e) => handleSetActiveCiclo(e.target.value)}
                className="bg-transparent text-xs text-amber-300 font-bold focus:outline-none cursor-pointer"
              >
                {(ciclosList.length > 0 ? ciclosList : [
                  { ciclo_escolar: '2026-2 Mayo' },
                  { ciclo_escolar: '2026-3 Septiembre' },
                  { ciclo_escolar: '2027-1 Enero' }
                ]).map((c, idx) => (
                  <option key={c.ciclo_escolar || idx} value={c.ciclo_escolar} className="bg-[#111B21] text-slate-200">
                    {c.ciclo_escolar}
                  </option>
                ))}
              </select>
            </div>

            {/* Selector de Modelo IA (Exclusivo Desarrollador) */}
            {isDesarrollador && (
              <div className="hidden md:flex items-center gap-1 bg-[#202C33] px-2.5 py-1 rounded-lg border border-slate-700/60">
                <i data-lucide="cpu" className="w-3.5 h-3.5 text-sky-400"></i>
                <select
                  value={selectedModel}
                  onChange={(e) => handleChangeModel(e.target.value)}
                  className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer"
                >
                  {modelsList.map(m => (
                    <option key={m.id} value={m.id} className="bg-[#111B21] text-slate-200">
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Acciones de la TopBar */}
          <div className="flex items-center gap-2">
            
            {/* Si NO está en la bandeja, botón para regresar a WhatsApp con 1 clic */}
            {activeTab !== 'inbox' && (
              <button
                onClick={() => setActiveTab('inbox')}
                className="px-3 py-1 rounded-lg bg-[#00A884] hover:bg-[#008f6f] text-slate-950 font-black text-xs flex items-center gap-1.5 shadow transition"
              >
                <i data-lucide="message-square" className="w-3.5 h-3.5"></i>
                <span>Volver a Chats WhatsApp</span>
              </button>
            )}

            {/* Botón Laboratorio de Pruebas (Exclusivo Desarrollador) */}
            {isDesarrollador && (
              <button
                onClick={() => setShowTestSuiteModal(true)}
                className="px-2.5 py-1 rounded-lg bg-purple-950/70 hover:bg-purple-900 border border-purple-500/40 text-purple-300 text-xs font-bold flex items-center gap-1.5 transition shadow"
                title="Abrir Laboratorio de Casos de Prueba"
              >
                <i data-lucide="flask-conical" className="w-3.5 h-3.5 text-amber-400"></i>
                <span className="hidden sm:inline">Laboratorio IA</span>
              </button>
            )}

            {/* Exportar CSV (Desarrollador y Administrador) */}
            {!isUsuario && (
              <a
                href="/api/aspirantes/export"
                target="_blank"
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 border border-slate-700 transition"
                title="Descargar Excel / CSV"
              >
                <i data-lucide="download" className="w-3.5 h-3.5"></i>
                <span className="hidden lg:inline">Excel</span>
              </a>
            )}

            {/* Botones de Testing para Desarrollador: Vaciar DB + Caché y Poblar DB (Demo) */}
            {isDesarrollador && (
              <>
                <button
                  onClick={handleTruncateDb}
                  className="px-2.5 py-1 rounded-lg bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-500/40 text-xs font-bold flex items-center gap-1 transition"
                  title="Vaciar Base de Datos y Memoria Caché al 100%"
                >
                  <span>🗑️</span>
                  <span className="hidden xl:inline">Vaciar DB + Caché</span>
                </button>
                <button
                  onClick={handleSeedDemo}
                  className="px-2.5 py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1 transition"
                  title="Poblar Base de Datos con 5 prospectos institucionales demo"
                >
                  <span>🌱</span>
                  <span className="hidden lg:inline">Poblar DB</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* ========================================================================= */}
        {/* 3. VISTA PRINCIPAL: BANDEJA DE ENTRADA WHATSAPP (FULL CANVAS)             */}
        {/* ========================================================================= */}
        {activeTab === 'inbox' && (
          <div className="flex-1 flex overflow-hidden relative">
            
            {/* ------------------------------------------------------------- */}
            {/* 3.1. SIDEBAR DE CONTACTOS (ESTILO WHATSAPP WEB ~380px)        */}
            {/* ------------------------------------------------------------- */}
            <div className="w-80 md:w-96 bg-[#111B21] border-r border-[#222E35] flex flex-col shrink-0">
              
              {/* Header de la lista de chats */}
              <div className="p-3 bg-[#111B21] border-b border-[#222E35] space-y-2.5 shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="font-extrabold text-base text-slate-100 flex items-center gap-2">
                    <span>WhatsApp Admisiones</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#202C33] text-emerald-400 font-mono border border-emerald-500/30">
                      LIVE
                    </span>
                  </h2>

                  <div className="flex items-center gap-1 text-slate-400">
                    <select
                      value={selectedCicloFilter}
                      onChange={(e) => setSelectedCicloFilter(e.target.value)}
                      className="bg-[#202C33] text-[10px] text-amber-300 font-bold rounded-lg px-2 py-1 border border-slate-700 focus:outline-none cursor-pointer"
                      title="Filtrar chats por Ciclo Escolar"
                    >
                      <option value="all">Todos los Ciclos</option>
                      {(ciclosList.length > 0 ? ciclosList : [
                        { ciclo_escolar: '2026-2 Mayo' },
                        { ciclo_escolar: '2026-3 Septiembre' },
                        { ciclo_escolar: '2027-1 Enero' }
                      ]).map((c, idx) => (
                        <option key={c.ciclo_escolar || idx} value={c.ciclo_escolar}>
                          {c.ciclo_escolar}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => loadConversations()}
                      className="p-1.5 rounded-lg hover:text-slate-100 hover:bg-[#202C33] transition"
                      title="Sincronizar mensajes en vivo"
                    >
                      <i data-lucide="refresh-cw" className="w-4 h-4"></i>
                    </button>
                  </div>
                </div>

                {/* Barra de Búsqueda estilo WhatsApp */}
                <div className="relative">
                  <i data-lucide="search" className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"></i>
                  <input
                    type="text"
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                    placeholder="Buscar un chat o iniciar uno nuevo"
                    className="w-full bg-[#202C33] text-xs text-slate-100 placeholder-slate-400 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#00A884] transition"
                  />
                  {chatSearchQuery && (
                    <button
                      onClick={() => setChatSearchQuery('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Chips / Pills (Todos, Nuevos, En Seguimiento, Inscritos, IA Pausada) */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  <button
                    onClick={() => setChatFilterTab('all')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap ${
                      chatFilterTab === 'all'
                        ? 'bg-[#00A884] text-slate-950 shadow'
                        : 'bg-[#202C33] text-slate-300 hover:bg-[#2A3942]'
                    }`}
                  >
                    Todos ({conversations.length})
                  </button>

                  <button
                    onClick={() => setChatFilterTab('nuevo')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap ${
                      chatFilterTab === 'nuevo'
                        ? 'bg-[#00A884] text-slate-950 shadow'
                        : 'bg-[#202C33] text-slate-300 hover:bg-[#2A3942]'
                    }`}
                  >
                    Nuevos
                  </button>

                  <button
                    onClick={() => setChatFilterTab('contactado')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap ${
                      chatFilterTab === 'contactado'
                        ? 'bg-[#00A884] text-slate-950 shadow'
                        : 'bg-[#202C33] text-slate-300 hover:bg-[#2A3942]'
                    }`}
                  >
                    En Proceso
                  </button>

                  <button
                    onClick={() => setChatFilterTab('inscrito')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap ${
                      chatFilterTab === 'inscrito'
                        ? 'bg-[#00A884] text-slate-950 shadow'
                        : 'bg-[#202C33] text-slate-300 hover:bg-[#2A3942]'
                    }`}
                  >
                    Inscritos 🎉
                  </button>

                  <button
                    onClick={() => setChatFilterTab('paused')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap ${
                      chatFilterTab === 'paused'
                        ? 'bg-amber-500 text-slate-950 shadow'
                        : 'bg-[#202C33] text-amber-300/80 hover:bg-[#2A3942]'
                    }`}
                  >
                    ⏸️ Control Humano
                  </button>
                </div>
              </div>

              {/* Lista de Conversaciones Ordenadas por Última Actividad */}
              <div className="flex-1 overflow-y-auto divide-y divide-[#222E35]">
                {filteredConversations.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 space-y-2">
                    <i data-lucide="message-square-dashed" className="w-8 h-8 mx-auto text-slate-500"></i>
                    <p className="text-xs font-semibold">No se encontraron conversaciones activas.</p>
                    <p className="text-[11px] text-slate-500">
                      Envía un mensaje desde WhatsApp o usa el simulador para iniciar un chat.
                    </p>
                  </div>
                ) : (
                  filteredConversations.map((conv) => {
                    const cleanId = conv.cleanPhone || conv.phone;
                    const isSelected = selectedChatPhone === cleanId;
                    const initials = conv.name
                      ? conv.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
                      : 'AS';

                    return (
                      <div
                        key={cleanId}
                        onClick={() => handleSelectConversation(conv)}
                        className={`p-3 flex items-start gap-3 cursor-pointer transition relative ${
                          isSelected ? 'bg-[#2A3942]' : 'hover:bg-[#202C33]'
                        }`}
                      >
                        {/* Avatar */}
                        <div className="relative shrink-0 mt-0.5">
                          <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-sm shadow ${
                            conv.isPaused
                              ? 'bg-gradient-to-br from-amber-500 to-amber-700 text-slate-950 ring-2 ring-amber-400'
                              : 'bg-gradient-to-br from-slate-700 to-slate-800 text-slate-100 ring-2 ring-emerald-500/60'
                          }`}>
                            {initials}
                          </div>
                          <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#111B21] ${
                            conv.isPaused ? 'bg-amber-400' : 'bg-emerald-400'
                          }`}></span>
                        </div>

                        {/* Info del contacto */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h3 className="font-bold text-xs text-slate-100 truncate">
                              {conv.name || conv.phone}
                            </h3>
                            <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                              {formatTimeAgo(conv.lastMessageTime)}
                            </span>
                          </div>

                          {/* Carrera e indicador de IA */}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#202C33] text-amber-300 font-medium truncate max-w-[170px]">
                              {conv.carrera || 'Interesado UNID'}
                            </span>
                            {conv.isPaused ? (
                              <span className="text-[9px] px-1 rounded bg-amber-950 text-amber-300 font-mono">
                                ⏸️ Humano
                              </span>
                            ) : (
                              <span className="text-[9px] px-1 rounded bg-emerald-950 text-emerald-300 font-mono">
                                🤖 IA Activa
                              </span>
                            )}
                          </div>

                          {/* Último mensaje */}
                          <p className="text-[11px] text-slate-400 truncate mt-1 leading-tight">
                            {conv.lastMessage}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Banner de Estado de Meta API en el Footer */}
              <div className="p-2.5 bg-[#0C1317] border-t border-[#222E35] flex items-center justify-between text-[11px] text-slate-400 shrink-0">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Meta Cloud API Conectada
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  {tenantsList.find(t => t.slug === selectedTenantSlug)?.nombre || 'Sede Campeche'}
                </span>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* 3.2. ÁREA CENTRAL: CONVERSACIÓN ACTIVA (ESTILO WHATSAPP WEB)   */}
            {/* ------------------------------------------------------------- */}
            <div className="flex-1 flex flex-col bg-[#0B141A] relative overflow-hidden" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 0)", backgroundSize: "24px 24px" }}>
              
              {/* Header del Chat Activo */}
              <div className="h-14 bg-[#202C33] px-4 flex items-center justify-between border-b border-[#222E35] shrink-0 z-20">
                
                {/* Info del Aspirante en el Chat */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFC72C] to-red-600 flex items-center justify-center font-black text-sm text-slate-950 shadow shrink-0">
                    {activeConversation?.name ? activeConversation.name.substring(0, 2).toUpperCase() : 'WA'}
                  </div>

                  <div className="min-w-0">
                    <h2 className="font-extrabold text-xs sm:text-sm text-slate-100 flex items-center gap-2 truncate">
                      <span>{activeConversation?.name || phone}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 font-mono border border-slate-700">
                        {phone}
                      </span>
                    </h2>
                    <p className="text-[11px] text-slate-400 flex items-center gap-2 truncate">
                      <span className="text-amber-400 font-medium truncate">
                        {activeConversation?.carrera || 'Ingeniería en Software'}
                      </span>
                      <span>•</span>
                      <span>{activeConversation?.modalidad || 'Presencial'}</span>
                    </p>
                  </div>
                </div>

                {/* Acciones del Asesor (Pausar IA / Enviar PDF / Ficha 11 Datos) */}
                <div className="flex items-center gap-1.5">
                  
                  {/* Botón Human Handover: Pausar/Reanudar IA */}
                  <button
                    onClick={() => handleToggleAiPause(phone, activeConversation?.isPaused)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition shadow ${
                      activeConversation?.isPaused
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 ring-2 ring-amber-400/50'
                        : 'bg-[#202C33] hover:bg-[#2A3942] text-emerald-400 border border-emerald-500/40'
                    }`}
                    title={activeConversation?.isPaused ? 'La IA está pausada. Clic para reactivar Metal-Uriel.' : 'Pausar la IA y tomar control manual como Asesor.'}
                  >
                    <i data-lucide={activeConversation?.isPaused ? 'play' : 'pause'} className="w-3.5 h-3.5"></i>
                    <span>{activeConversation?.isPaused ? 'Reanudar Metal-Uriel' : 'Pausar IA (Control Asesor)'}</span>
                  </button>

                  {/* Botón Enviar Recurso del Pool (PDF / Imagen / Horario) */}
                  <div className="relative">
                    <button
                      onClick={() => setShowBrochurePicker(!showBrochurePicker)}
                      className="px-2.5 py-1.5 rounded-xl bg-[#202C33] hover:bg-[#2A3942] text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition"
                      title="Enviar Plan de Estudios, Horario o Imagen del Pool a este aspirante"
                    >
                      <i data-lucide="file-text" className="w-3.5 h-3.5 text-amber-400"></i>
                      <span className="hidden md:inline">Enviar del Pool</span>
                    </button>

                    {/* Menú Flotante de Selección de Recurso del Pool */}
                    {showBrochurePicker && (
                      <div className="absolute right-0 top-11 w-80 bg-[#111B21] border border-[#222E35] rounded-2xl shadow-2xl p-2 z-50 space-y-1">
                        <div className="px-2 py-1 text-[11px] font-bold text-slate-400 flex items-center justify-between border-b border-slate-800 pb-1.5">
                          <span>Seleccionar Recurso del Pool Multimedia:</span>
                          <button onClick={() => setShowBrochurePicker(false)} className="hover:text-white">✕</button>
                        </div>
                        <div className="max-h-64 overflow-y-auto space-y-1 pt-1">
                          {brochures.map(b => (
                            <button
                              key={b.id}
                              onClick={() => handleSendBrochureQuick(b.id)}
                              className="w-full text-left p-2 rounded-xl hover:bg-[#202C33] text-xs text-slate-200 flex items-center justify-between group transition gap-2"
                            >
                              <span className="truncate font-medium">{b.titulo || b.carrera}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                                b.tipo_archivo === 'imagen'
                                  ? 'bg-sky-950 text-sky-300 border border-sky-500/30'
                                  : 'bg-amber-950 text-amber-300 border border-amber-500/30'
                              }`}>
                                {b.tipo_archivo === 'imagen' ? 'IMG' : 'PDF'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Toggle Ficha 11 Datos IA (Drawer) */}
                  <button
                    onClick={() => setShowFichaDrawer(!showFichaDrawer)}
                    className={`p-2 rounded-xl text-xs font-bold transition ${
                      showFichaDrawer
                        ? 'bg-purple-600 text-white shadow'
                        : 'bg-[#202C33] hover:bg-[#2A3942] text-purple-300 border border-purple-500/30'
                    }`}
                    title="Ver Ficha de 11 Datos IA y Expediente"
                  >
                    <i data-lucide="list-checks" className="w-4 h-4"></i>
                  </button>

                  {/* Reiniciar Chat */}
                  <button
                    onClick={handleResetSession}
                    className="p-2 rounded-xl bg-[#202C33] hover:bg-red-950/60 hover:text-red-400 text-slate-400 transition"
                    title="Reiniciar chat y limpiar memoria"
                  >
                    <i data-lucide="rotate-ccw" className="w-4 h-4"></i>
                  </button>
                </div>
              </div>

              {/* Contenedor de Mensajes con Burbujas estilo WhatsApp Web */}
              <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-3.5">
                
                {/* Separador de Fecha */}
                <div className="flex justify-center my-2">
                  <span className="px-3 py-1 rounded-lg bg-[#182229] text-[11px] font-semibold text-slate-400 shadow-sm border border-slate-800">
                    Hoy • Conversación Oficial UNID
                  </span>
                </div>

                {messages.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 space-y-2">
                    <i data-lucide="messages-square" className="w-10 h-10 mx-auto text-slate-600"></i>
                    <p className="text-xs">No hay mensajes previos con este número.</p>
                    <p className="text-[11px]">Escribe un mensaje abajo para interactuar directamente por WhatsApp.</p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isUser = m.sender === 'user';
                    const isAdvisor = m.sender === 'advisor';
                    const isBot = m.sender === 'bot' || m.role === 'assistant';

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isUser ? 'items-start mr-auto' : 'items-end ml-auto'} max-w-[85%] md:max-w-[75%]`}
                      >
                        {/* Identificador de remitente para asesores humanos */}
                        {isAdvisor && (
                          <span className="text-[10px] text-purple-300 font-bold mb-0.5 flex items-center gap-1">
                            <i data-lucide="user-check" className="w-3 h-3 text-purple-400"></i>
                            {m.senderName || 'Asesor de Admisiones'}
                          </span>
                        )}

                        <div
                          className={`rounded-2xl px-3.5 py-2 text-xs shadow-md space-y-1.5 leading-relaxed relative ${
                            isUser
                              ? 'bg-[#202C33] text-slate-100 rounded-tl-none border border-slate-700/40'
                              : isAdvisor
                              ? 'bg-[#1E293B] text-purple-100 rounded-tr-none border border-purple-500/40'
                              : 'bg-[#005C4B] text-slate-100 rounded-tr-none shadow-emerald-950/20'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{m.text}</p>

                          {/* Card de Documento PDF o Imagen Adjunta del Pool Multimedia */}
                          {m.documentAttachment && (
                            <div className="mt-2 p-2.5 rounded-xl bg-[#0A192F] border border-amber-500/40 space-y-1.5 shadow-inner">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-extrabold text-[11px] text-amber-300 flex items-center gap-1.5 truncate">
                                  <span>{m.documentAttachment.tipo_archivo === 'imagen' ? '🖼️' : '📄'}</span>
                                  <span className="truncate">{m.documentAttachment.title || 'Recurso Oficial UNID'}</span>
                                </span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 font-mono border border-amber-500/30 shrink-0">
                                  {m.documentAttachment.tipo_archivo === 'imagen' ? 'IMAGEN' : 'PDF SEP'}
                                </span>
                              </div>
                              {m.documentAttachment.tipo_archivo === 'imagen' && (m.documentAttachment.url || m.documentAttachment.pdfUrl || m.documentAttachment.url_recurso) && (
                                <div className="rounded-lg overflow-hidden border border-slate-700 bg-slate-950">
                                  <img
                                    src={m.documentAttachment.url || m.documentAttachment.pdfUrl || m.documentAttachment.url_recurso}
                                    alt={m.documentAttachment.title || 'Imagen UNID'}
                                    className="w-full max-h-52 object-cover"
                                  />
                                </div>
                              )}
                              <p className="text-[10px] text-slate-300 leading-tight line-clamp-2">
                                {m.documentAttachment.caption || 'Recurso oficial del Pool Multimedia UNID.'}
                              </p>
                              <a
                                href={m.documentAttachment.url || m.documentAttachment.pdfUrl || m.documentAttachment.url_recurso || m.documentAttachment.downloadUrl}
                                target="_blank"
                                download={m.documentAttachment.fileName || 'Recurso_UNID'}
                                className="mt-1 block text-center py-1 rounded-lg bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] hover:from-[#F59E0B] hover:to-[#D97706] text-slate-950 font-black text-[10px] transition shadow"
                              >
                                {m.documentAttachment.tipo_archivo === 'imagen'
                                  ? '🔍 Abrir / Descargar Imagen Oficial'
                                  : '📥 Descargar / Abrir Documento (PDF)'}
                              </a>
                            </div>
                          )}

                          {/* Pie de mensaje con hora y palomitas */}
                          <div className="flex items-center justify-end gap-1 text-[9px] text-slate-300/70 font-mono select-none">
                            <span>{m.time}</span>
                            {!isUser && (
                              <span className="text-sky-300 font-bold ml-0.5">✓✓</span>
                            )}
                            {isBot && m.modelUsed && (
                              <span className="text-[9px] text-amber-300/80 ml-1">
                                • {m.modelUsed}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {isLoading && (
                  <div className="flex items-center gap-2 text-slate-400 text-xs bg-[#202C33] px-3.5 py-2 rounded-2xl rounded-tl-none w-fit border border-slate-700/40">
                    <span className="w-2 h-2 bg-[#00A884] rounded-full animate-ping"></span>
                    <span>Metal-Uriel procesando respuesta...</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* ------------------------------------------------------------- */}
              {/* 3.3. BARRA INFERIOR DE ENTRADA (WHATSAPP INPUT BAR)           */}
              {/* ------------------------------------------------------------- */}
              <div className="p-3 bg-[#202C33] border-t border-[#222E35] shrink-0 space-y-2">
                
                {/* Selector de Modo de Envío (Asesor Humano vs Simulador) */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAdvisorMode(true)}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition flex items-center gap-1 ${
                        isAdvisorMode
                          ? 'bg-purple-600 text-white shadow'
                          : 'bg-[#111B21] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <i data-lucide="user" className="w-3 h-3"></i>
                      <span>Modo: Asesor Humano (vía WhatsApp)</span>
                    </button>

                    {isDesarrollador && (
                      <button
                        type="button"
                        onClick={() => setIsAdvisorMode(false)}
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition flex items-center gap-1 ${
                          !isAdvisorMode
                            ? 'bg-emerald-600 text-white shadow'
                            : 'bg-[#111B21] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <i data-lucide="flask-conical" className="w-3 h-3"></i>
                        <span>Simulador (Test Lab IA)</span>
                      </button>
                    )}
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                    Presiona Enter para enviar
                  </span>
                </div>

                {/* Formulario de Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={
                      isAdvisorMode
                        ? `Escribir respuesta oficial como Asesor a ${activeConversation?.name || phone}...`
                        : "Simular mensaje de aspirante hacia Metal-Uriel..."
                    }
                    disabled={isLoading}
                    className="flex-1 bg-[#2A3942] text-xs text-slate-100 placeholder-slate-400 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#00A884] transition"
                  />

                  <button
                    type="submit"
                    disabled={isLoading || !inputText.trim()}
                    className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold transition shadow ${
                      isAdvisorMode
                        ? 'bg-purple-600 hover:bg-purple-500 text-white'
                        : 'bg-[#00A884] hover:bg-[#008f6f] text-slate-950'
                    } disabled:opacity-50`}
                    title="Enviar mensaje"
                  >
                    <i data-lucide="send" className="w-4 h-4"></i>
                  </button>
                </form>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* 3.4. DRAWER LATERAL DERECHO: FICHA 11 DATOS IA                */}
              {/* ------------------------------------------------------------- */}
              {showFichaDrawer && (
                <div className="absolute right-0 top-14 bottom-0 w-80 md:w-96 bg-[#111B21] border-l border-[#222E35] shadow-2xl p-4 overflow-y-auto space-y-4 z-30 animate-in slide-in-from-right">
                  
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="font-extrabold text-xs text-white flex items-center gap-1.5">
                      <i data-lucide="list-checks" className="w-4 h-4 text-purple-400"></i>
                      <span>Ficha de 11 Datos IA • Expediente</span>
                    </h3>
                    <button onClick={() => setShowFichaDrawer(false)} className="text-slate-400 hover:text-white">✕</button>
                  </div>

                  {/* Estado del Lead en CRM */}
                  <div className="p-3 bg-[#1E293B] rounded-xl border border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">Etapa en Ciclo:</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-bold border border-emerald-500/30">
                        {activeConversation?.estado_prospecto || 'Nuevo'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Mover a:</span>
                      <select
                        value={activeConversation?.estado_prospecto || 'nuevo'}
                        onChange={(e) => {
                          const targetId = activeConversation?.leadData?.id;
                          if (targetId) handleUpdateStatus(targetId, e.target.value);
                        }}
                        className="flex-1 bg-[#0F172A] text-xs text-amber-300 rounded px-2 py-1 border border-slate-700 focus:outline-none"
                      >
                        <option value="nuevo">Nuevos Prospectos</option>
                        <option value="contactado">Contactados</option>
                        <option value="en_proceso">En Proceso / Cita</option>
                        <option value="inscrito">Inscritos 🎉</option>
                        <option value="no_interesado">No Interesado</option>
                      </select>
                    </div>
                  </div>

                  {/* Tarjeta de CURP Oficial Calculada por IA */}
                  <div className="p-3 bg-[#182229] rounded-xl border border-sky-500/40 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-sky-300 flex items-center gap-1">
                        <i data-lucide="shield-check" className="w-3.5 h-3.5 text-sky-400"></i>
                        <span>CURP Oficial (RENAPO)</span>
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 font-mono font-bold border border-sky-500/30">
                        IA AUTO
                      </span>
                    </div>
                    <p className="text-xs font-mono font-bold text-sky-200 tracking-wider">
                      {(liveExtractedFields.curp || activeConversation?.leadData?.curp) || 'Generando con datos clave...'}
                    </p>
                  </div>

                  {/* Lista de los 11 Campos con Indicador de Completitud */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-300 block">Campos Capturados por IA:</span>
                    {REQUIRED_FIELDS.map((field) => {
                      const val = liveExtractedFields[field.key] || activeConversation?.leadData?.[field.key];
                      const isComplete = Boolean(val && String(val).trim().length > 0);

                      return (
                        <div
                          key={field.key}
                          className={`p-2 rounded-xl text-xs flex items-start justify-between gap-2 border ${
                            isComplete
                              ? 'bg-[#182229] border-emerald-500/30 text-slate-200'
                              : 'bg-[#182229]/40 border-slate-800 text-slate-500'
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="font-bold block text-[11px] text-slate-300">
                              {field.label}
                            </span>
                            <span className="text-xs text-amber-300 font-medium truncate block">
                              {isComplete ? String(val) : 'Pendiente...'}
                            </span>
                          </div>
                          <span className={`text-xs ${isComplete ? 'text-emerald-400' : 'text-slate-600'}`}>
                            {isComplete ? '✓' : '○'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. VISTAS SECUNDARIAS (KANBAN, ANALYTICS, BROCHURES, MARIADB, PROMPT, ETC) */}
        {/* ========================================================================= */}

        {/* ====== TAB 1: KANBAN CON ARCHIVADO & TIMESTAMPS ====== */}
        {activeTab === 'kanban' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2">
                  <span>Ciclo de Admisiones • {selectedCampusName}</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Arrastra o cambia de etapa a cada prospecto. Los prospectos concluidos pueden ser archivados para mantener el tablero limpio.
                </p>
              </div>

              {/* Filtro por Ciclo Escolar + Toggle Activos vs Archivados */}
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                <div className="flex items-center gap-1.5 bg-[#1E293B] px-2.5 py-1 rounded-xl border border-slate-700">
                  <span className="text-[11px] font-bold text-slate-400">Ciclo:</span>
                  <select
                    value={selectedCicloFilter}
                    onChange={(e) => setSelectedCicloFilter(e.target.value)}
                    className="bg-transparent text-xs text-emerald-300 font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all" className="bg-slate-900 text-slate-200">Todos los Ciclos</option>
                    {ciclosList.map(c => (
                      <option key={c.id || c.ciclo_escolar} value={c.ciclo_escolar} className="bg-slate-900 text-slate-200">
                        {c.ciclo_escolar} {c.es_activo ? '★' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-[#1E293B] p-1 rounded-xl border border-slate-700">
                  <button
                    onClick={() => setShowArchiveView(false)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      !showArchiveView
                        ? 'bg-amber-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Activos ({activeLeadsCount})
                  </button>
                  <button
                    onClick={() => setShowArchiveView(true)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      showArchiveView
                        ? 'bg-amber-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Archivados ({archivedLeadsCount})
                  </button>
                </div>
              </div>
            </div>

            {/* Columnas Kanban */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5 items-start">
              {KANBAN_COLUMNS.map((col) => {
                const columnLeads = (showArchiveView ? archivedLeads : activeLeads).filter(
                  a => (a.estado_prospecto || 'nuevo') === col.id
                );

                return (
                  <div
                    key={col.id}
                    className={`rounded-2xl border p-3 flex flex-col gap-2.5 min-h-[420px] transition-colors ${col.color}`}
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/80">
                      <span className="font-extrabold text-xs tracking-wide">
                        {col.title}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-black border ${col.badge}`}>
                        {columnLeads.length}
                      </span>
                    </div>

                    <div className="space-y-2 flex-1 overflow-y-auto max-h-[calc(100vh-230px)] pr-1">
                      {columnLeads.length === 0 ? (
                        <div className="h-32 flex items-center justify-center text-slate-600 text-xs italic">
                          Sin prospectos
                        </div>
                      ) : (
                        columnLeads.map((lead) => (
                          <div
                            key={lead.id}
                            onClick={() => {
                              setSelectedLead(lead);
                              setPhone(lead.telefono_celular || phone);
                              handleSelectConversation({ phone: lead.telefono_celular, name: lead.nombre_completo, leadData: lead });
                            }}
                            className="p-3 rounded-xl bg-[#0F172A] border border-slate-800 hover:border-amber-400/60 transition shadow-sm space-y-2 cursor-pointer group"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <h4 className="font-bold text-xs text-slate-100 group-hover:text-amber-300 transition truncate">
                                {lead.nombre_completo}
                              </h4>
                              <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold shrink-0 ${
                                lead.nivel_interes === 'Alto'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-amber-950 text-amber-300 border border-amber-500/30'
                              }`}>
                                {lead.nivel_interes || 'Alto'}
                              </span>
                            </div>

                            <div className="space-y-0.5">
                              <p className="text-[11px] text-amber-300 font-medium truncate">
                                {lead.carrera_interes}
                              </p>
                              <p className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                                <span>{lead.modalidad_estudios || 'Presencial'}</span>
                                <span>•</span>
                                <span className={lead.es_foraneo ? 'text-sky-300' : 'text-emerald-300'}>
                                  {lead.es_foraneo ? 'Online' : 'Presencial'}
                                </span>
                              </p>
                              {lead.curp && (
                                <p className="text-[10px] font-mono text-sky-300 font-bold truncate flex items-center gap-1 bg-sky-950/40 px-1.5 py-0.5 rounded border border-sky-500/20">
                                  <span>🆔</span>
                                  <span>{lead.curp}</span>
                                </p>
                              )}
                            </div>

                            {/* Timestamp de último contacto */}
                            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[9px] text-slate-500 font-mono">
                              <span className="flex items-center gap-1">
                                <i data-lucide="clock" className="w-3 h-3 text-slate-600"></i>
                                {formatTimeAgo(lead.created_at)}
                              </span>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleArchive(lead.id, lead.archivado);
                                }}
                                className="text-slate-400 hover:text-amber-400"
                                title={lead.archivado ? 'Desarchivar y regresar al tablero' : 'Archivar prospecto'}
                              >
                                <i data-lucide={lead.archivado ? 'archive-restore' : 'archive'} className="w-3 h-3"></i>
                              </button>
                            </div>

                            {/* Select rápido de etapa */}
                            <div className="pt-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <select
                                value={lead.estado_prospecto || 'nuevo'}
                                onChange={(e) => handleUpdateStatus(lead.id, e.target.value)}
                                className="w-full bg-[#1E293B] text-[10px] text-slate-300 rounded px-1.5 py-0.5 border border-slate-700/60 focus:outline-none cursor-pointer"
                              >
                                <option value="nuevo">Mover: Nuevos Prospectos</option>
                                <option value="contactado">Mover: Contactados</option>
                                <option value="en_proceso">Mover: En Proceso / Cita</option>
                                <option value="inscrito">Mover: Inscritos 🎉</option>
                                <option value="no_interesado">Mover: No Interesado</option>
                              </select>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ====== TAB 2: MÉTRICAS & ANALYTICS ====== */}
        {activeTab === 'analytics' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-white">
                  Métricas de Conversión y Demanda Educativa
                </h2>
                <p className="text-xs text-slate-400">
                  Resumen de prospectos capturados por Metal-Uriel en MariaDB.
                </p>
              </div>
              <button
                onClick={loadAnalytics}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <i data-lucide="refresh-cw" className="w-3.5 h-3.5"></i>
                <span>Actualizar</span>
              </button>
            </div>

            {/* Tarjetas KPI */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-800 shadow-sm space-y-1">
                <span className="text-[11px] text-slate-400 font-bold block">Total Prospectos</span>
                <span className="text-2xl font-black text-white font-mono">{analyticsData?.totalAspirantes || aspirantes.length}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-800 shadow-sm space-y-1">
                <span className="text-[11px] text-emerald-400 font-bold block">Inscritos Oficiales</span>
                <span className="text-2xl font-black text-emerald-400 font-mono">
                  {aspirantes.filter(a => a.estado_prospecto === 'inscrito').length}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-800 shadow-sm space-y-1">
                <span className="text-[11px] text-sky-400 font-bold block">Foráneos (Online)</span>
                <span className="text-2xl font-black text-sky-400 font-mono">{analyticsData?.foraneos || 0}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-800 shadow-sm space-y-1">
                <span className="text-[11px] text-amber-400 font-bold block">Interés Alto</span>
                <span className="text-2xl font-black text-amber-400 font-mono">
                  {aspirantes.filter(a => a.nivel_interes === 'Alto').length}
                </span>
              </div>
            </div>

            {/* Gráficas de Análisis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 shadow-sm space-y-3">
                <h3 className="font-extrabold text-xs text-slate-200">Demanda por Licenciatura / Ingeniería</h3>
                <div className="h-64 relative">
                  <canvas ref={careerChartRef}></canvas>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 shadow-sm space-y-3">
                <h3 className="font-extrabold text-xs text-slate-200">Distribución Geográfica (Local vs Foráneo)</h3>
                <div className="h-64 relative">
                  <canvas ref={originChartRef}></canvas>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== TAB 3: POOL MULTIMEDIA, PLANES, OFERTA, HORARIOS E INSTALACIONES (TODOS LOS ROLES) ====== */}
        {activeTab === 'brochures' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* Encabezado y Botones de CRUD (Recursos + Categorías) */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2 flex-wrap">
                  <span>📂 Pool Multimedia IA • Planes, Oferta, Horarios e Instalaciones</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 font-mono border border-amber-500/40">
                    {brochures.length} Recursos Activos
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 font-mono border border-purple-500/40">
                    {poolCategories.length} Categorías
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-mono border border-emerald-500/40">
                    Ciclo: {activeCiclo}
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Sube archivos directamente desde tu computadora (PDF, PNG, JPG, WEBP), organízalos en las categorías que desees y edita su contexto para que Metal-Uriel los envíe por WhatsApp.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Búsqueda de Recurso */}
                <div className="relative">
                  <input
                    type="text"
                    value={brochureSearch}
                    onChange={(e) => setBrochureSearch(e.target.value)}
                    placeholder="Buscar carrera, horario, foto..."
                    className="bg-[#1E293B] text-xs text-slate-100 placeholder-slate-400 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400 w-52"
                  />
                </div>

                {/* Botón CRUD de Categorías */}
                <button
                  type="button"
                  onClick={() => {
                    setEditingCategoryId(null);
                    setCategoryForm({ nombre: '', icono: '📁', color: 'amber', descripcion: '' });
                    setCategoryMsg({ type: '', text: '' });
                    setShowCategoryModal(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-purple-950/90 hover:bg-purple-900 text-purple-200 border border-purple-500/40 font-black text-xs transition shadow flex items-center gap-1.5"
                >
                  <span>🏷️ Categorías (CRUD)</span>
                </button>

                {/* Botón Subir / Nuevo Recurso */}
                <button
                  type="button"
                  onClick={() => {
                    setEditingPoolId(null);
                    setPoolForm({
                      categoria: poolCategoryFilter === 'all' ? (poolCategories[0]?.slug || 'plan_estudios') : poolCategoryFilter,
                      ciclo_escolar: activeCiclo || '2026-3 Septiembre',
                      titulo: '',
                      descripcion_ia: '',
                      tags: '',
                      tipo_archivo: 'pdf',
                      url_recurso: '',
                      fileName: '',
                      fileData: '',
                      modalidad: 'Ejecutiva / Escolarizada',
                      duracion: '9 Cuatrimestres (3 años)',
                      rvoe: 'RVOE SEP Oficial'
                    });
                    setPoolMsg({ type: '', text: '' });
                    setShowPoolModal(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] hover:brightness-110 text-slate-950 font-black text-xs transition shadow flex items-center gap-1.5"
                >
                  <span>➕ Subir / Nuevo Recurso al Pool</span>
                </button>
              </div>
            </div>

            {/* Barra de Control de Ciclo Escolar Activo Manual */}
            <div className="p-3.5 rounded-2xl bg-[#0F172A] border border-emerald-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-extrabold text-emerald-300 flex items-center gap-2">
                  <span>📅 Selector Manual de Ciclo Escolar Activo ({selectedCampusName})</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Cambia el periodo activo cuando inicie una nueva captación. Todos los nuevos leads y chats se etiquetarán con este ciclo.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={activeCiclo}
                  onChange={(e) => handleSetActiveCiclo(e.target.value)}
                  className="bg-[#1E293B] text-xs text-emerald-300 font-bold rounded-xl px-3 py-1.5 border border-emerald-500/40 focus:outline-none cursor-pointer"
                >
                  {ciclosList.map(c => (
                    <option key={c.id || c.ciclo_escolar} value={c.ciclo_escolar}>
                      {c.ciclo_escolar} {c.es_activo ? ' (ACTIVO ★)' : ''}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newCicloInput}
                    onChange={(e) => setNewCicloInput(e.target.value)}
                    placeholder="Nuevo ej: 2027-2 Mayo"
                    className="bg-[#1E293B] text-xs text-slate-100 placeholder-slate-500 rounded-xl px-2.5 py-1.5 border border-slate-700 focus:outline-none w-40"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newCicloInput.trim()) handleSetActiveCiclo(newCicloInput.trim());
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs transition"
                  >
                    Crear y Activar
                  </button>
                </div>
              </div>
            </div>

            {/* Pestañas Dinámicas de Categorías del Pool + Acciones Rápidas de Categoría */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPoolCategoryFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    poolCategoryFilter === 'all'
                      ? 'bg-amber-500 text-slate-950 shadow font-black'
                      : 'bg-[#0F172A] text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <span>🌐 Todos los Recursos</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
                    {brochures.length}
                  </span>
                </button>

                {poolCategories.map(cat => {
                  const count = brochures.filter(b => (b.categoria || 'plan_estudios') === cat.slug).length;
                  const isSelected = poolCategoryFilter === cat.slug;
                  return (
                    <div key={cat.id || cat.slug} className="inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setPoolCategoryFilter(cat.slug)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 shadow font-black'
                            : 'bg-[#0F172A] text-slate-300 hover:bg-slate-800 border border-slate-800'
                        }`}
                      >
                        <span>{cat.icono || '📁'} {cat.nombre}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
                          {count}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingCategoryId(null);
                  setCategoryForm({ nombre: '', icono: '📁', color: 'amber', descripcion: '' });
                  setCategoryMsg({ type: '', text: '' });
                  setShowCategoryModal(true);
                }}
                className="text-[11px] font-bold text-purple-300 hover:text-purple-200 px-2.5 py-1 rounded-lg bg-purple-950/50 border border-purple-500/30 transition"
              >
                + Nueva / Editar Categorías
              </button>
            </div>

            {/* Modal CRUD de Categorías del Pool */}
            {showCategoryModal && (
              <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-[#0F172A] border border-purple-500/40 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                        <span>🏷️ Administrar Categorías del Pool Multimedia (CRUD)</span>
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Crea nuevas categorías, modifica el nombre o icono de las existentes, o elimina las que no necesites.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCategoryModal(false)}
                      className="text-slate-400 hover:text-white text-sm font-bold px-2 py-1"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Formulario Crear / Editar Categoría */}
                  <form onSubmit={handleSaveCategory} className="p-3.5 rounded-xl bg-[#1E293B]/70 border border-slate-700 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-purple-300">
                        {editingCategoryId ? '✏️ Editando Categoría' : '➕ Crear Nueva Categoría'}
                      </span>
                      {editingCategoryId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategoryId(null);
                            setCategoryForm({ nombre: '', icono: '📁', color: 'amber', descripcion: '' });
                            setCategoryMsg({ type: '', text: '' });
                          }}
                          className="text-[11px] text-slate-400 hover:text-white underline"
                        >
                          Cancelar edición
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-[11px] font-bold text-slate-300">Nombre de la Categoría</label>
                        <input
                          type="text"
                          required
                          value={categoryForm.nombre}
                          onChange={(e) => setCategoryForm({ ...categoryForm, nombre: e.target.value })}
                          placeholder="Ej. Calendario Escolar / Reglamentos / Talleres"
                          className="w-full bg-[#0F172A] text-xs text-slate-100 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-400"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-300">Icono (Emoji)</label>
                        <input
                          type="text"
                          value={categoryForm.icono}
                          onChange={(e) => setCategoryForm({ ...categoryForm, icono: e.target.value })}
                          placeholder="📚 🎓 🕒 🏛️ 💰 📁"
                          className="w-full bg-[#0F172A] text-xs text-center text-slate-100 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-300">Color de Etiqueta</label>
                        <select
                          value={categoryForm.color}
                          onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                          className="w-full bg-[#0F172A] text-xs text-amber-300 font-bold rounded-xl px-3 py-2 border border-slate-700 focus:outline-none"
                        >
                          <option value="amber">🟡 Ámbar / Dorado</option>
                          <option value="purple">🟣 Morado</option>
                          <option value="emerald">🟢 Esmeralda</option>
                          <option value="sky">🔵 Azul Cielo</option>
                          <option value="rose">🔴 Rosa / Coral</option>
                          <option value="indigo">靛 Índigo</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300">Descripción breve (para organización y contexto del bot)</label>
                      <input
                        type="text"
                        value={categoryForm.descripcion}
                        onChange={(e) => setCategoryForm({ ...categoryForm, descripcion: e.target.value })}
                        placeholder="Ej. Documentos e imágenes oficiales de esta sección..."
                        className="w-full bg-[#0F172A] text-xs text-slate-200 rounded-xl px-3 py-1.5 border border-slate-700 focus:outline-none"
                      />
                    </div>

                    {categoryMsg && categoryMsg.text && (
                      <div className={`p-2 rounded-xl text-xs font-bold border ${
                        categoryMsg.type === 'success'
                          ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                          : 'bg-red-950/80 border-red-500/40 text-red-300'
                      }`}>
                        {categoryMsg.text}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={categorySaving}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 hover:brightness-110 text-white font-black text-xs shadow transition"
                      >
                        {categorySaving ? 'Guardando...' : editingCategoryId ? 'Guardar Cambios de Categoría' : '➕ Guardar Nueva Categoría'}
                      </button>
                    </div>
                  </form>

                  {/* Lista de Categorías Existentes */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-300">
                      Categorías Activas ({poolCategories.length})
                    </div>
                    <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-[#0B1120]">
                      {poolCategories.map(cat => {
                        const count = brochures.filter(b => (b.categoria || 'plan_estudios') === cat.slug).length;
                        return (
                          <div key={cat.id || cat.slug} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-900/60 transition">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-lg">{cat.icono || '📁'}</span>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white flex items-center gap-2">
                                  <span>{cat.nombre}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                                    slug: {cat.slug}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 font-mono border border-amber-500/30">
                                    {count} recursos
                                  </span>
                                </div>
                                {cat.descripcion && (
                                  <p className="text-[11px] text-slate-400 truncate">{cat.descripcion}</p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleEditCategory(cat)}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold transition"
                              >
                                ✏️ Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCategory(cat)}
                                className="px-2.5 py-1 rounded-lg bg-red-950/80 hover:bg-red-800 text-red-200 text-[11px] font-bold transition"
                              >
                                🗑️ Eliminar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal para Crear / Editar Recurso del Pool (Subida Directa PDF/JPG/PNG/WEBP o Link) */}
            {showPoolModal && (
              <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-[#0F172A] border border-amber-500/40 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                      <span>{editingPoolId ? '✏️ Editar Recurso del Pool Multimedia' : '➕ Subir Nuevo Recurso al Pool Multimedia'}</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowPoolModal(false)}
                      className="text-slate-400 hover:text-white text-sm font-bold px-2 py-1"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleSavePoolItem} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-slate-300">Categoría del Pool</label>
                          <button
                            type="button"
                            onClick={() => {
                              setShowPoolModal(false);
                              setShowCategoryModal(true);
                            }}
                            className="text-[10px] text-purple-300 hover:underline font-bold"
                          >
                            + Categorías
                          </button>
                        </div>
                        <select
                          value={poolForm.categoria}
                          onChange={(e) => setPoolForm({ ...poolForm, categoria: e.target.value })}
                          className="w-full bg-[#1E293B] text-xs text-amber-300 font-bold rounded-xl px-3 py-2 border border-slate-700 focus:outline-none"
                        >
                          {poolCategories.map(cat => (
                            <option key={cat.id || cat.slug} value={cat.slug}>
                              {cat.icono || '📁'} {cat.nombre}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-300">Tipo de Archivo</label>
                        <select
                          value={poolForm.tipo_archivo}
                          onChange={(e) => setPoolForm({ ...poolForm, tipo_archivo: e.target.value })}
                          className="w-full bg-[#1E293B] text-xs text-sky-300 font-bold rounded-xl px-3 py-2 border border-slate-700 focus:outline-none"
                        >
                          <option value="pdf">📄 Documento PDF</option>
                          <option value="imagen">🖼️ Imagen (JPG / PNG / WEBP)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-300">Ciclo Escolar</label>
                        <input
                          type="text"
                          value={poolForm.ciclo_escolar || activeCiclo}
                          onChange={(e) => setPoolForm({ ...poolForm, ciclo_escolar: e.target.value })}
                          placeholder="Ej. 2026-3 Septiembre"
                          className="w-full bg-[#1E293B] text-xs text-emerald-300 font-bold rounded-xl px-3 py-2 border border-slate-700 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300">Título Oficial del Recurso / Carrera</label>
                      <input
                        type="text"
                        required
                        value={poolForm.titulo}
                        onChange={(e) => setPoolForm({ ...poolForm, titulo: e.target.value })}
                        placeholder="Ej. Licenciatura en Ciencias y Técnicas de la Comunicación / Horarios Mayo 2026"
                        className="w-full bg-[#1E293B] text-xs text-slate-100 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </div>

                    {/* Subida Híbrida: Archivo Local desde la Computadora o URL */}
                    <div className="p-3.5 rounded-xl bg-[#1E293B]/60 border border-amber-500/30 space-y-2.5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="text-[11px] font-extrabold text-amber-300">
                          📤 Opción A: Subir Archivo directamente desde tu Computadora (PDF, PNG, JPG, WEBP)
                        </label>
                        {poolForm.fileData && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono border border-emerald-500/40">
                              ✓ Listo para guardar: {poolForm.fileName}
                            </span>
                            <button
                              type="button"
                              onClick={() => setPoolForm({ ...poolForm, fileData: '', fileName: '' })}
                              className="text-[10px] text-red-300 hover:underline"
                            >
                              Quitar
                            </button>
                          </div>
                        )}
                      </div>

                      <input
                        type="file"
                        accept=".pdf,application/pdf,image/png,image/jpeg,image/jpg,image/webp"
                        onChange={handlePoolFileChange}
                        className="w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-amber-500 file:text-slate-950 hover:file:bg-amber-400 cursor-pointer"
                      />

                      {poolForm.fileData && poolForm.tipo_archivo === 'imagen' && (
                        <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-950 max-h-40 flex items-center justify-center">
                          <img src={poolForm.fileData} alt="Vista previa" className="max-h-40 object-contain" />
                        </div>
                      )}

                      <div className="space-y-1 pt-2 border-t border-slate-800">
                        <label className="text-[11px] font-bold text-slate-400">
                          🔗 Opción B: Ruta local o URL externa (si no subes archivo nuevo, se conserva el actual o se genera PDF oficial automático)
                        </label>
                        <input
                          type="text"
                          value={poolForm.url_recurso}
                          onChange={(e) => setPoolForm({ ...poolForm, url_recurso: e.target.value })}
                          placeholder="/uploads/recursos/... o https://..."
                          className="w-full bg-[#0F172A] text-xs text-slate-200 rounded-xl px-3 py-1.5 border border-slate-700 focus:outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-300">Modalidad / Turno</label>
                        <input
                          type="text"
                          value={poolForm.modalidad}
                          onChange={(e) => setPoolForm({ ...poolForm, modalidad: e.target.value })}
                          placeholder="Escolarizada / Ejecutiva / Online"
                          className="w-full bg-[#1E293B] text-xs text-slate-100 rounded-xl px-3 py-1.5 border border-slate-700 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-300">Duración / Detalle</label>
                        <input
                          type="text"
                          value={poolForm.duracion}
                          onChange={(e) => setPoolForm({ ...poolForm, duracion: e.target.value })}
                          placeholder="9 Cuatrimestres (3 años)"
                          className="w-full bg-[#1E293B] text-xs text-slate-100 rounded-xl px-3 py-1.5 border border-slate-700 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-300">RVOE / Referencia</label>
                        <input
                          type="text"
                          value={poolForm.rvoe}
                          onChange={(e) => setPoolForm({ ...poolForm, rvoe: e.target.value })}
                          placeholder="RVOE SEP Oficial"
                          className="w-full bg-[#1E293B] text-xs text-slate-100 rounded-xl px-3 py-1.5 border border-slate-700 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-emerald-300">
                        🤖 Contexto / Resumen para Metal-Uriel (`descripcion_ia`)
                      </label>
                      <textarea
                        rows="3"
                        value={poolForm.descripcion_ia}
                        onChange={(e) => setPoolForm({ ...poolForm, descripcion_ia: e.target.value })}
                        placeholder="Escribe qué contiene este plan, horario, beca o instalación. Metal-Uriel leerá esto para responder dudas del aspirante y enviarle este archivo."
                        className="w-full bg-[#1E293B] text-xs text-slate-100 rounded-xl p-2.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300">
                        🏷️ Palabras Clave / Sinónimos separados por coma (`tags`)
                      </label>
                      <input
                        type="text"
                        value={poolForm.tags}
                        onChange={(e) => setPoolForm({ ...poolForm, tags: e.target.value })}
                        placeholder="Ej. comunicacion, ciencias de la comunicacion, medios, periodismo, radio, tv"
                        className="w-full bg-[#1E293B] text-xs text-amber-200 rounded-xl px-3 py-1.5 border border-slate-700 focus:outline-none font-mono"
                      />
                    </div>

                    {poolMsg && poolMsg.text && (
                      <div className={`p-2.5 rounded-xl text-xs font-bold border ${
                        poolMsg.type === 'success'
                          ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                          : 'bg-red-950/80 border-red-500/40 text-red-300'
                      }`}>
                        {poolMsg.text}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setShowPoolModal(false)}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={poolSaving}
                        className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] text-slate-950 font-black text-xs shadow hover:brightness-110 transition"
                      >
                        {poolSaving ? 'Guardando...' : editingPoolId ? '💾 Guardar Cambios' : '🚀 Publicar en el Pool IA'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Grid de Recursos del Pool Multimedia */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {brochures
                .filter(b => poolCategoryFilter === 'all' || (b.categoria || 'plan_estudios') === poolCategoryFilter)
                .filter(b => {
                  if (!brochureSearch) return true;
                  const q = brochureSearch.toLowerCase();
                  return (
                    (b.titulo || b.carrera || '').toLowerCase().includes(q) ||
                    (b.descripcion_ia || '').toLowerCase().includes(q) ||
                    (Array.isArray(b.tags) ? b.tags.join(' ') : String(b.tags || '')).toLowerCase().includes(q)
                  );
                })
                .map((b) => {
                  const colorMap = {
                    amber: 'bg-amber-950/80 text-amber-300 border-amber-500/30',
                    purple: 'bg-purple-950/80 text-purple-300 border-purple-500/30',
                    emerald: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30',
                    sky: 'bg-sky-950/80 text-sky-300 border-sky-500/30',
                    rose: 'bg-rose-950/80 text-rose-300 border-rose-500/30',
                    indigo: 'bg-indigo-950/80 text-indigo-300 border-indigo-500/30'
                  };
                  const catObj = poolCategories.find(c => c.slug === (b.categoria || 'plan_estudios'));
                  const badgeText = catObj
                    ? `${catObj.icono || '📁'} ${catObj.nombre}`
                    : `📚 ${b.categoria || 'Plan de Estudios'}`;
                  const badgeColor = colorMap[catObj?.color || 'amber'] || colorMap.amber;

                  const itemCode = b.codigo_recurso || b.id || b.db_id;
                  const rawUrl = b.url_recurso || b.pdfUrl || '';
                  const resourceUrl = (rawUrl && (rawUrl.startsWith('/uploads/') || rawUrl.startsWith('/api/')))
                    ? rawUrl
                    : `/api/brochures/${encodeURIComponent(itemCode)}/download`;

                  return (
                    <div
                      key={b.db_id || b.codigo_recurso || b.id}
                      className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 hover:border-amber-400/50 transition shadow-sm space-y-2.5 flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-1.5 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${badgeColor}`}>
                            {badgeText}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-emerald-300 font-mono border border-slate-700">
                              {b.ciclo_escolar || activeCiclo}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono uppercase">
                              {b.tipo_archivo || 'pdf'}
                            </span>
                          </div>
                        </div>

                        {b.tipo_archivo === 'imagen' && resourceUrl && (
                          <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 h-36">
                            <img src={resourceUrl} alt={b.titulo || b.carrera} className="w-full h-full object-cover" />
                          </div>
                        )}

                        <h3 className="font-bold text-xs text-white leading-snug">{b.titulo || b.carrera}</h3>
                        <p className="text-[11px] text-amber-300/90 font-medium">{b.modalidad} • {b.duracion}</p>

                        {b.descripcion_ia && (
                          <p className="text-[11px] text-slate-400 line-clamp-3 leading-relaxed bg-[#1E293B]/50 p-2 rounded-xl border border-slate-800/80">
                            {b.descripcion_ia}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-800">
                        <a
                          href={resourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-1.5 px-2 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] hover:brightness-110 text-slate-950 font-black text-[11px] text-center transition shadow"
                        >
                          {b.tipo_archivo === 'imagen' ? '🖼️ Abrir Imagen' : '📥 Abrir Recurso PDF'}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleSendBrochureQuick(itemCode)}
                          className="py-1.5 px-2.5 rounded-xl bg-emerald-950 hover:bg-emerald-800 text-emerald-200 border border-emerald-500/30 font-bold text-[11px] transition"
                          title="Enviar inmediatamente al aspirante activo en el chat"
                        >
                          📤 Enviar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditPoolItem(b)}
                          className="py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] transition"
                          title="Editar recurso"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePoolItem(itemCode, b.titulo || b.carrera)}
                          className="py-1.5 px-2 rounded-xl bg-red-950/80 hover:bg-red-800 text-red-200 font-bold text-[11px] transition"
                          title="Eliminar recurso del Pool"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ====== TAB 4: INSPECTOR DE 11 DATOS IA (SOLO DESARROLLADOR) ====== */}
        {activeTab === 'inspector' && isDesarrollador && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-white">
                  Inspector de 11 Datos IA (Extracción Contextual)
                </h2>
                <p className="text-xs text-slate-400">
                  Valida en tiempo real cómo la IA extrae progresivamente los campos de la conversación.
                </p>
              </div>
            </div>

            {/* Banner de CURP Oficial Calculada por IA y Cumplimiento LFPDPPP */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-[#0F172A] border border-sky-500/40 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                    <i data-lucide="shield-check" className="w-4 h-4 text-sky-400"></i>
                    <span>CURP Oficial de Renapo (Cálculo Automático)</span>
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Metal-Uriel calcula la clave única en el backend sin pedirla al alumno en el chat.
                  </p>
                </div>
                <div className="px-3.5 py-1.5 rounded-xl bg-sky-950 border border-sky-500/40 font-mono font-black text-sm text-sky-300 tracking-widest self-start sm:self-auto shadow-inner">
                  {liveExtractedFields.curp || 'PENDIENTE DE DATOS BÁSICOS'}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0F172A] border border-emerald-500/40 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <span>🔒 Protección de Datos Personales (LFPDPPP)</span>
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Aviso de Privacidad UNID desplegado en primer contacto (<code>unid.edu.mx/aviso-de-privacidad</code>).
                  </p>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-emerald-950 border border-emerald-500/40 font-mono font-bold text-xs text-emerald-300 self-start sm:self-auto">
                  ✓ CONSENTIMIENTO ACTIVO
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {REQUIRED_FIELDS.map((field) => {
                const val = liveExtractedFields[field.key];
                const isComplete = Boolean(val && String(val).trim().length > 0);

                return (
                  <div
                    key={field.key}
                    className={`p-3 rounded-2xl border transition shadow-sm space-y-1 ${
                      isComplete
                        ? 'bg-[#0F172A] border-emerald-500/40 text-slate-100'
                        : 'bg-[#0F172A]/40 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-300 flex items-center gap-1.5">
                        <i data-lucide={field.icon} className="w-3.5 h-3.5 text-amber-400"></i>
                        {field.label}
                      </span>
                      <span className={`text-xs font-mono font-bold ${isComplete ? 'text-emerald-400' : 'text-slate-600'}`}>
                        {isComplete ? 'CAPTURADO' : 'PENDIENTE'}
                      </span>
                    </div>

                    <p className="text-xs text-amber-300 font-mono pt-1 truncate">
                      {isComplete ? String(val) : 'Esperando respuesta del aspirante...'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ====== TAB 5: MARIADB (SOLO DESARROLLADOR) ====== */}
        {activeTab === 'database' && isDesarrollador && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2">
                  <span>Gestor de Base de Datos MariaDB</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-mono border border-emerald-500/40">
                    {aspirantes.length} Registros
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Tabla <code>aspirantes</code> con persistencia relacional completa.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleSeedDemo}
                  className="px-3 py-1.5 rounded-xl bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition flex items-center gap-1.5"
                  title="Poblar la base de datos con 5 prospectos de prueba para demostración"
                >
                  <span>🌱 Poblar DB (Demo 5 Prospectos)</span>
                </button>
                <button
                  onClick={handleTruncateDb}
                  className="px-3 py-1.5 rounded-xl bg-red-950 hover:bg-red-900 border border-red-500/40 text-red-300 text-xs font-bold transition flex items-center gap-1.5"
                  title="Vaciar completamente la base de datos y la caché en memoria para testing desde cero"
                >
                  <span>🗑️ Vaciar DB + Caché (Testing)</span>
                </button>
              </div>
            </div>

            {/* Tabla MariaDB */}
            <div className="rounded-2xl border border-slate-800 bg-[#0F172A] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1E293B] text-slate-300 font-bold border-b border-slate-800">
                    <tr>
                      <th className="p-3">ID</th>
                      <th className="p-3">CURP (IA)</th>
                      <th className="p-3">Nombre Completo</th>
                      <th className="p-3">Teléfono</th>
                      <th className="p-3">Correo</th>
                      <th className="p-3">Carrera</th>
                      <th className="p-3">Bachillerato</th>
                      <th className="p-3">Etapa</th>
                      <th className="p-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {aspirantes.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="p-8 text-center text-slate-500 italic">
                          Base de datos vacía. No hay aspirantes registrados.
                        </td>
                      </tr>
                    ) : (
                      aspirantes.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-800/40 transition">
                          <td className="p-3 font-mono text-amber-400">#{a.id}</td>
                          <td className="p-3 font-mono font-bold text-sky-400">{a.curp || 'N/A'}</td>
                          <td className="p-3 font-bold text-white">{a.nombre_completo}</td>
                          <td className="p-3 font-mono">{a.telefono_celular}</td>
                          <td className="p-3">{a.correo_electronico}</td>
                          <td className="p-3 text-amber-300">{a.carrera_interes}</td>
                          <td className="p-3 text-slate-400">{a.bachillerato_procedencia || 'N/A'}</td>
                          <td className="p-3">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 font-mono">
                              {a.estado_prospecto || 'nuevo'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteLead(a.id)}
                              className="p-1 text-slate-400 hover:text-red-400 transition"
                              title="Eliminar registro"
                            >
                              <i data-lucide="trash" className="w-3.5 h-3.5"></i>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ====== TAB 6: PERSONALIDAD BOT (ADMIN) ====== */}
        {activeTab === 'prompt' && isAdmin && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-white">
                  Personalidad & System Prompt de Metal-Uriel
                </h2>
                <p className="text-xs text-slate-400">
                  Modifica las directivas operativas de los LLMs en tiempo real.
                </p>
              </div>

              <button
                onClick={handleSavePrompt}
                disabled={promptSaving}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] text-slate-950 font-black text-xs shadow hover:brightness-110 transition flex items-center gap-1.5"
              >
                <i data-lucide="save" className="w-3.5 h-3.5"></i>
                <span>{promptSaving ? 'Guardando...' : 'Guardar System Prompt'}</span>
              </button>
            </div>

            {promptSavedNotification && (
              <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <i data-lucide="check-circle" className="w-4 h-4"></i>
                <span>¡System Prompt actualizado y guardado en system_prompt.txt con éxito!</span>
              </div>
            )}

            {/* Presets */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-bold">Cargar Preset:</span>
              {promptPresets.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleApplyPreset(p)}
                  className="px-2.5 py-1 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                >
                  {p.name}
                </button>
              ))}
            </div>

            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={18}
              className="w-full bg-[#0F172A] text-xs text-slate-200 font-mono p-4 rounded-2xl border border-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-400 leading-relaxed shadow-inner"
            ></textarea>
          </div>
        )}

        {/* ====== TAB 7: CONFIGURACIÓN SEDES SAAS (SOLO DESARROLLADOR) ====== */}
        {activeTab === 'tenant_config' && isDesarrollador && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-white">
                  SaaS Multi-Sede • Conexión Meta WhatsApp Cloud API
                </h2>
                <p className="text-xs text-slate-400">
                  Configura tokens de WhatsApp y parámetros independientes para cada campus UNID del país.
                </p>
              </div>
            </div>

            {/* Selector de Sede a Configurar */}
            <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-300">Sede a Configurar:</span>
                <select
                  value={selectedTenantSlug}
                  onChange={(e) => {
                    setSelectedTenantSlug(e.target.value);
                    loadTenantDetails(e.target.value);
                  }}
                  className="bg-[#1E293B] text-xs text-amber-400 font-bold rounded-xl px-3 py-1.5 border border-slate-700 focus:outline-none cursor-pointer"
                >
                  {tenantsList.map(t => (
                    <option key={t.slug} value={t.slug}>
                      {t.nombre} ({t.slug})
                    </option>
                  ))}
                </select>
              </div>

              <form onSubmit={handleSaveTenant} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Phone Number ID (Meta)</label>
                    <input
                      type="text"
                      value={tenantForm.whatsapp_phone_number_id}
                      onChange={(e) => setTenantForm({ ...tenantForm, whatsapp_phone_number_id: e.target.value })}
                      placeholder="Ej. 1385138271342842"
                      className="w-full bg-[#1E293B] text-xs text-slate-200 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Verify Token (Webhook)</label>
                    <input
                      type="text"
                      value={tenantForm.meta_verify_token}
                      onChange={(e) => setTenantForm({ ...tenantForm, meta_verify_token: e.target.value })}
                      placeholder="unid_meta_verify_token_2026"
                      className="w-full bg-[#1E293B] text-xs text-slate-200 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Meta Access Token (EAAG...)</label>
                  <input
                    type="password"
                    value={tenantForm.whatsapp_token}
                    onChange={(e) => setTenantForm({ ...tenantForm, whatsapp_token: e.target.value })}
                    placeholder={tenantForm.hasWhatsAppToken ? 'Token guardado (dejar en blanco para mantener)' : 'Pegar token de Meta'}
                    className="w-full bg-[#1E293B] text-xs text-slate-200 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={tenantSaving}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] text-slate-950 font-black text-xs shadow hover:brightness-110 transition"
                  >
                    {tenantSaving ? 'Guardando...' : 'Guardar Configuración Sede'}
                  </button>

                  <button
                    type="button"
                    onClick={handleTestTenant}
                    disabled={tenantTesting}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition"
                  >
                    {tenantTesting ? 'Probando...' : 'Probar Conexión Meta'}
                  </button>
                </div>

                {tenantTestResult && (
                  <div className={`p-3 rounded-xl text-xs font-bold border ${
                    tenantTestResult.success
                      ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                      : 'bg-red-950/80 border-red-500/40 text-red-300'
                  }`}>
                    {tenantTestResult.success
                      ? '✅ Conexión con Meta Graph API exitosa. El número responde correctamente.'
                      : `❌ Error de conexión: ${tenantTestResult.error || 'Token inválido o expirado'}`}
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {/* ====== TAB 7.5: GESTIÓN DE USUARIOS RBAC & NOTIFICACIONES SMTP (SOLO DESARROLLADOR) ====== */}
        {activeTab === 'users_crud' && isDesarrollador && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2">
                  <i data-lucide="users" className="w-4 h-4 text-amber-400"></i>
                  <span>Control de Acceso Basado en Roles (RBAC) & Directorio de Personal</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 font-mono border border-purple-500/40">
                    {usersList.length} Cuentas
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Administra usuarios, asigna niveles de privilegio (Desarrollador, Administrador, Usuario) y vincula sedes específicas.
                </p>
              </div>
              <button
                onClick={() => { loadUsers(); loadEmailHistory(); }}
                className="px-3 py-1.5 rounded-xl bg-[#1E293B] hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto"
              >
                <i data-lucide="refresh-cw" className="w-3.5 h-3.5 text-amber-400"></i>
                <span>Sincronizar</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Formulario CRUD de Usuarios */}
              <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <h3 className="font-extrabold text-xs text-amber-400 flex items-center gap-1.5">
                    <i data-lucide={editingUserId ? "user-check" : "user-plus"} className="w-4 h-4"></i>
                    <span>{editingUserId ? `Editar Usuario #${editingUserId}` : 'Registrar Nuevo Usuario / Asesor'}</span>
                  </h3>
                  {editingUserId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUserId(null);
                        setUserForm({
                          correo_institucional: '',
                          nombre_completo: '',
                          matricula: '',
                          password: '',
                          rol: 'usuario',
                          sede_id: 'campeche',
                          activo: true
                        });
                      }}
                      className="text-[11px] text-slate-400 hover:text-white underline"
                    >
                      Cancelar edición
                    </button>
                  )}
                </div>

                <form onSubmit={handleSaveUser} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300">Nombre Completo / Puesto</label>
                    <input
                      type="text"
                      required
                      value={userForm.nombre_completo}
                      onChange={(e) => setUserForm({ ...userForm, nombre_completo: e.target.value })}
                      placeholder="Ej. Lic. Ana Gómez (Coordinadora)"
                      className="w-full bg-[#1E293B] text-xs text-slate-100 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300">Correo Institucional</label>
                      <input
                        type="email"
                        required
                        value={userForm.correo_institucional}
                        onChange={(e) => setUserForm({ ...userForm, correo_institucional: e.target.value })}
                        placeholder="usuario@red.unid.mx"
                        className="w-full bg-[#1E293B] text-xs text-slate-100 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300">Matrícula / ID</label>
                      <input
                        type="text"
                        value={userForm.matricula}
                        onChange={(e) => setUserForm({ ...userForm, matricula: e.target.value })}
                        placeholder="00774343"
                        className="w-full bg-[#1E293B] text-xs text-slate-100 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300">Rol RBAC</label>
                      <select
                        value={userForm.rol}
                        onChange={(e) => {
                          const newRol = e.target.value;
                          setUserForm({
                            ...userForm,
                            rol: newRol,
                            sede_id: newRol === 'desarrollador' ? '' : (userForm.sede_id || 'campeche')
                          });
                        }}
                        className="w-full bg-[#1E293B] text-xs text-amber-300 font-bold rounded-xl px-3 py-2 border border-slate-700 focus:outline-none cursor-pointer"
                      >
                        <option value="desarrollador">Rol 1: Desarrollador (Superadmin)</option>
                        <option value="administrador">Rol 2: Administrador (Gerente Sede)</option>
                        <option value="usuario">Rol 3: Usuario (Asesor Admisiones)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300">Sede Asignada (sede_id)</label>
                      {userForm.rol === 'desarrollador' ? (
                        <div className="w-full bg-slate-900 text-xs text-purple-300 font-mono rounded-xl px-3 py-2 border border-purple-500/30">
                          GLOBAL (Todas las Sedes)
                        </div>
                      ) : (
                        <select
                          value={userForm.sede_id || 'campeche'}
                          onChange={(e) => setUserForm({ ...userForm, sede_id: e.target.value })}
                          className="w-full bg-[#1E293B] text-xs text-sky-300 font-bold rounded-xl px-3 py-2 border border-slate-700 focus:outline-none cursor-pointer"
                        >
                          {campusesList.map((c) => {
                            const campusId = c.id || c.slug;
                            const campusName = c.name || c.nombre;
                            return (
                              <option key={campusId} value={campusId}>
                                {campusName} ({campusId})
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300">
                      {editingUserId ? 'Nueva Contraseña (dejar en blanco para conservar)' : 'Contraseña de Acceso'}
                    </label>
                    <input
                      type="password"
                      required={!editingUserId}
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      placeholder={editingUserId ? '•••••••• (Sin cambios)' : 'Contraseña segura'}
                      className="w-full bg-[#1E293B] text-xs text-slate-100 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userForm.activo}
                        onChange={(e) => setUserForm({ ...userForm, activo: e.target.checked })}
                        className="rounded border-slate-600 text-amber-500 focus:ring-amber-400"
                      />
                      <span>Cuenta Activa</span>
                    </label>

                    <button
                      type="submit"
                      disabled={usersLoading}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] text-slate-950 font-black text-xs shadow hover:brightness-110 transition"
                    >
                      {usersLoading ? 'Guardando...' : editingUserId ? 'Actualizar Usuario' : 'Crear Usuario'}
                    </button>
                  </div>

                  {userFormMsg && userFormMsg.text && (
                    <div className={`p-2.5 rounded-xl text-xs font-bold border ${
                      userFormMsg.type === 'success'
                        ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                        : 'bg-red-950/80 border-red-500/40 text-red-300'
                    }`}>
                      {userFormMsg.text}
                    </div>
                  )}
                </form>
              </div>

              {/* Tabla de Usuarios Registrados */}
              <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#0F172A] overflow-hidden shadow-sm flex flex-col">
                <div className="p-3.5 border-b border-slate-800 bg-[#1E293B]/60 flex items-center justify-between">
                  <span className="text-xs font-extrabold text-white">Cuentas Activas en MariaDB (Tabla `usuarios`)</span>
                  <span className="text-[11px] text-slate-400 font-mono">Passwords protegidos con Scrypt Hash</span>
                </div>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1E293B] text-slate-300 font-bold border-b border-slate-800">
                      <tr>
                        <th className="p-3">ID</th>
                        <th className="p-3">Usuario / Correo</th>
                        <th className="p-3">Rol RBAC</th>
                        <th className="p-3">Sede (`sede_id`)</th>
                        <th className="p-3">Estado</th>
                        <th className="p-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-200">
                      {usersList.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-800/40 transition">
                          <td className="p-3 font-mono text-amber-400">#{u.id}</td>
                          <td className="p-3">
                            <div className="font-bold text-white">{u.nombre_completo}</div>
                            <div className="font-mono text-[11px] text-slate-400">{u.correo_institucional}</div>
                          </td>
                          <td className="p-3">
                            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold border ${
                              u.rol === 'desarrollador'
                                ? 'bg-purple-950/90 text-purple-300 border-purple-500/40'
                                : u.rol === 'administrador'
                                ? 'bg-amber-950/90 text-amber-300 border-amber-500/40'
                                : 'bg-sky-950/90 text-sky-300 border-sky-500/40'
                            }`}>
                              {u.rol.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-xs">
                            {u.rol === 'desarrollador' || !u.sede_id ? (
                              <span className="text-purple-300 font-bold">🌐 GLOBAL (Todas)</span>
                            ) : (
                              <span className="text-emerald-300 font-bold uppercase">{u.sede_id}</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                              u.activo ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'
                            }`}>
                              {u.activo ? 'ACTIVO' : 'INACTIVO'}
                            </span>
                          </td>
                          <td className="p-3 text-right space-x-1.5">
                            <button
                              onClick={() => handleEditUserClick(u)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 text-[11px] font-bold transition"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDeleteUserClick(u.id)}
                              className="px-2.5 py-1 rounded-lg bg-red-950/80 hover:bg-red-700 text-red-200 text-[11px] font-bold transition"
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Configuración SMTP en Vivo (Gmail App Password para Luisquintero2001@gmail.com) */}
            <div className="p-4 rounded-2xl bg-[#0F172A] border border-emerald-500/40 space-y-3 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div>
                  <h3 className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-2">
                    <span>🔑 Configuración SMTP en Vivo (Gmail App Password)</span>
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold border ${
                      smtpInfo.hasPassword
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                        : 'bg-amber-950 text-amber-300 border-amber-500/40'
                    }`}>
                      {smtpInfo.hasPassword ? `✓ CONECTADO (${smtpInfo.maskedPass})` : '⚠️ FALTA APP PASSWORD DE GMAIL'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Para recibir los correos reales en <strong>Luisquintero2001@gmail.com</strong>: ve a tu Cuenta de Google → Seguridad → Verificación en 2 pasos → <strong>Contraseñas de aplicaciones</strong>, genera una clave de 16 letras y pégala aquí.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveSmtpSettings} className="grid grid-cols-1 md:grid-cols-4 gap-2.5 items-end">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300">Servidor SMTP</label>
                  <input
                    type="text"
                    value={smtpForm.host}
                    onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                    className="w-full bg-[#1E293B] text-xs text-slate-200 rounded-xl px-3 py-2 border border-slate-700 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300">Correo Remitente Gmail (`SMTP_USER`)</label>
                  <input
                    type="email"
                    required
                    value={smtpForm.user}
                    onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value })}
                    className="w-full bg-[#1E293B] text-xs text-amber-300 font-bold rounded-xl px-3 py-2 border border-slate-700 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-emerald-300">Contraseña de Aplicación Google (16 letras)</label>
                  <input
                    type="password"
                    required
                    value={smtpForm.pass}
                    onChange={(e) => setSmtpForm({ ...smtpForm, pass: e.target.value })}
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="w-full bg-[#1E293B] text-xs text-slate-100 rounded-xl px-3 py-2 border border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-400 font-mono"
                  />
                </div>
                <div>
                  <button
                    type="submit"
                    disabled={smtpSaving}
                    className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-slate-950 font-black text-xs transition shadow"
                  >
                    {smtpSaving ? 'Guardando...' : '💾 Guardar y Activar SMTP Real'}
                  </button>
                </div>
              </form>

              {smtpMsg && smtpMsg.text && (
                <div className={`p-2.5 rounded-xl text-xs font-bold border ${
                  smtpMsg.type === 'success'
                    ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                    : 'bg-red-950/80 border-red-500/40 text-red-300'
                }`}>
                  {smtpMsg.text}
                </div>
              )}
            </div>

            {/* Panel de Notificaciones por Correo Electrónico (Nodemailer -> Luisquintero2001@gmail.com) */}
            <div className="p-4 rounded-2xl bg-[#0F172A] border border-amber-500/30 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-2">
                    <span>📧 Monitor & Simulador de Triggers Nodemailer</span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-300 font-mono border border-amber-500/40">
                      Destino: Luisquintero2001@gmail.com
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Todos los eventos se disparan automáticamente en tiempo real y generan vista previa si no hay credenciales SMTP de producción.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleTestEmailTrigger('NUEVO_CONTACTO')}
                    disabled={emailTesting}
                    className="px-3 py-1.5 rounded-xl bg-sky-950 hover:bg-sky-900 border border-sky-500/40 text-sky-200 text-[11px] font-bold transition disabled:opacity-50"
                  >
                    ⚡ Probar Evento A (Nuevo Contacto)
                  </button>
                  <button
                    onClick={() => handleTestEmailTrigger('DATOS_COMPLETOS')}
                    disabled={emailTesting}
                    className="px-3 py-1.5 rounded-xl bg-amber-950 hover:bg-amber-900 border border-amber-500/40 text-amber-200 text-[11px] font-bold transition disabled:opacity-50"
                  >
                    ⚡ Probar Evento B (11 Datos JSON)
                  </button>
                  <button
                    onClick={() => handleTestEmailTrigger('CIERRE_INSCRITO')}
                    disabled={emailTesting}
                    className="px-3 py-1.5 rounded-xl bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold transition disabled:opacity-50"
                  >
                    ⚡ Probar Evento C (Alumno Inscrito)
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1E293B] text-slate-300 font-bold border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Hora</th>
                      <th className="p-2.5">Trigger</th>
                      <th className="p-2.5">Destinatario</th>
                      <th className="p-2.5">Asunto</th>
                      <th className="p-2.5">Estado / Transporte</th>
                      <th className="p-2.5 text-right">Vista Previa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {emailLogs.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="p-6 text-center text-slate-500 italic">
                          Aún no se han disparado notificaciones en esta sesión. Usa los botones de arriba o interactúa en el Chat / Kanban.
                        </td>
                      </tr>
                    ) : (
                      emailLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-800/40">
                          <td className="p-2.5 font-mono text-[11px] text-slate-400">
                            {new Date(log.timestamp || log.fecha).toLocaleTimeString('es-MX')}
                          </td>
                          <td className="p-2.5 font-mono font-bold text-amber-300">{log.eventoTipo || log.evento}</td>
                          <td className="p-2.5 font-mono text-emerald-300">{log.to || log.destinatario}</td>
                          <td className="p-2.5 font-semibold text-white">{log.subject || log.asunto}</td>
                          <td className="p-2.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-mono border border-emerald-500/30">
                              {log.status || log.estado} ({log.transport || 'SMTP'})
                            </span>
                          </td>
                          <td className="p-2.5 text-right">
                            {log.previewUrl ? (
                              <a
                                href={log.previewUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition"
                              >
                                Abrir Correo ↗
                              </a>
                            ) : (
                              <span className="text-[11px] text-slate-500 font-mono">SMTP Directo</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ====== TAB 8: SOPORTE & ONBOARDING (TODOS LOS ROLES) ====== */}
        {activeTab === 'onboarding' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-white">
                  Guía de Onboarding & Soporte Técnico UNID
                </h2>
                <p className="text-xs text-slate-400">
                  Documentación interactiva para administradores y asesores de admisiones.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-2">
                <span className="text-xl">🚀</span>
                <h3 className="font-extrabold text-xs text-white">1. Inicio Rápido</h3>
                <p className="text-[11px] text-slate-400">
                  Abre ngrok con <code>npx ngrok http 3000</code> y vincula el webhook en Meta Developers con el token <code>unid_meta_verify_token_2026</code>.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-2">
                <span className="text-xl">💬</span>
                <h3 className="font-extrabold text-xs text-white">2. Human Handover</h3>
                <p className="text-[11px] text-slate-400">
                  En la Bandeja de Entrada, presiona <b>Pausar IA</b> para tomar control humano del chat y responder dudas específicas por WhatsApp.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-2">
                <span className="text-xl">🛡️</span>
                <h3 className="font-extrabold text-xs text-white">3. Multi-Model Failover</h3>
                <p className="text-[11px] text-slate-400">
                  El sistema conmuta automáticamente entre Gemini, Claude, OpenAI, DeepSeek y Groq si se agota la cuota, preservando todo el historial.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================= MODAL: LABORATORIO DE PRUEBAS IA ================= */}
      {showTestSuiteModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#0F172A] border border-purple-500/40 rounded-3xl w-full max-w-2xl shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <i data-lucide="flask-conical" className="w-4 h-4 text-amber-400"></i>
                <span>Laboratorio de Pruebas & Anti-Alucinaciones</span>
              </h3>
              <button onClick={() => setShowTestSuiteModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {TEST_SUITE_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedTestCategory(cat.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                    selectedTestCategory === cat.id
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {cat.title}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {TEST_SUITE_CATEGORIES.find(c => c.id === selectedTestCategory)?.cases.map((testCase, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-[#1E293B] border border-slate-700 space-y-2 hover:border-amber-400/50 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-xs text-white">{testCase.title}</h4>
                    <button
                      onClick={() => {
                        setShowTestSuiteModal(false);
                        setActiveTab('inbox');
                        setIsAdvisorMode(false);
                        handleSendMessage(testCase.text);
                      }}
                      className="px-3 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-[11px] shadow transition"
                    >
                      Ejecutar en Simulador ▶
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">{testCase.desc}</p>
                  <p className="text-xs text-amber-300 font-mono bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                    "{testCase.text}"
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: SALUD Y SEMÁFORO ================= */}
      {showHealthModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#0F172A] border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <i data-lucide="activity" className="w-4 h-4 text-emerald-400"></i>
                <span>Monitor de Salud y Estado de Servicios</span>
              </h3>
              <button onClick={() => setShowHealthModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#1E293B]">
                <span className="font-bold text-slate-200">Servidor Node.js (API)</span>
                <span className="text-emerald-400 font-bold font-mono">ONLINE</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#1E293B]">
                <span className="font-bold text-slate-200">Base de Datos MariaDB</span>
                <span className="text-emerald-400 font-bold font-mono">CONECTADA</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#1E293B]">
                <span className="font-bold text-slate-200">Proveedor de Inferencia Activo</span>
                <span className="text-amber-400 font-bold font-mono">{selectedModel}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#1E293B]">
                <span className="font-bold text-slate-200">Webhook de Meta WhatsApp</span>
                <span className="text-sky-400 font-bold font-mono">/webhook (LISTO)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: INICIO DE SESIÓN INSTITUCIONAL ================= */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-amber-500/40 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FFC72C] to-red-600 flex items-center justify-center text-xl mx-auto shadow-lg mb-2">
                🐺
              </div>
              <h2 className="font-black text-lg text-white">:UNID Centro de Mando</h2>
              <p className="text-xs text-slate-400">Metal-Uriel • Plataforma de Admisiones Institucional</p>
            </div>

            {/* Toggle Office 365 vs Local */}
            <div className="flex rounded-xl bg-[#1E293B] p-1 border border-slate-700">
              <button
                type="button"
                onClick={() => setAuthTab('o365')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                  authTab === 'o365' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400'
                }`}
              >
                Microsoft Office 365
              </button>
              <button
                type="button"
                onClick={() => setAuthTab('local')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                  authTab === 'local' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400'
                }`}
              >
                Acceso Local
              </button>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-3">
              {authTab === 'o365' ? (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Correo Institucional (@red.unid.mx)</label>
                    <input
                      type="email"
                      value={o365Email}
                      onChange={(e) => setO365Email(e.target.value)}
                      placeholder="00774343@red.unid.mx"
                      required
                      className="w-full bg-[#1E293B] text-xs text-slate-100 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Contraseña Institucional</label>
                    <input
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      placeholder="admin, admin2026 o user"
                      required
                      className="w-full bg-[#1E293B] text-xs text-slate-100 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Usuario o Matrícula</label>
                    <input
                      type="text"
                      value={loginForm.username}
                      onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                      placeholder="00774343"
                      required
                      className="w-full bg-[#1E293B] text-xs text-slate-100 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Contraseña</label>
                    <input
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      placeholder="••••••••"
                      required
                      className="w-full bg-[#1E293B] text-xs text-slate-100 rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </div>
                </>
              )}

              {loginForm.error && (
                <p className="text-xs text-red-400 font-bold">{loginForm.error}</p>
              )}

              <button
                type="submit"
                disabled={loginForm.loading}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] text-slate-950 font-black text-xs shadow hover:brightness-110 transition"
              >
                {loginForm.loading ? 'Iniciando Sesión...' : 'Ingresar al Centro de Mando'}
              </button>
            </form>

            <div className="p-2.5 rounded-xl bg-[#1E293B]/60 border border-slate-800 text-[10px] text-slate-400 space-y-1.5 font-mono">
              <span className="font-bold text-amber-300 block">Acceso Rápido RBAC (Testing 1-Click):</span>
              <div className="grid grid-cols-1 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('o365');
                    setO365Email('00774343@red.unid.mx');
                    setLoginForm({ ...loginForm, username: '00774343', password: 'admin', error: '' });
                  }}
                  className="text-left px-2 py-1 rounded bg-purple-950/60 hover:bg-purple-900/80 border border-purple-500/30 text-purple-200 transition flex items-center justify-between"
                >
                  <span>🛠️ Rol 1 (Desarrollador Global)</span>
                  <span>00774343@red.unid.mx / admin</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('o365');
                    setO365Email('admin.campeche@red.unid.mx');
                    setLoginForm({ ...loginForm, username: '00881122', password: 'admin2026', error: '' });
                  }}
                  className="text-left px-2 py-1 rounded bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/30 text-amber-200 transition flex items-center justify-between"
                >
                  <span>🏛️ Rol 2 (Admin Sede Campeche)</span>
                  <span>admin.campeche@... / admin2026</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('o365');
                    setO365Email('67676767@red.unid.mx');
                    setLoginForm({ ...loginForm, username: '67676767', password: 'user', error: '' });
                  }}
                  className="text-left px-2 py-1 rounded bg-sky-950/60 hover:bg-sky-900/80 border border-sky-500/30 text-sky-200 transition flex items-center justify-between"
                >
                  <span>🎧 Rol 3 (Usuario Asesor)</span>
                  <span>67676767@red.unid.mx / user</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Renderizado principal en React 18
const rootElement = document.getElementById('root');
if (ReactDOM.createRoot) {
  ReactDOM.createRoot(rootElement).render(<App />);
} else {
  ReactDOM.render(<App />, rootElement);
}
