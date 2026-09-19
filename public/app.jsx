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
    id: 'caso_real_elvira',
    title: '⭐ 0. Caso Real de Éxito: Flujo Elvira (Inscripción & Pasarela Mitec)',
    cases: [
      {
        title: 'Paso 1: Solicitud de Información (Ing. Software y Sistemas)',
        desc: 'Inicia plática como Luis Felipe preguntando por la ingeniería',
        text: 'Buenas tardes, me gustaría pedir informes sobre la Ingeniería en Software y Sistemas Computacionales para el campus Campeche.'
      },
      {
        title: 'Paso 2: Entrega de los 11 Datos Obligatorios',
        desc: 'Datos reales de aspirante para ficha oficial',
        text: 'Claro que sí, me llamo Luis Felipe Pérez, nací el 2003-08-14 en Campeche. Hombre. Mi cel es 9811234567, correo luis.felipe@gmail.com. Egresé del COBACAM 01. Me interesa Ing. en Software y Sistemas Computacionales en modalidad Presencial en Campus Campeche. Vivo en Calle 10 #45 Col. Miramar, CP 24020.'
      },
      {
        title: 'Paso 3: Consulta de Costos, Beca y Pasarela Mitec',
        desc: 'Pregunta sobre la promoción del 90% en inscripción y mensualidades',
        text: '¿Cuánto sería el costo de la inscripción con descuento y la mensualidad con la beca del 50%? ¿Cómo puedo realizar el pago en línea?'
      },
      {
        title: 'Paso 4: Solicitud de Requisitos y Curso de Inducción',
        desc: 'Pregunta qué documentos llevar al campus y horarios',
        text: 'Ya realicé el pago en Mitec. ¿Qué papelería debo entregar en el campus y cuándo es el curso de inducción?'
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

// Formateador de tiempo relativo para el Kanban
function formatTimeAgo(dateStr) {
  if (!dateStr) return 'Reciente';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Reciente';
  
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  
  if (diffSec < 60) return 'Hace un momento';
  if (diffSec < 3600) return `Hace ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `Hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  if (diffSec < 172800) return 'Ayer ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function App() {
  // ================= ESTADOS PRINCIPALES =================
  const [phone, setPhone] = useState('+529811234567');
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: '¡Hola! 🐺 *Bip-bop* 🤖 Soy Metal-Uriel, embajador y asesor inteligente de admisiones de la UNID. ¡Estoy aquí para orientarte en tu proceso de admisión, costos, becas y planes de estudio oficiales! ¿Cómo te llamas y qué carrera te gustaría estudiar?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'auto-fallback'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('kanban'); // 'kanban' | 'analytics' | 'brochures' | 'database' | 'inspector' | 'prompt' | 'tenant_config' | 'onboarding'
  const [aspirantes, setAspirantes] = useState([]);
  const [lastCompletedLead, setLastCompletedLead] = useState(null);
  const [liveExtractedFields, setLiveExtractedFields] = useState({});
  const [selectedLead, setSelectedLead] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);

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

  // Catálogo Oficial de Folletos & Planes de Estudio (Lectura y Descarga Directa)
  const [brochures, setBrochures] = useState([]);
  const [brochureFilter, setBrochureFilter] = useState('all'); // 'all' | 'campus_campeche' | 'ejecutiva_campeche' | 'unid_nacional'
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
  const [authTab, setAuthTab] = useState('o365'); // 'o365' | 'local'
  const [o365Email, setO365Email] = useState('00774343@red.unid.mx');
  const [o365Name, setO365Name] = useState('Luis Felipe Pérez (Admin Sistemas)');
  const [loginForm, setLoginForm] = useState({ username: '00774343@red.unid.mx', password: 'admin', error: '', loading: false });

  // Banda Sonora Cibernética de Metal Sonic (YouTube OST @ 1515s)
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

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const careerChartRef = useRef(null);
  const originChartRef = useRef(null);
  const statusChartRef = useRef(null);
  const chartInstances = useRef({});

  // Cargar estado inicial
  useEffect(() => {
    fetchHealthFull();
    loadCampuses();
    loadModels();
    loadAspirantes();
    loadPromptData();
    loadAnalytics();
    loadBrochures();
    loadTenants();
    loadTenantDetails('campeche');

    const interval = setInterval(fetchHealthFull, 12000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll en el chat
  useEffect(() => {
    if (autoScroll && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, autoScroll]);

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

  // ================= MÉTODOS DE API =================
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

  const loadBrochures = async () => {
    try {
      const res = await fetch('/api/brochures');
      const data = await res.json();
      if (data.brochures) {
        setBrochures(data.brochures);
      }
    } catch (e) {
      console.error('Error cargando planes de estudio:', e);
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

  const loadAspirantes = async () => {
    try {
      const res = await fetch('/api/aspirantes');
      const data = await res.json();
      if (data.success) {
        setAspirantes(data.data || []);
      }
    } catch (e) {
      console.error('Error cargando aspirantes:', e);
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
    if (!confirm('¿Deseas recargar la base de datos con prospectos institucionales de demostración?')) return;
    try {
      const res = await fetch('/api/aspirantes/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        loadAspirantes();
        loadAnalytics();
        alert('✅ Datos de demostración cargados exitosamente.');
      }
    } catch (e) {
      alert('Error cargando demo: ' + e.message);
    }
  };

  const handleTruncateDb = async () => {
    if (!confirm('⚠️ ¿Estás COMPLETAMENTE seguro de eliminar TODOS los prospectos de la base de datos MariaDB? Esta acción es solo para propósitos de testing y no se puede deshacer.')) return;
    try {
      const res = await fetch('/api/aspirantes/all', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setAspirantes([]);
        setSelectedLead(null);
        setLastCompletedLead(null);
        setLiveExtractedFields({});
        loadAnalytics();
        alert('🗑️ Base de datos vaciada exitosamente. 0 registros de aspirantes.');
      } else {
        alert('Error al vaciar base de datos: ' + (data.error || 'Error desconocido'));
      }
    } catch (err) {
      alert('Error de conexión al vaciar DB: ' + err.message);
    }
  };

  const handleUpdateStatus = async (aspiranteId, nuevoEstado) => {
    try {
      setAspirantes(prev => prev.map(a => a.id === aspiranteId ? { ...a, estado_prospecto: nuevoEstado } : a));
      const res = await fetch(`/api/aspirantes/${aspiranteId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado })
      });
      const data = await res.json();
      if (data.success) {
        loadAnalytics();
      } else {
        loadAspirantes();
      }
    } catch (e) {
      console.error('Error actualizando estado Kanban:', e);
      loadAspirantes();
    }
  };

  const handleArchiveLead = async (aspiranteId, currentArchived) => {
    const nextArchived = !currentArchived;
    try {
      setAspirantes(prev => prev.map(a => a.id === aspiranteId ? { ...a, archivado: nextArchived ? 1 : 0 } : a));
      const res = await fetch(`/api/aspirantes/${aspiranteId}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivado: nextArchived })
      });
      const data = await res.json();
      if (data.success) {
        loadAnalytics();
      } else {
        loadAspirantes();
      }
    } catch (e) {
      console.error('Error archivando prospecto:', e);
      loadAspirantes();
    }
  };

  const handleDeleteLead = async (aspiranteId, nombre) => {
    if (!confirm(`¿Eliminar definitivamente el registro de "${nombre || 'este aspirante'}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/aspirantes/${aspiranteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        if (selectedLead && selectedLead.id === aspiranteId) setSelectedLead(null);
        loadAspirantes();
        loadAnalytics();
      } else {
        alert('Error eliminando: ' + data.error);
      }
    } catch (e) {
      alert('Error eliminando prospecto: ' + e.message);
    }
  };

  const handleSavePrompt = async () => {
    setPromptSaving(true);
    try {
      const res = await fetch('/api/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: customPrompt })
      });
      const data = await res.json();
      if (data.success) {
        setPromptSavedNotification(true);
        setTimeout(() => setPromptSavedNotification(false), 4000);
      }
    } catch (e) {
      alert('Error guardando prompt: ' + e.message);
    } finally {
      setPromptSaving(false);
    }
  };

  const handleSelectPreset = (presetPrompt) => {
    setCustomPrompt(presetPrompt);
  };

  // SaaS Multi-Tenant Handlers
  const loadTenants = async () => {
    try {
      const res = await fetch('/api/tenants');
      const data = await res.json();
      if (data.success && data.tenants) {
        setTenantsList(data.tenants);
      }
    } catch (e) {
      console.error('Error cargando sedes:', e);
    }
  };

  const loadTenantDetails = async (slug) => {
    setTenantLoading(true);
    setTenantTestResult(null);
    try {
      const res = await fetch(`/api/tenants/${slug}`);
      const data = await res.json();
      if (data.success && data.tenant) {
        const t = data.tenant;
        setTenantForm({
          whatsapp_phone_number_id: t.whatsapp_phone_number_id || '',
          whatsapp_token: '',
          maskedWhatsAppToken: t.maskedWhatsAppToken || '',
          hasWhatsAppToken: t.hasWhatsAppToken || false,
          meta_verify_token: t.meta_verify_token || 'unid_meta_verify_token_2026',
          email_notificaciones: t.email_notificaciones || '',
          custom_prompt: t.custom_prompt || '',
          gemini_key: '',
          hasGeminiKey: t.hasGeminiKey || false,
          openai_key: '',
          hasOpenAiKey: t.hasOpenAiKey || false,
          activa: t.activa !== undefined ? t.activa : true
        });
      }
    } catch (e) {
      console.error('Error cargando detalle de sede:', e);
    } finally {
      setTenantLoading(false);
    }
  };

  const handleSelectTenant = (slug) => {
    setSelectedTenantSlug(slug);
    loadTenantDetails(slug);
  };

  const handleSaveTenant = async (e) => {
    if (e) e.preventDefault();
    setTenantSaving(true);
    setTenantTestResult(null);
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setTenantSaveSuccess(true);
        setTimeout(() => setTenantSaveSuccess(false), 4000);
        loadTenants();
        loadTenantDetails(selectedTenantSlug);
      } else {
        alert('Error guardando sede: ' + (data.error || 'Error desconocido'));
      }
    } catch (err) {
      alert('Error de conexión al guardar sede: ' + err.message);
    } finally {
      setTenantSaving(false);
    }
  };

  const handleTestTenantWhatsApp = async () => {
    setTenantTesting(true);
    setTenantTestResult(null);
    try {
      const res = await fetch(`/api/tenants/${selectedTenantSlug}/test-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setTenantTestResult(data);
    } catch (err) {
      setTenantTestResult({ success: false, error: 'Error de conexión: ' + err.message });
    } finally {
      setTenantTesting(false);
    }
  };

  const handleCopyWebhook = () => {
    const url = `${window.location.origin}/webhook`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 3000);
    });
  };

  // Enviar mensaje en el simulador
  const handleSendMessage = async (customText = null) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim() || isLoading) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setInputText('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone,
          message: textToSend,
          model: selectedModel
        })
      });

      const data = await res.json();

      const botMsg = {
        id: Date.now() + 1,
        sender: 'bot',
        text: data.reply || 'No hubo respuesta del servidor.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: data.modelUsed || selectedModel,
        fallbackTriggered: data.fallbackTriggered,
        documentAttachment: data.documentAttachment
      };

      setMessages(prev => [...prev, botMsg]);

      // Actualización progresiva en tiempo real de los 11 campos extraídos por IA
      if (data.partialFields && Object.keys(data.partialFields).length > 0) {
        setLiveExtractedFields(prev => ({ ...prev, ...data.partialFields }));
      }

      if (data.leadCompleted && data.leadData) {
        setLastCompletedLead(data.leadData);
        setLiveExtractedFields(prev => ({ ...prev, ...data.leadData }));
        loadAspirantes();
        loadAnalytics();
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'bot',
          text: '⚠️ Error de conexión con el servicio de IA. Verifica que el servidor esté activo.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 100);
    }
  };

  const handleResetSession = async () => {
    try {
      await fetch('/api/session/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      setMessages([
        {
          id: 1,
          sender: 'bot',
          text: '¡Hola de nuevo! 🐺 *Bip-bop* 🤖 Soy Metal-Uriel, tu asesor inteligente de la UNID. ¿Cómo te llamas y qué carrera te gustaría estudiar?',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modelUsed: selectedModel
        }
      ]);
      setLastCompletedLead(null);
      setLiveExtractedFields({});
    } catch (e) {
      console.error('Error reiniciando sesión:', e);
    }
  };

  // Ejecutar caso de prueba del Laboratorio Flotante
  const handleRunTestCase = (testCase) => {
    setShowTestSuiteModal(false);
    handleSendMessage(testCase.text);
  };

  // Control de BGM Metal Sonic
  const toggleBgmPlay = () => {
    const iframe = document.getElementById('metal-sonic-bgm-iframe');
    if (!iframe) return;
    if (isPlayingBgm) {
      iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
      setIsPlayingBgm(false);
    } else {
      iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
      setIsPlayingBgm(true);
    }
  };

  const toggleBgmMute = () => {
    const iframe = document.getElementById('metal-sonic-bgm-iframe');
    if (!iframe) return;
    if (isMutedBgm) {
      iframe.contentWindow.postMessage('{"event":"command","func":"unMute","args":""}', '*');
      setIsMutedBgm(false);
    } else {
      iframe.contentWindow.postMessage('{"event":"command","func":"mute","args":""}', '*');
      setIsMutedBgm(true);
    }
  };

  // Iniciar sesión Office 365 / Local
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginForm(prev => ({ ...prev, loading: true, error: '' }));

    try {
      let res;
      if (authTab === 'o365') {
        res = await fetch('/api/auth/o365', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: o365Email, name: o365Name })
        });
      } else {
        res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: loginForm.username, password: loginForm.password })
        });
      }

      const data = await res.json();
      if (data.token) {
        setAuthToken(data.token);
        setAuthUser(data.user);
        localStorage.setItem('metal_uriel_jwt', data.token);
        localStorage.setItem('metal_uriel_user', JSON.stringify(data.user));
        setShowLoginModal(false);

        // Autoplay BGM Metal Sonic al autenticar exitosamente
        const iframe = document.getElementById('metal-sonic-bgm-iframe');
        if (iframe) {
          iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
          setIsPlayingBgm(true);
        }
      } else {
        setLoginForm(prev => ({ ...prev, error: data.error || 'Credenciales inválidas.' }));
      }
    } catch (err) {
      setLoginForm(prev => ({ ...prev, error: 'Error de conexión con el servidor.' }));
    } finally {
      setLoginForm(prev => ({ ...prev, loading: false }));
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setAuthUser(null);
    localStorage.removeItem('metal_uriel_jwt');
    localStorage.removeItem('metal_uriel_user');
    setShowLoginModal(true);
  };

  const isAdmin = authUser?.role === 'admin';

  // Proteger pestañas de administración contra usuarios del equipo operativo
  useEffect(() => {
    if (!isAdmin && ['database', 'prompt', 'tenant_config'].includes(activeTab)) {
      setActiveTab('kanban');
    }
  }, [isAdmin, activeTab]);

  // Filtros de Prospectos para la base de datos y Kanban
  const filteredAspirantes = useMemo(() => {
    return aspirantes.filter(asp => {
      // Filtro de Sede / Campus
      if (selectedCampus !== 'all' && selectedCampus !== 'todas') {
        const campusMatch = (asp.campus_interes || '').toLowerCase();
        if (selectedCampus === 'campeche' && !campusMatch.includes('campeche')) return false;
        if (selectedCampus === 'online_nacional' && !campusMatch.includes('virtual') && !campusMatch.includes('online')) return false;
        if (selectedCampus !== 'campeche' && selectedCampus !== 'online_nacional') {
          const cObj = campusesList.find(c => c.id === selectedCampus);
          if (cObj && !campusMatch.includes(cObj.name.toLowerCase().replace('campus ', ''))) return false;
        }
      }

      // Filtro de Activos vs Archivados
      if (showArchiveView) {
        if (!asp.archivado) return false;
      } else {
        if (asp.archivado) return false;
      }

      // Filtros del Visor de DB
      if (dbFilter === 'local' && asp.es_foraneo) return false;
      if (dbFilter === 'foraneo' && !asp.es_foraneo) return false;
      if (dbFilter === 'alta_prioridad' && asp.nivel_interes !== 'Alto') return false;

      if (!dbSearch.trim()) return true;
      const query = dbSearch.toLowerCase();
      return (
        (asp.nombre_completo && asp.nombre_completo.toLowerCase().includes(query)) ||
        (asp.carrera_interes && asp.carrera_interes.toLowerCase().includes(query)) ||
        (asp.telefono_celular && asp.telefono_celular.includes(query)) ||
        (asp.correo_electronico && asp.correo_electronico.toLowerCase().includes(query)) ||
        (asp.campus_interes && asp.campus_interes.toLowerCase().includes(query))
      );
    });
  }, [aspirantes, selectedCampus, showArchiveView, dbFilter, dbSearch, campusesList]);

  // Filtros de Planes de Estudio Oficiales
  const filteredBrochures = useMemo(() => {
    return brochures.filter(b => {
      if (brochureFilter === 'campus_campeche' && b.scope !== 'campus_campeche') return false;
      if (brochureFilter === 'ejecutiva_campeche' && b.scope !== 'ejecutiva_campeche') return false;
      if (brochureFilter === 'unid_nacional' && b.scope !== 'unid_nacional') return false;

      if (!brochureSearch.trim()) return true;
      const q = brochureSearch.toLowerCase();
      const matchName = b.carrera && b.carrera.toLowerCase().includes(q);
      const matchRvoe = b.rvoe && b.rvoe.toLowerCase().includes(q);
      const matchModalidad = b.modalidad && b.modalidad.toLowerCase().includes(q);
      const matchTags = Array.isArray(b.tags) && b.tags.some(t => String(t).toLowerCase().includes(q));
      return matchName || matchRvoe || matchModalidad || matchTags;
    });
  }, [brochures, brochureFilter, brochureSearch]);

  const activeLeadsCount = aspirantes.filter(a => !a.archivado).length;
  const archivedLeadsCount = aspirantes.filter(a => Boolean(a.archivado)).length;

  const totalForaneos = aspirantes.filter(a => a.es_foraneo).length;
  const totalLocales = aspirantes.length - totalForaneos;
  const totalAltaPrioridad = aspirantes.filter(a => (a.nivel_interes || 'Alto') === 'Alto').length;

  const isForaneoDetected = messages.some(m => 
    /tabasco|villahermosa|yucatan|merida|cdmx|mexico|puebla|veracruz|guadalajara|monterrey|foraneo|foránea|foráneo/i.test(m.text)
  );

  const selectedCampusName = useMemo(() => {
    const found = campusesList.find(c => c.id === selectedCampus);
    return found ? found.name : 'Campus San Francisco de Campeche';
  }, [campusesList, selectedCampus]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0A192F] text-slate-100 font-sans">
      
      {/* ================= BARRA SUPERIOR INSTITUCIONAL (:UNID) ================= */}
      <header className="h-16 border-b border-slate-800 bg-[#0F172A]/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-20 shrink-0 gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-10 px-2.5 rounded-xl bg-gradient-to-br from-[#FFC72C] via-[#F59E0B] to-[#D97706] flex items-center justify-center font-black text-slate-950 text-xl tracking-tighter shadow-lg shadow-amber-900/20 border border-amber-300/40">
              :UNID
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-sm sm:text-base tracking-tight text-white flex items-center gap-2">
                  Centro de Mando <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-[#FFC72C]/20 text-[#FFC72C] font-bold border border-[#FFC72C]/40">Admisiones IA</span>
                </h1>
              </div>
              
              {/* Selector Multi-Campus en Header */}
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <i data-lucide="map-pin" className="w-3 h-3 text-amber-400 shrink-0"></i>
                <select
                  value={selectedCampus}
                  onChange={(e) => handleChangeCampus(e.target.value)}
                  className="bg-transparent border-none text-slate-300 font-bold focus:outline-none cursor-pointer hover:text-amber-300 pr-2 truncate max-w-[210px] sm:max-w-[280px]"
                >
                  {campusesList.map(c => (
                    <option key={c.id} value={c.id} className="bg-[#0F172A] text-slate-100">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Controles: BGM Cyber HUD, Selector Dinámico de Modelo, Semáforo Health Check y Acceso */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          
          {/* Cyber HUD: Reproductor de BGM Metal Sonic (OST @ 1515s) */}
          <div className="flex items-center gap-1.5 bg-[#0A192F] border border-cyan-500/40 rounded-xl px-2 sm:px-2.5 py-1 text-xs shadow-inner shadow-cyan-950/40">
            <div className="flex items-center gap-1.5">
              <span className="text-cyan-400 font-bold flex items-center gap-1">
                <i data-lucide="disc" className={`w-3.5 h-3.5 text-cyan-400 ${isPlayingBgm ? 'animate-spin' : ''}`}></i>
                <span className="hidden 2xl:inline text-[11px] text-cyan-200">Metal Sonic Cyber OST</span>
              </span>
              
              {/* Animated Equalizer */}
              <div className="flex items-end h-3.5 gap-0.5 px-0.5">
                <span className={`w-0.5 bg-cyan-400 rounded-full ${isPlayingBgm ? 'eq-bar-1' : 'h-1'}`}></span>
                <span className={`w-0.5 bg-amber-400 rounded-full ${isPlayingBgm ? 'eq-bar-2' : 'h-1.5'}`}></span>
                <span className={`w-0.5 bg-cyan-400 rounded-full ${isPlayingBgm ? 'eq-bar-3' : 'h-1'}`}></span>
                <span className={`w-0.5 bg-amber-400 rounded-full ${isPlayingBgm ? 'eq-bar-4' : 'h-2'}`}></span>
              </div>
            </div>

            <div className="flex items-center gap-0.5 border-l border-slate-700/80 pl-1">
              <button
                onClick={toggleBgmPlay}
                title={isPlayingBgm ? 'Pausar banda sonora de Metal Sonic' : 'Reproducir banda sonora de Metal Sonic (25:15)'}
                className={`p-1 rounded-lg transition active:scale-95 ${
                  isPlayingBgm 
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 hover:bg-cyan-500/30' 
                    : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <i data-lucide={isPlayingBgm ? 'pause' : 'play'} className="w-3.5 h-3.5"></i>
              </button>

              <button
                onClick={toggleBgmMute}
                title={isMutedBgm ? 'Desmutear audio' : 'Silenciar audio'}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
              >
                <i data-lucide={isMutedBgm ? 'volume-x' : 'volume-2'} className="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>

          {/* Selector Dinámico de Modelos */}
          <div className="flex items-center bg-[#0A192F] border border-slate-700/80 rounded-xl px-2.5 py-1 text-xs shadow-inner">
            <i data-lucide="cpu" className="w-3.5 h-3.5 text-[#FFC72C] mr-1.5 shrink-0"></i>
            <select
              value={selectedModel}
              onChange={(e) => handleChangeModel(e.target.value)}
              className="bg-transparent border-none text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer pr-1"
            >
              {modelsList.map(m => (
                <option key={m.id} value={m.id} className="bg-[#0F172A] text-slate-100">
                  {m.name} {m.inCooldown ? '⏳ (Cooldown)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Semáforo de Salud del Sistema */}
          <button
            onClick={() => setShowHealthModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#0A192F] hover:bg-slate-800 border border-slate-700 text-xs transition"
            title="Abrir diagnóstico de salud y circuit breaker"
          >
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                healthFull?.overall === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                healthFull?.overall === 'healthy' ? 'bg-emerald-500' : 'bg-amber-500'
              }`}></span>
            </span>
            <span className="hidden lg:inline text-slate-300 text-[11px] font-bold">Monitor de Salud</span>
          </button>

          {/* Botón de Autenticación O365 / Admin */}
          {authUser ? (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1 text-xs">
              <span className={`font-bold flex items-center gap-1 ${isAdmin ? 'text-amber-300' : 'text-emerald-400'}`}>
                <i data-lucide={isAdmin ? 'shield-alert' : 'users'} className="w-3.5 h-3.5"></i>
                <span className="hidden md:inline">{authUser.displayName || authUser.name || authUser.username}</span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold border ml-1 ${
                  isAdmin ? 'bg-amber-950/80 text-amber-300 border-amber-500/40' : 'bg-sky-950/80 text-sky-300 border-sky-500/40'
                }`}>
                  {isAdmin ? '🛡️ Admin TI' : '👥 Admisiones'}
                </span>
              </span>
              <button
                onClick={handleLogout}
                title="Cerrar sesión institucional"
                className="text-slate-400 hover:text-rose-400 transition ml-1"
              >
                <i data-lucide="log-out" className="w-3.5 h-3.5"></i>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] hover:from-[#F59E0B] hover:to-[#D97706] text-slate-950 font-black text-xs transition shadow-md shadow-amber-900/30 flex items-center gap-1.5 active:scale-95"
            >
              <i data-lucide="lock" className="w-3.5 h-3.5"></i>
              <span className="hidden sm:inline">Acceso UNID</span>
            </button>
          )}
        </div>
      </header>

      {/* ================= CONTENIDO PRINCIPAL ================= */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* ================= PANEL IZQUIERDO: SIMULADOR WHATSAPP ================= */}
        <div className="w-full lg:w-5/12 flex flex-col border-r border-slate-800 bg-[#0C1317]">
          
          {/* Header del Simulador WhatsApp */}
          <div className="h-14 bg-[#202C33] px-4 flex items-center justify-between border-b border-slate-800/80 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FFC72C] to-red-600 flex items-center justify-center text-slate-950 font-black text-sm shadow">
                  🐺
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#202C33] rounded-full"></span>
              </div>
              <div>
                <h2 className="font-bold text-xs text-slate-100 flex items-center gap-1.5">
                  Metal-Uriel 🤖
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30 font-mono">
                    ONLINE
                  </span>
                </h2>
                <span className="text-[10px] text-slate-400 font-mono block truncate max-w-[190px]">
                  {phone}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                title={autoScroll ? 'Auto-scroll activo' : 'Auto-scroll pausado'}
                className={`p-1.5 rounded-lg text-xs transition ${autoScroll ? 'text-amber-400 bg-slate-800/60' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <i data-lucide="arrow-down-circle" className="w-4 h-4"></i>
              </button>

              <button
                onClick={handleResetSession}
                title="Reiniciar conversación y limpiar memoria del bot"
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/60 transition"
              >
                <i data-lucide="rotate-ccw" className="w-4 h-4"></i>
              </button>
            </div>
          </div>

          {/* Área de Mensajes del Chat */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#0B141A] bg-opacity-95" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 0)", backgroundSize: "24px 24px" }}>
            {messages.map((m) => {
              const isMe = m.sender === 'user';
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[88%] ${isMe ? 'ml-auto' : 'mr-auto'}`}
                >
                  <div
                    className={`rounded-2xl px-3.5 py-2 text-xs shadow-md space-y-1.5 leading-relaxed relative ${
                      isMe
                        ? 'bg-[#005C4B] text-slate-100 rounded-tr-none'
                        : 'bg-[#202C33] text-slate-200 rounded-tl-none border border-slate-700/40'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>

                    {/* Folleto PDF Oficial Adjunto */}
                    {m.documentAttachment && (
                      <div className="mt-2 p-2.5 rounded-xl bg-[#0A192F] border border-amber-500/40 space-y-1.5 shadow-inner">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-[11px] text-amber-300 flex items-center gap-1.5 truncate">
                            <i data-lucide="file-text" className="w-3.5 h-3.5 text-amber-400 shrink-0"></i>
                            {m.documentAttachment.title || 'Plan de Estudios Oficial UNID'}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 font-mono border border-amber-500/30">
                            PDF SEP
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-300 leading-tight">
                          {m.documentAttachment.caption || 'Documento con validez oficial, mapa curricular y becas.'}
                        </p>
                        <a
                          href={m.documentAttachment.url}
                          target="_blank"
                          download={m.documentAttachment.fileName || 'Plan_Estudios_UNID.pdf'}
                          className="mt-1 block text-center py-1 rounded-lg bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] hover:from-[#F59E0B] hover:to-[#D97706] text-slate-950 font-black text-[10px] transition shadow"
                        >
                          📥 Descargar / Abrir Plan de Estudios (PDF)
                        </a>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-1 text-[9px] text-slate-400 font-mono select-none">
                      <span>{m.time}</span>
                      {isMe && <i data-lucide="check-check" className="w-3 h-3 text-sky-400"></i>}
                      {!isMe && m.modelUsed && (
                        <span className="text-[9px] text-amber-300/80 ml-1">
                          • {m.modelUsed}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-center gap-2 text-slate-400 text-xs bg-[#202C33] px-3.5 py-2 rounded-2xl rounded-tl-none w-fit border border-slate-700/40">
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-ping"></span>
                <span>Metal-Uriel procesando respuesta...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Barra de Entrada de Mensaje */}
          <div className="p-3 bg-[#202C33] border-t border-slate-800 shrink-0">
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
                placeholder="Escribe un mensaje como aspirante..."
                disabled={isLoading}
                className="flex-1 bg-[#2A3942] text-xs text-slate-100 placeholder-slate-400 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#FFC72C] transition"
              />

              <button
                type="submit"
                disabled={isLoading || !inputText.trim()}
                className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#FFC72C] to-[#F59E0B] text-slate-950 flex items-center justify-center font-bold hover:brightness-110 disabled:opacity-50 transition shadow"
              >
                <i data-lucide="send" className="w-4 h-4"></i>
              </button>
            </form>
          </div>
        </div>

        {/* ================= BOTÓN FLOTANTE: LABORATORIO DE PRUEBAS IA ================= */}
        <button
          onClick={() => setShowTestSuiteModal(true)}
          className="absolute bottom-16 left-4 lg:left-6 z-30 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-extrabold text-xs shadow-xl shadow-purple-950/60 border border-purple-300/40 flex items-center gap-2 active:scale-95 transition-all group animate-bounce"
          title="Abrir Suite de Casos de Prueba y Anti-Alucinaciones"
        >
          <i data-lucide="flask-conical" className="w-4 h-4 text-amber-300 group-hover:rotate-12 transition"></i>
          <span>🧪 Laboratorio de Pruebas IA</span>
          <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-mono">
            {TEST_SUITE_CATEGORIES.reduce((acc, cat) => acc + cat.cases.length, 0)}
          </span>
        </button>

        {/* ================= PANEL DERECHO: TABS DEL CENTRO DE MANDO ================= */}
        <div className="flex-1 flex flex-col bg-[#0A192F] overflow-hidden">
          
          {/* Barra de Navegación de Tabs */}
          <div className="h-14 border-b border-slate-800 bg-[#0F172A] px-4 sm:px-6 flex items-center justify-between shrink-0 overflow-x-auto gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setActiveTab('kanban')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                  activeTab === 'kanban'
                    ? 'bg-[#FFC72C] text-slate-950 shadow-md shadow-amber-900/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <i data-lucide="trello" className="w-3.5 h-3.5"></i>
                <span>Tablero Kanban</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/60 font-mono">
                  {showArchiveView ? archivedLeadsCount : activeLeadsCount}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                  activeTab === 'analytics'
                    ? 'bg-[#FFC72C] text-slate-950 shadow-md shadow-amber-900/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <i data-lucide="bar-chart-3" className="w-3.5 h-3.5"></i>
                <span>Métricas & Analytics</span>
              </button>

              <button
                onClick={() => setActiveTab('brochures')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                  activeTab === 'brochures'
                    ? 'bg-[#FFC72C] text-slate-950 shadow-md shadow-amber-900/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <i data-lucide="graduation-cap" className="w-3.5 h-3.5"></i>
                <span>Planes de Estudio</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/60 font-mono">
                  {brochures.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('inspector')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                  activeTab === 'inspector'
                    ? 'bg-[#FFC72C] text-slate-950 shadow-md shadow-amber-900/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <i data-lucide="list-checks" className="w-3.5 h-3.5"></i>
                <span>11 Datos IA</span>
              </button>

              {isAdmin && (
                <>
                  <button
                    onClick={() => setActiveTab('database')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                      activeTab === 'database'
                        ? 'bg-[#FFC72C] text-slate-950 shadow-md shadow-amber-900/30'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <i data-lucide="database" className="w-3.5 h-3.5"></i>
                    <span>MariaDB</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('prompt')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                      activeTab === 'prompt'
                        ? 'bg-[#FFC72C] text-slate-950 shadow-md shadow-amber-900/30'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <i data-lucide="settings-2" className="w-3.5 h-3.5"></i>
                    <span>Personalidad Bot</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('tenant_config')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                      activeTab === 'tenant_config'
                        ? 'bg-[#FFC72C] text-slate-950 shadow-md shadow-amber-900/30'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <i data-lucide="building-2" className="w-3.5 h-3.5"></i>
                    <span>Configuración Sedes</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/60 font-mono">
                      {tenantsList.length || 23}
                    </span>
                  </button>
                </>
              )}

              <button
                onClick={() => setActiveTab('onboarding')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                  activeTab === 'onboarding'
                    ? 'bg-[#FFC72C] text-slate-950 shadow-md shadow-amber-900/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <i data-lucide="help-circle" className="w-3.5 h-3.5"></i>
                <span>Soporte & Onboarding</span>
              </button>
            </div>

            {/* Botones de acción global (Exportar / Demo) */}
            <div className="flex items-center gap-2">
              <a
                href="/api/aspirantes/export"
                target="_blank"
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-amber-300 text-xs font-bold transition flex items-center gap-1 border border-slate-700 shadow-sm"
                title="Descargar base de datos oficial en archivo CSV para Excel"
              >
                <i data-lucide="download" className="w-3.5 h-3.5"></i>
                <span className="hidden xl:inline">Excel / CSV</span>
              </a>

              <button
                onClick={handleSeedDemo}
                className="px-2.5 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center gap-1"
                title="Cargar prospectos de prueba institucionales"
              >
                <i data-lucide="sparkles" className="w-3.5 h-3.5"></i>
                <span className="hidden xl:inline">Cargar Demo</span>
              </button>
            </div>
          </div>

          {/* Contenedor del Tab Activo */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            
            {/* ====== TAB 1: KANBAN CON ARCHIVADO & TIMESTAMPS ====== */}
            {activeTab === 'kanban' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2">
                      <span>Ciclo de Admisiones • {selectedCampusName}</span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      Arrastra o cambia de etapa a cada prospecto. Los prospectos concluidos pueden ser archivados para mantener el tablero limpio.
                    </p>
                  </div>

                  {/* Toggle Activos vs Archivados */}
                  <div className="flex items-center gap-2 bg-[#1E293B] p-1 rounded-xl border border-slate-700 self-start sm:self-auto">
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
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                        showArchiveView
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <i data-lucide="archive" className="w-3 h-3"></i>
                      <span>Archivados ({archivedLeadsCount})</span>
                    </button>
                  </div>
                </div>

                {/* Tablero Kanban */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5 items-start">
                  {KANBAN_COLUMNS.map((col) => {
                    const colLeads = filteredAspirantes.filter(
                      (asp) => (asp.estado_prospecto || 'nuevo') === col.id
                    );

                    return (
                      <div
                        key={col.id}
                        className={`rounded-2xl border ${col.color} p-3 flex flex-col gap-3 min-h-[500px] shadow-sm`}
                      >
                        {/* Encabezado de Columna */}
                        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                          <h3 className="font-extrabold text-xs flex items-center gap-1.5">
                            {col.title}
                          </h3>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-bold ${col.badge}`}>
                            {colLeads.length}
                          </span>
                        </div>

                        {/* Tarjetas de la Columna */}
                        <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[70vh] pr-0.5">
                          {colLeads.map((asp) => (
                            <div
                              key={asp.id}
                              className="p-3 rounded-xl bg-[#1E293B] border border-slate-700/80 hover:border-amber-400 transition space-y-2 shadow group cursor-pointer"
                              onClick={() => setSelectedLead(asp)}
                            >
                              {/* Cabecera Tarjeta: Nombre + Lead Scoring */}
                              <div className="flex items-start justify-between gap-1.5">
                                <span className="font-bold text-xs text-white group-hover:text-amber-300 transition line-clamp-1">
                                  {asp.nombre_completo || 'Sin nombre'}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-extrabold bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 shrink-0">
                                  {asp.nivel_interes || 'Alto'} 🔥
                                </span>
                              </div>

                              {/* Carrera y Modalidad */}
                              <div className="text-[11px] text-slate-300 space-y-0.5">
                                <div className="font-semibold text-amber-300 line-clamp-1">
                                  {asp.carrera_interes}
                                </div>
                                <div className="text-[10px] text-slate-400 flex items-center justify-between">
                                  <span>{asp.modalidad_estudios}</span>
                                  <span className={asp.es_foraneo ? 'text-sky-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                                    {asp.es_foraneo ? '🌐 Online' : '🏛️ Presencial'}
                                  </span>
                                </div>
                              </div>

                              {/* Timestamp del Último Mensaje */}
                              <div className="text-[10px] text-slate-400 flex items-center gap-1 font-mono pt-1 border-t border-slate-800/80">
                                <i data-lucide="clock" className="w-3 h-3 text-slate-500"></i>
                                <span>Último contacto: <strong className="text-slate-300">{formatTimeAgo(asp.ultimo_mensaje_at || asp.updated_at || asp.created_at)}</strong></span>
                              </div>

                              {/* Selector Rápido de Estado & Botón de Archivar */}
                              <div className="pt-1 flex items-center justify-between gap-1" onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={asp.estado_prospecto || 'nuevo'}
                                  onChange={(e) => handleUpdateStatus(asp.id, e.target.value)}
                                  className="bg-[#0A192F] text-[10px] text-slate-200 border border-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:border-amber-400"
                                >
                                  {KANBAN_COLUMNS.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      Mover: {c.title}
                                    </option>
                                  ))}
                                </select>

                                <div className="flex items-center gap-1">
                                  {/* Botón Archivar / Desarchivar */}
                                  <button
                                    onClick={() => handleArchiveLead(asp.id, Boolean(asp.archivado))}
                                    title={asp.archivado ? 'Desarchivar y volver a la vista activa' : 'Archivar prospecto'}
                                    className={`p-1 rounded-lg border transition ${
                                      asp.archivado
                                        ? 'bg-indigo-950 text-indigo-300 border-indigo-500/40 hover:bg-indigo-900'
                                        : 'bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700 hover:bg-slate-700'
                                    }`}
                                  >
                                    <i data-lucide={asp.archivado ? 'arrow-up-circle' : 'archive'} className="w-3 h-3"></i>
                                  </button>

                                  {/* Botón Eliminar */}
                                  <button
                                    onClick={() => handleDeleteLead(asp.id, asp.nombre_completo)}
                                    title="Eliminar prospecto"
                                    className="p-1 rounded-lg bg-red-950/60 hover:bg-red-900/80 border border-red-700/50 text-red-300 transition"
                                  >
                                    <i data-lucide="trash-2" className="w-3 h-3"></i>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}

                          {colLeads.length === 0 && (
                            <div className="text-center py-10 text-slate-600 text-xs italic border border-dashed border-slate-800 rounded-xl">
                              Sin prospectos
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ====== TAB 2: ANALYTICS DASHBOARD ====== */}
            {activeTab === 'analytics' && (
              <div className="space-y-5">
                {/* KPIs Superiores */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="p-3.5 rounded-2xl bg-[#1E293B] border border-slate-700 space-y-1">
                    <span className="text-slate-400 text-xs font-semibold">Total Registros</span>
                    <div className="text-2xl font-black text-white">{analyticsData?.totalLeads || 0}</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[#1E293B] border border-slate-700 space-y-1">
                    <span className="text-slate-400 text-xs font-semibold">Prospectos Activos</span>
                    <div className="text-2xl font-black text-amber-300">{analyticsData?.activos || activeLeadsCount}</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[#1E293B] border border-slate-700 space-y-1">
                    <span className="text-slate-400 text-xs font-semibold">Archivados</span>
                    <div className="text-2xl font-black text-indigo-400">{analyticsData?.archivados || archivedLeadsCount}</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[#1E293B] border border-slate-700 space-y-1">
                    <span className="text-slate-400 text-xs font-semibold">Interés Alto 🔥</span>
                    <div className="text-2xl font-black text-emerald-400">{analyticsData?.byInterest?.alto || 0}</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[#1E293B] border border-slate-700 space-y-1">
                    <span className="text-slate-400 text-xs font-semibold">Efectividad Bot</span>
                    <div className="text-2xl font-black text-sky-400">{analyticsData?.conversionRate || 100}%</div>
                  </div>
                </div>

                {/* Gráficas de Análisis Oficiales */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  
                  {/* Gráfica de Carreras Oficiales UNID */}
                  <div className="lg:col-span-2 p-4 rounded-2xl bg-[#1E293B] border border-slate-700 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold text-xs text-white flex items-center gap-1.5">
                        <i data-lucide="book-open" className="w-4 h-4 text-amber-400"></i>
                        Demanda por Carrera Oficial UNID (Anti-Alucinaciones)
                      </h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                        Catálogo UNID Talisis
                      </span>
                    </div>
                    <div className="h-64 relative">
                      <canvas ref={careerChartRef}></canvas>
                    </div>
                  </div>

                  {/* Distribución Geográfica (Local vs Online) */}
                  <div className="p-4 rounded-2xl bg-[#1E293B] border border-slate-700 space-y-3 flex flex-col justify-between">
                    <div>
                      <h3 className="font-extrabold text-xs text-white flex items-center gap-1.5 mb-2">
                        <i data-lucide="pie-chart" className="w-4 h-4 text-sky-400"></i>
                        Locales vs. Foráneos (Online)
                      </h3>
                      <div className="h-48 relative">
                        <canvas ref={originChartRef}></canvas>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 text-center">
                      Regla geográfica activa: Los foráneos se enrutan automáticamente a Licenciaturas Online.
                    </div>
                  </div>
                </div>

                {/* Embudo de Admisiones */}
                <div className="p-4 rounded-2xl bg-[#1E293B] border border-slate-700 space-y-3">
                  <h3 className="font-extrabold text-xs text-white flex items-center gap-1.5">
                    <i data-lucide="filter" className="w-4 h-4 text-purple-400"></i>
                    Embudo de Conversión de Admisiones
                  </h3>
                  <div className="h-48 relative">
                    <canvas ref={statusChartRef}></canvas>
                  </div>
                </div>
              </div>
            )}

            {/* ====== TAB 3: CATÁLOGO OFICIAL DE PLANES DE ESTUDIO (LECTURA & DESCARGA) ====== */}
            {activeTab === 'brochures' && (
              <div className="space-y-4">
                
                {/* Cabecera y Filtros */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#1E293B]/70 p-4 rounded-2xl border border-slate-700/80">
                  <div>
                    <h2 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2">
                      <span>Planes de Estudio & Folletos Oficiales UNID</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-500/40 font-mono">
                        {brochures.length} Programas
                      </span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      Catálogo curricular y folletos oficiales con validez SEP listos para ser consultados por el personal o despachados por Metal-Uriel.
                    </p>
                  </div>
                </div>

                {/* Filtros de Sede & Búsqueda */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap w-full md:w-auto">
                    <button
                      onClick={() => setBrochureFilter('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        brochureFilter === 'all'
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'bg-[#1E293B] text-slate-300 hover:text-white border border-slate-700'
                      }`}
                    >
                      Todos ({brochures.length})
                    </button>
                    <button
                      onClick={() => setBrochureFilter('campus_campeche')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        brochureFilter === 'campus_campeche'
                          ? 'bg-amber-950 text-amber-300 border border-amber-500 shadow'
                          : 'bg-[#1E293B] text-slate-300 hover:text-white border border-slate-700'
                      }`}
                    >
                      🏛️ Presencial Campeche
                    </button>
                    <button
                      onClick={() => setBrochureFilter('ejecutiva_campeche')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        brochureFilter === 'ejecutiva_campeche'
                          ? 'bg-purple-950 text-purple-300 border border-purple-500 shadow'
                          : 'bg-[#1E293B] text-slate-300 hover:text-white border border-slate-700'
                      }`}
                    >
                      👔 Modalidad Ejecutiva & Dual
                    </button>
                    <button
                      onClick={() => setBrochureFilter('unid_nacional')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        brochureFilter === 'unid_nacional'
                          ? 'bg-sky-950 text-sky-300 border border-sky-500 shadow'
                          : 'bg-[#1E293B] text-slate-300 hover:text-white border border-slate-700'
                      }`}
                    >
                      🌐 UNID Online (Nacional)
                    </button>
                  </div>

                  <div className="relative w-full md:w-72">
                    <i data-lucide="search" className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"></i>
                    <input
                      type="text"
                      value={brochureSearch}
                      onChange={(e) => setBrochureSearch(e.target.value)}
                      placeholder="Buscar por carrera, RVOE o materias..."
                      className="w-full bg-[#0A192F] border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#FFC72C]"
                    />
                  </div>
                </div>

                {/* Grid de Folletos y Planes de Estudio */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredBrochures.length === 0 ? (
                    <div className="col-span-2 text-center py-12 bg-[#1E293B]/40 rounded-2xl border border-slate-800 space-y-2">
                      <i data-lucide="file-question" className="w-8 h-8 text-slate-500 mx-auto"></i>
                      <p className="text-slate-400 text-xs">No se encontraron programas con los filtros aplicados.</p>
                    </div>
                  ) : (
                    filteredBrochures.map(b => {
                      const isCampeche = b.scope === 'campus_campeche';
                      const isEjecutiva = b.scope === 'ejecutiva_campeche';
                      const isOnline = b.scope === 'unid_nacional';

                      return (
                        <div
                          key={b.id}
                          className="p-4 rounded-2xl bg-[#1E293B] border border-slate-700/70 hover:border-[#FFC72C] transition space-y-3 shadow-md flex flex-col justify-between group"
                        >
                          <div className="space-y-2">
                            {/* Insignia de Sede / Ámbito */}
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                                isCampeche
                                  ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                                  : isEjecutiva
                                  ? 'bg-purple-950/80 text-purple-300 border-purple-500/40'
                                  : isOnline
                                  ? 'bg-sky-950/80 text-sky-300 border-sky-500/40'
                                  : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                              }`}>
                                {b.scopeLabel || (isCampeche ? '🏛️ Campus Campeche' : isOnline ? '🌐 UNID Online' : '🎓 Institucional')}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300 font-mono">
                                {b.size || '1.2 MB'}
                              </span>
                            </div>

                            {/* Título de Carrera */}
                            <div>
                              <h3 className="font-extrabold text-xs text-white group-hover:text-amber-300 transition">
                                {b.carrera}
                              </h3>
                              <div className="text-[11px] text-slate-300 mt-1 flex items-center gap-1 flex-wrap">
                                <span>Modalidad: <strong className="text-amber-300">{b.modalidad}</strong></span>
                                <span>•</span>
                                <span>Duración: {b.duracion}</span>
                              </div>
                            </div>

                            {/* RVOE SEP & Tags */}
                            <div className="space-y-1">
                              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                                <i data-lucide="check-circle" className="w-3 h-3 text-emerald-400"></i>
                                <span>Validez SEP / RVOE: <strong>{b.rvoe}</strong></span>
                              </div>

                              {b.tags && (
                                <div className="text-[10px] text-slate-500 flex items-center gap-1 truncate">
                                  <i data-lucide="tag" className="w-3 h-3 text-slate-500 shrink-0"></i>
                                  <span className="truncate">Tags IA: {Array.isArray(b.tags) ? b.tags.join(', ') : b.tags}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Pie de Tarjeta con Descarga Directa */}
                          <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-slate-500 font-mono truncate max-w-[170px]" title={b.fileName}>
                              📄 {b.fileName}
                            </span>

                            <a
                              href={`/api/brochures/${b.id}/download`}
                              target="_blank"
                              download={b.fileName}
                              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] hover:from-[#F59E0B] hover:to-[#D97706] text-slate-950 text-xs font-black transition flex items-center gap-1.5 shadow active:scale-95"
                              title="Descargar o abrir PDF oficial"
                            >
                              <i data-lucide="download" className="w-3.5 h-3.5"></i>
                              <span>Descargar PDF</span>
                            </a>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ====== TAB 4: VISOR DE BASE DE DATOS MARIADB ====== */}
            {activeTab === 'database' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="relative">
                    <i data-lucide="search" className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"></i>
                    <input
                      type="text"
                      value={dbSearch}
                      onChange={(e) => setDbSearch(e.target.value)}
                      placeholder="Buscar por nombre, carrera, celular o campus..."
                      className="w-full bg-[#0A192F] border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#FFC72C] transition"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setDbFilter('all')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                          dbFilter === 'all'
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Todos ({aspirantes.length})
                      </button>
                      <button
                        onClick={() => setDbFilter('alta_prioridad')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                          dbFilter === 'alta_prioridad'
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        🔥 Alta Prioridad ({totalAltaPrioridad})
                      </button>
                      <button
                        onClick={() => setDbFilter('local')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                          dbFilter === 'local'
                            ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-500/40'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Locales ({totalLocales})
                      </button>
                      <button
                        onClick={() => setDbFilter('foraneo')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                          dbFilter === 'foraneo'
                            ? 'bg-sky-900/80 text-sky-300 border border-sky-500/40'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Foráneos ({totalForaneos})
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleTruncateDb}
                        className="px-2.5 py-1 rounded-lg text-[11px] bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-600/50 font-bold transition flex items-center gap-1 shadow"
                        title="Eliminar todos los aspirantes de la base de datos MariaDB (Reset Testing)"
                      >
                        <i data-lucide="trash-2" className="w-3 h-3"></i>
                        <span>Vaciar DB (Reset)</span>
                      </button>

                      <button
                        onClick={loadAspirantes}
                        className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 font-semibold px-2 py-1 bg-slate-800 rounded-lg"
                      >
                        <i data-lucide="refresh-cw" className="w-3 h-3"></i> Refrescar
                      </button>
                    </div>
                  </div>
                </div>

                {filteredAspirantes.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 space-y-2">
                    <i data-lucide="inbox" className="w-8 h-8 mx-auto text-slate-600"></i>
                    <p className="text-xs">No se encontraron prospectos con los filtros actuales.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredAspirantes.map((asp) => (
                      <div
                        key={asp.id}
                        onClick={() => setSelectedLead(asp)}
                        className="p-3.5 rounded-xl border border-slate-700/60 hover:border-amber-400 bg-[#1E293B] hover:bg-[#1E293B]/80 transition cursor-pointer space-y-2 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-extrabold text-sm text-white">
                            {asp.nombre_completo || 'Sin nombre'}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-amber-950/60 border border-amber-500/40 text-amber-300 font-bold">
                              ID #{asp.id}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                              {asp.nivel_interes || 'Alto'} 🔥
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                          <div>
                            <span className="text-slate-400">Carrera:</span> <strong className="text-amber-300">{asp.carrera_interes}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">Modalidad:</span> {asp.modalidad_estudios}
                          </div>
                          <div>
                            <span className="text-slate-400">Teléfono:</span> {asp.telefono_celular}
                          </div>
                          <div>
                            <span className="text-slate-400">Campus:</span> {asp.campus_interes}
                          </div>
                        </div>

                        {asp.resumen_ia && (
                          <div className="p-2 rounded-lg bg-[#0A192F] text-[11px] text-slate-300 italic">
                            ⚡ "{asp.resumen_ia}"
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-800">
                          <span>{new Date(asp.created_at).toLocaleString('es-MX')}</span>
                          <span className={asp.es_foraneo ? 'text-sky-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                            {asp.es_foraneo ? '🌍 Foráneo (Online)' : '📍 Local Presencial'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ====== TAB 5: INSPECTOR DE 11 DATOS ====== */}
            {activeTab === 'inspector' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-700 bg-[#1E293B] p-4 space-y-2 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#FFC72C] flex items-center gap-1.5">
                      <i data-lucide="compass" className="w-4 h-4"></i>
                      Regla Geográfica UNID (Campus vs Modalidad)
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                      isForaneoDetected 
                        ? 'bg-sky-950 text-sky-300 border-sky-500/40' 
                        : 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                    }`}>
                      {isForaneoDetected ? '🌍 Aspirante Foráneo Detectado' : '📍 Aspirante Local Presencial'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Si el aspirante reside fuera de la zona del campus o trabaja a tiempo completo, el bot orienta amablemente hacia la modalidad <strong>Licenciaturas Online</strong> o <strong>Ejecutivas</strong> con validez oficial SEP.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-700 bg-[#1E293B] p-4 space-y-3 shadow-md">
                  <h3 className="font-extrabold text-xs text-white flex items-center gap-2">
                    <i data-lucide="list-checks" className="w-4 h-4 text-emerald-400"></i>
                    Checklist de los 11 Campos Obligatorios de Admisión
                  </h3>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1">
                    <span>Campos detectados en tiempo real durante la conversación:</span>
                    <span className="font-bold text-amber-300 font-mono">
                      {REQUIRED_FIELDS.filter(f => {
                        const val = (liveExtractedFields && liveExtractedFields[f.key]) || (lastCompletedLead && lastCompletedLead[f.key]);
                        return Boolean(val && String(val).trim().length > 0 && String(val).trim() !== 'null');
                      }).length} / 11 Capturados
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {REQUIRED_FIELDS.map((field) => {
                      const val = (liveExtractedFields && liveExtractedFields[field.key]) || (lastCompletedLead && lastCompletedLead[field.key]);
                      const isComplete = Boolean(val && String(val).trim().length > 0 && String(val).trim() !== 'null');
                      return (
                        <div
                          key={field.key}
                          className={`p-3 rounded-xl border flex flex-col justify-between text-xs transition ${
                            isComplete
                              ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200 shadow-sm'
                              : 'bg-[#0A192F] border-slate-800 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <i data-lucide={field.icon} className={`w-3.5 h-3.5 ${isComplete ? 'text-emerald-400' : 'text-slate-500'}`}></i>
                              <span className="font-semibold text-slate-200">{field.label}</span>
                            </div>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono ${
                              isComplete ? 'bg-emerald-900 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-500'
                            }`}>
                              {isComplete ? '✓ CAPTURADO' : '⏳ PENDIENTE'}
                            </span>
                          </div>

                          {isComplete && (
                            <div className="mt-1.5 pt-1.5 border-t border-emerald-900/60 text-[11px] font-mono text-emerald-300 truncate">
                              💬 {String(val)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {lastCompletedLead && (
                  <div className="rounded-2xl border border-amber-500/40 bg-[#1E293B] p-4 space-y-2 shadow-md">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-2">
                      <i data-lucide="file-json" className="w-4 h-4"></i> Último Payload JSON Generado por la IA:
                    </span>
                    <pre className="p-3 rounded-xl bg-[#0A192F] text-[11px] text-emerald-400 font-mono overflow-x-auto border border-slate-800">
                      {JSON.stringify(lastCompletedLead, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* ====== TAB 6: EDITOR DE SYSTEM PROMPT ====== */}
            {activeTab === 'prompt' && (
              <div className="space-y-4">
                {promptSavedNotification && (
                  <div className="p-3.5 rounded-xl bg-emerald-950 border border-emerald-500/60 text-emerald-200 text-xs flex items-center justify-between shadow-lg animate-pulse">
                    <span className="flex items-center gap-2 font-bold">
                      <i data-lucide="check-circle-2" className="w-4 h-4 text-emerald-400"></i>
                      ¡Personalidad actualizada y guardada con éxito en system_prompt.txt!
                    </span>
                  </div>
                )}

                <div className="rounded-2xl border border-slate-700 bg-[#1E293B] p-4 space-y-3 shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="font-extrabold text-xs text-white flex items-center gap-2">
                        <i data-lucide="sparkles" className="w-4 h-4 text-[#FFC72C]"></i>
                        Plantillas Predefinidas de Personalidad
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Selecciona un preset para ajustar el comportamiento del bot en tiempo real.
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {promptPresets.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => handleSelectPreset(preset.prompt)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1"
                        >
                          <i data-lucide={preset.icon || 'tag'} className="w-3 h-3 text-amber-400"></i>
                          <span>{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <label className="text-xs font-bold text-slate-300 block">
                      Instrucciones del Sistema (System Prompt Activo):
                    </label>
                    <textarea
                      rows={14}
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      className="w-full bg-[#0A192F] border border-slate-700 rounded-xl p-3 text-xs text-slate-100 font-mono focus:outline-none focus:border-[#FFC72C] leading-relaxed resize-y"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <button
                      onClick={loadPromptData}
                      className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
                    >
                      <i data-lucide="rotate-ccw" className="w-3.5 h-3.5"></i> Descartar cambios
                    </button>

                    <button
                      onClick={handleSavePrompt}
                      disabled={promptSaving}
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] hover:from-[#F59E0B] hover:to-[#D97706] text-slate-950 text-xs font-extrabold transition shadow-lg shadow-amber-900/30 flex items-center gap-1.5 active:scale-95"
                    >
                      <i data-lucide="save" className="w-3.5 h-3.5"></i>
                      {promptSaving ? 'Guardando...' : 'Guardar y Aplicar al Bot'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ====== TAB 7: CONFIGURACIÓN MULTI-TENANT POR SEDE ====== */}
            {activeTab === 'tenant_config' && (
              <div className="space-y-4">
                {tenantSaveSuccess && (
                  <div className="p-3.5 rounded-xl bg-emerald-950 border border-emerald-500/60 text-emerald-200 text-xs flex items-center justify-between shadow-lg animate-pulse">
                    <span className="flex items-center gap-2 font-bold">
                      <i data-lucide="check-circle-2" className="w-4 h-4 text-emerald-400"></i>
                      ¡Configuración de la sede guardada y cifrada con AES-256-GCM con éxito en MariaDB!
                    </span>
                  </div>
                )}

                {/* Header de la Sede */}
                <div className="rounded-2xl border border-slate-700 bg-[#1E293B] p-4 space-y-3 shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2">
                        <i data-lucide="building-2" className="w-4 h-4 text-[#FFC72C]"></i>
                        <span>Gestión Multi-Tenant • Sedes Nacionales UNID</span>
                      </h2>
                      <p className="text-xs text-slate-400">
                        Configura el número oficial de WhatsApp, Tokens de Meta cifrados con AES-256 y llaves de IA para cada campus.
                      </p>
                    </div>

                    {/* Selector de Sede a Configurar */}
                    <div className="flex items-center gap-2 bg-[#0A192F] px-3 py-1.5 rounded-xl border border-slate-700">
                      <label className="text-[11px] font-bold text-amber-400">Sede:</label>
                      <select
                        value={selectedTenantSlug}
                        onChange={(e) => handleSelectTenant(e.target.value)}
                        className="bg-transparent text-xs font-bold text-slate-100 focus:outline-none cursor-pointer"
                      >
                        {tenantsList.map(t => (
                          <option key={t.slug} value={t.slug} className="bg-[#0F172A] text-slate-100">
                            {t.nombre} {t.hasWhatsAppToken ? '🟢 (Configurado)' : '⚪ (Sin Token)'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Resumen de la Sede Seleccionada */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-xs">
                    <div className="p-2.5 rounded-xl bg-[#0A192F] border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Identificador Slug</span>
                      <span className="font-mono font-bold text-amber-300">{selectedTenantSlug}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#0A192F] border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Estado de WhatsApp</span>
                      <span className={`font-bold flex items-center gap-1 ${tenantForm.hasWhatsAppToken ? 'text-emerald-400' : 'text-slate-400'}`}>
                        <i data-lucide={tenantForm.hasWhatsAppToken ? 'check-circle-2' : 'alert-circle'} className="w-3 h-3"></i>
                        {tenantForm.hasWhatsAppToken ? 'Conectado / Cifrado' : 'Pendiente Token'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#0A192F] border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Motor de IA</span>
                      <span className="font-bold text-sky-300">
                        {tenantForm.hasGeminiKey ? 'Gemini Personalizado' : 'Servidor Central (.env)'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#0A192F] border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Estado de Sede</span>
                      <span className={`font-bold ${tenantForm.activa ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {tenantForm.activa ? '🟢 Activa (En línea)' : '🔴 Pausada'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Formulario de Configuración */}
                <form onSubmit={handleSaveTenant} className="space-y-4 text-xs">
                  
                  {/* Bloque 1: Meta WhatsApp Cloud API */}
                  <div className="rounded-2xl border border-slate-700 bg-[#1E293B] p-4 space-y-3.5 shadow-md">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h3 className="font-extrabold text-xs text-white flex items-center gap-2">
                        <i data-lucide="message-square" className="w-4 h-4 text-emerald-400"></i>
                        1. Credenciales Oficiales de Meta WhatsApp Cloud API
                      </h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30 font-bold">
                        🔐 Cifrado AES-256-GCM
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">
                          WhatsApp Phone Number ID:
                        </label>
                        <input
                          type="text"
                          value={tenantForm.whatsapp_phone_number_id}
                          onChange={(e) => setTenantForm({ ...tenantForm, whatsapp_phone_number_id: e.target.value })}
                          placeholder="Ej. 567890123456789"
                          className="w-full bg-[#0A192F] border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-[#FFC72C]"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          ID numérico asignado por Meta for Developers a esta línea telefónica.
                        </span>
                      </div>

                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">
                          Meta Access Token (Token de Sistema Permanente):
                        </label>
                        <input
                          type="password"
                          value={tenantForm.whatsapp_token}
                          onChange={(e) => setTenantForm({ ...tenantForm, whatsapp_token: e.target.value })}
                          placeholder={tenantForm.maskedWhatsAppToken || 'Escribe el nuevo token para actualizar...'}
                          className="w-full bg-[#0A192F] border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-[#FFC72C]"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {tenantForm.hasWhatsAppToken 
                            ? `Token actual cifrado: ${tenantForm.maskedWhatsAppToken} (Déjalo vacío para mantenerlo).`
                            : 'Genera este token permanente en Meta Business Suite.'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">
                          Webhook Verify Token (Token de Verificación):
                        </label>
                        <input
                          type="text"
                          value={tenantForm.meta_verify_token}
                          onChange={(e) => setTenantForm({ ...tenantForm, meta_verify_token: e.target.value })}
                          placeholder="unid_meta_verify_token_2026"
                          className="w-full bg-[#0A192F] border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-[#FFC72C]"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-slate-300 block mb-1 font-bold">
                          URL del Webhook para Meta Developers:
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={`${window.location.origin}/webhook`}
                            className="flex-1 bg-[#0A192F] border border-slate-700 rounded-xl px-3 py-2 text-slate-300 font-mono text-[11px] select-all cursor-text"
                          />
                          <button
                            type="button"
                            onClick={handleCopyWebhook}
                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition flex items-center gap-1 shrink-0"
                          >
                            <i data-lucide={copiedWebhook ? 'check' : 'copy'} className="w-3.5 h-3.5 text-amber-400"></i>
                            <span>{copiedWebhook ? '¡Copiado!' : 'Copiar'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Botón de Test de Conexión Live con Meta */}
                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={handleTestTenantWhatsApp}
                        disabled={tenantTesting}
                        className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold transition flex items-center gap-2 shadow self-start sm:self-auto"
                      >
                        <i data-lucide={tenantTesting ? 'loader-2' : 'zap'} className={`w-3.5 h-3.5 ${tenantTesting ? 'animate-spin' : 'text-amber-300'}`}></i>
                        <span>{tenantTesting ? 'Probando conexión con Meta...' : 'Probar Conexión con Meta Graph API'}</span>
                      </button>

                      <span className="text-[10px] text-slate-400">
                        Valida la validez del token y el número registrado en tiempo real.
                      </span>
                    </div>

                    {/* Resultado del Test de Conexión */}
                    {tenantTestResult && (
                      <div className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                        tenantTestResult.success 
                          ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-200' 
                          : 'bg-rose-950/70 border-rose-500/60 text-rose-200'
                      }`}>
                        <div className="flex items-center gap-2 font-bold">
                          <i data-lucide={tenantTestResult.success ? 'check-circle-2' : 'alert-triangle'} className="w-4 h-4"></i>
                          <span>{tenantTestResult.message || (tenantTestResult.success ? 'Conexión Exitosa con Meta' : 'Fallo en la Conexión')}</span>
                        </div>
                        {tenantTestResult.metaResponse && (
                          <div className="text-[11px] font-mono grid grid-cols-1 sm:grid-cols-3 gap-1 pt-1 text-slate-300">
                            <div>Teléfono: <strong>{tenantTestResult.metaResponse.display_phone_number || 'N/A'}</strong></div>
                            <div>Nombre: <strong>{tenantTestResult.metaResponse.verified_name || 'Sin verificar'}</strong></div>
                            <div>Calidad: <strong>{tenantTestResult.metaResponse.quality_rating || 'GREEN'}</strong></div>
                          </div>
                        )}
                        {tenantTestResult.error && (
                          <p className="text-[11px] text-rose-300 font-mono">{tenantTestResult.error}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bloque 2: Contacto & Notificaciones de Admisiones */}
                  <div className="rounded-2xl border border-slate-700 bg-[#1E293B] p-4 space-y-3.5 shadow-md">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h3 className="font-extrabold text-xs text-white flex items-center gap-2">
                        <i data-lucide="mail" className="w-4 h-4 text-amber-400"></i>
                        2. Contacto & Notificaciones por Correo de Admisiones
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">
                          Correo Institucional de Notificaciones (@unid.mx):
                        </label>
                        <input
                          type="email"
                          value={tenantForm.email_notificaciones}
                          onChange={(e) => setTenantForm({ ...tenantForm, email_notificaciones: e.target.value })}
                          placeholder={`admisiones.${selectedTenantSlug}@unid.mx`}
                          className="w-full bg-[#0A192F] border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-[#FFC72C]"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Recibe la ficha completa en PDF/HTML en cuanto el alumno finalice los 11 datos obligatorios.
                        </span>
                      </div>

                      <div className="flex items-center gap-3 pt-6">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={tenantForm.activa}
                            onChange={(e) => setTenantForm({ ...tenantForm, activa: e.target.checked })}
                            className="w-4 h-4 text-amber-500 rounded bg-[#0A192F] border-slate-700 focus:ring-0 cursor-pointer"
                          />
                          <span className="font-bold text-slate-200">
                            Habilitar recepción de mensajes en esta Sede
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Bloque 3: Llaves de IA & System Prompt Personalizado */}
                  <div className="rounded-2xl border border-slate-700 bg-[#1E293B] p-4 space-y-3.5 shadow-md">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h3 className="font-extrabold text-xs text-white flex items-center gap-2">
                        <i data-lucide="cpu" className="w-4 h-4 text-purple-400"></i>
                        3. Inteligencia Artificial Personalizada por Campus (Opcional)
                      </h3>
                      <span className="text-[10px] text-slate-400">
                        Opcional: Si se deja vacío, se usa la llave maestra del servidor.
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">
                          Google Gemini API Key de la Sede:
                        </label>
                        <input
                          type="password"
                          value={tenantForm.gemini_key}
                          onChange={(e) => setTenantForm({ ...tenantForm, gemini_key: e.target.value })}
                          placeholder={tenantForm.hasGeminiKey ? '•••••••••••••••• (Configurada)' : 'AIzaSy...'}
                          className="w-full bg-[#0A192F] border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-[#FFC72C]"
                        />
                      </div>

                      <div>
                        <label className="text-slate-300 block mb-1 font-bold">
                          OpenAI API Key de la Sede:
                        </label>
                        <input
                          type="password"
                          value={tenantForm.openai_key}
                          onChange={(e) => setTenantForm({ ...tenantForm, openai_key: e.target.value })}
                          placeholder={tenantForm.hasOpenAiKey ? '•••••••••••••••• (Configurada)' : 'sk-proj-...'}
                          className="w-full bg-[#0A192F] border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-[#FFC72C]"
                        />
                      </div>
                    </div>

                    <div className="pt-1">
                      <label className="text-slate-300 block mb-1 font-bold">
                        Instrucciones Específicas / Promociones Locales de este Campus:
                      </label>
                      <textarea
                        rows={3}
                        value={tenantForm.custom_prompt}
                        onChange={(e) => setTenantForm({ ...tenantForm, custom_prompt: e.target.value })}
                        placeholder={`Ejemplo: Promoción exclusiva para ${selectedTenantSlug}: 50% de descuento en inscripción durante el mes patrio...`}
                        className="w-full bg-[#0A192F] border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-[#FFC72C]"
                      />
                    </div>
                  </div>

                  {/* Barra de Guardado */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                      <i data-lucide="shield-check" className="w-4 h-4 text-emerald-400"></i>
                      <span>Los secretos son cifrados antes de insertarse en la tabla <code>sedes</code> de MariaDB.</span>
                    </div>

                    <button
                      type="submit"
                      disabled={tenantSaving}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] hover:from-[#F59E0B] hover:to-[#D97706] text-slate-950 font-black text-xs transition shadow-lg shadow-amber-900/30 flex items-center gap-2 active:scale-95"
                    >
                      <i data-lucide="save" className="w-4 h-4"></i>
                      <span>{tenantSaving ? 'Cifrando y Guardando...' : 'Guardar Configuración de Sede'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ====== TAB 8: CENTRO DE ONBOARDING & GUÍAS ====== */}
            {activeTab === 'onboarding' && (
              <div className="space-y-5">
                {/* Header Onboarding */}
                <div className="rounded-2xl border border-slate-700 bg-[#1E293B] p-5 space-y-2 shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg">
                      <i data-lucide="rocket" className="w-5 h-5"></i>
                    </div>
                    <div>
                      <h2 className="font-extrabold text-base text-white">
                        Centro de Onboarding & Guías de Despliegue Nacional
                      </h2>
                      <p className="text-xs text-slate-400">
                        Aprende cómo conectar WhatsApp Cloud API, entrenar la personalidad de Metal-Uriel y operar el tablero de admisiones en tu campus.
                      </p>
                    </div>
                  </div>

                  {/* Selector de Pasos */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-3">
                    <button
                      onClick={() => setOnboardingStep(1)}
                      className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                        onboardingStep === 1
                          ? 'bg-indigo-950/60 border-indigo-500/60 text-white shadow-md'
                          : 'bg-[#0A192F] border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                        onboardingStep === 1 ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'
                      }`}>
                        1
                      </div>
                      <div>
                        <span className="font-bold text-xs block">Meta for Developers</span>
                        <span className="text-[10px] text-slate-400">WhatsApp Cloud API</span>
                      </div>
                    </button>

                    <button
                      onClick={() => setOnboardingStep(2)}
                      className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                        onboardingStep === 2
                          ? 'bg-purple-950/60 border-purple-500/60 text-white shadow-md'
                          : 'bg-[#0A192F] border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                        onboardingStep === 2 ? 'bg-purple-500 text-white' : 'bg-slate-800 text-slate-300'
                      }`}>
                        2
                      </div>
                      <div>
                        <span className="font-bold text-xs block">Personalizar Asesor IA</span>
                        <span className="text-[10px] text-slate-400">Prompt & Planes SEP</span>
                      </div>
                    </button>

                    <button
                      onClick={() => setOnboardingStep(3)}
                      className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                        onboardingStep === 3
                          ? 'bg-amber-950/60 border-amber-500/60 text-white shadow-md'
                          : 'bg-[#0A192F] border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                        onboardingStep === 3 ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-300'
                      }`}>
                        3
                      </div>
                      <div>
                        <span className="font-bold text-xs block">Kanban & Admisiones</span>
                        <span className="text-[10px] text-slate-400">CRM & Exportación</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Contenido del Paso Seleccionado */}
                {onboardingStep === 1 && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
                    <div className="lg:col-span-2 rounded-2xl border border-slate-700 bg-[#1E293B] p-5 space-y-4 shadow-md">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">1</span>
                        <h3 className="font-extrabold text-sm text-white">
                          Conectar WhatsApp Business con Meta for Developers
                        </h3>
                      </div>

                      <ol className="space-y-3 text-slate-300 list-decimal list-inside leading-relaxed">
                        <li>
                          <strong className="text-white">Crear la App en Meta:</strong> Ingresa a <a href="https://developers.facebook.com" target="_blank" className="text-indigo-400 hover:underline">developers.facebook.com</a> con tu cuenta institucional de Meta, crea una aplicación de tipo <em>"Empresa" (Business)</em> y agrega el producto <em>WhatsApp</em>.
                        </li>
                        <li>
                          <strong className="text-white">Obtener el Phone Number ID:</strong> En la sección <em>WhatsApp &gt; Configuración de la API</em>, copia el <code>Identificador de número de teléfono</code>.
                        </li>
                        <li>
                          <strong className="text-white">Generar Token Permanente del Sistema:</strong> En <a href="https://business.facebook.com/settings" target="_blank" className="text-indigo-400 hover:underline">business.facebook.com/settings</a>, crea un <em>Usuario del Sistema</em> con rol Administrador, asígnale el activo de WhatsApp y genera un token con los permisos <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code>.
                        </li>
                        <li>
                          <strong className="text-white">Configurar el Webhook:</strong> En Meta Developers, coloca la URL de tu webhook (ej. <code>https://tu-dominio.com/webhook</code>) y el Verify Token configurado. Suscríbete al evento <code>messages</code>.
                        </li>
                      </ol>

                      <div className="p-3 rounded-xl bg-[#0A192F] border border-slate-800 flex items-center justify-between">
                        <span className="text-slate-300 font-mono text-[11px]">¿Listo para configurar tu sede?</span>
                        <button
                          onClick={() => setActiveTab('tenant_config')}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1 shadow"
                        >
                          <span>Ir a Configuración Sedes</span>
                          <i data-lucide="arrow-right" className="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </div>

                    {/* Tarjeta de Video Tutorial */}
                    <div className="rounded-2xl border border-indigo-500/40 bg-[#1E293B] p-4 flex flex-col justify-between shadow-md space-y-3">
                      <div>
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">Tutorial en Video</span>
                        <h4 className="font-extrabold text-sm text-white mt-1">
                          Cómo configurar Meta WhatsApp Cloud API en 5 Minutos
                        </h4>
                        <div className="mt-3 aspect-video rounded-xl bg-slate-900 border border-slate-700 flex flex-col items-center justify-center p-4 relative overflow-hidden group cursor-pointer">
                          <div className="w-12 h-12 rounded-full bg-indigo-600 group-hover:scale-110 text-white flex items-center justify-center shadow-lg transition">
                            <i data-lucide="play" className="w-5 h-5 ml-0.5"></i>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-2">Ver Tutorial de Meta Developers</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400">
                        💡 Este video explica cómo asociar un número fijo o celular de admisiones sin perder las conversaciones previas.
                      </div>
                    </div>
                  </div>
                )}

                {onboardingStep === 2 && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
                    <div className="lg:col-span-2 rounded-2xl border border-slate-700 bg-[#1E293B] p-5 space-y-4 shadow-md">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-xs">2</span>
                        <h3 className="font-extrabold text-sm text-white">
                          Personalización de la IA, Planes de Estudio & Anti-Alucinación
                        </h3>
                      </div>

                      <ul className="space-y-3 text-slate-300 list-disc list-inside leading-relaxed">
                        <li>
                          <strong className="text-white">Instrucciones del Sistema (System Prompt):</strong> Define el tono de voz de Metal-Uriel (Asertivo, Amigable o Ejecutivo) y agrega reglas sobre qué carreras ofrecer y cuáles derivar a modalidad Online.
                        </li>
                        <li>
                          <strong className="text-white">Folletos Oficiales SEP:</strong> Revisa en la pestaña <em>Planes de Estudio</em> que las materias y RVOE coincidan con el plan 2026 de tu campus.
                        </li>
                        <li>
                          <strong className="text-white">Pruebas en el Laboratorio:</strong> Utiliza el botón flotante <em>🧪 Laboratorio de Pruebas IA</em> para ejecutar casos reales de alumnos presenciales, foráneos y peticiones de PDF.
                        </li>
                      </ul>

                      <div className="p-3 rounded-xl bg-[#0A192F] border border-slate-800 flex items-center justify-between">
                        <span className="text-slate-300 font-mono text-[11px]">Ajusta la personalidad del bot ahora</span>
                        <button
                          onClick={() => setActiveTab('prompt')}
                          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1 shadow"
                        >
                          <span>Ir al Editor de Prompt</span>
                          <i data-lucide="arrow-right" className="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-purple-500/40 bg-[#1E293B] p-4 flex flex-col justify-between shadow-md space-y-3">
                      <div>
                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">Tutorial en Video</span>
                        <h4 className="font-extrabold text-sm text-white mt-1">
                          Entrenamiento y Calibración de Prompts de Admisión
                        </h4>
                        <div className="mt-3 aspect-video rounded-xl bg-slate-900 border border-slate-700 flex flex-col items-center justify-center p-4 relative overflow-hidden group cursor-pointer">
                          <div className="w-12 h-12 rounded-full bg-purple-600 group-hover:scale-110 text-white flex items-center justify-center shadow-lg transition">
                            <i data-lucide="play" className="w-5 h-5 ml-0.5"></i>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-2">Ver Demostración del Laboratorio</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400">
                        💡 Aprende cómo evitar que el modelo invente carreras médicas o de aviación que no existen en el catálogo UNID.
                      </div>
                    </div>
                  </div>
                )}

                {onboardingStep === 3 && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
                    <div className="lg:col-span-2 rounded-2xl border border-slate-700 bg-[#1E293B] p-5 space-y-4 shadow-md">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs">3</span>
                        <h3 className="font-extrabold text-sm text-white">
                          Operación del Tablero Kanban & Exportación a CRM
                        </h3>
                      </div>

                      <ul className="space-y-3 text-slate-300 list-disc list-inside leading-relaxed">
                        <li>
                          <strong className="text-white">Captura Automática:</strong> Cuando un prospecto chatea por WhatsApp, Metal-Uriel extrae de forma no invasiva los 11 campos clave y calcula su <em>Lead Score</em>.
                        </li>
                        <li>
                          <strong className="text-white">Flujo de Estados:</strong> El equipo de admisiones puede mover a los aspirantes entre <em>Nuevos &gt; Contactados &gt; En Proceso &gt; Inscritos</em>.
                        </li>
                        <li>
                          <strong className="text-white">Archivado Limpio:</strong> Una vez finalizado el ciclo, archiva a los aspirantes concluidos para mantener el tablero ordenado sin perder el historial.
                        </li>
                        <li>
                          <strong className="text-white">Descarga a Excel / CSV:</strong> Exporta toda la base de datos oficial para reportes directos a Dirección y Rectoría.
                        </li>
                      </ul>

                      <div className="p-3 rounded-xl bg-[#0A192F] border border-slate-800 flex items-center justify-between">
                        <span className="text-slate-300 font-mono text-[11px]">Explora el Tablero de Admisiones</span>
                        <button
                          onClick={() => setActiveTab('kanban')}
                          className="px-3 py-1.5 rounded-lg bg-[#FFC72C] hover:bg-[#F59E0B] text-slate-950 font-bold text-xs flex items-center gap-1 shadow"
                        >
                          <span>Ir al Tablero Kanban</span>
                          <i data-lucide="arrow-right" className="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-amber-500/40 bg-[#1E293B] p-4 flex flex-col justify-between shadow-md space-y-3">
                      <div>
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">Tutorial en Video</span>
                        <h4 className="font-extrabold text-sm text-white mt-1">
                          Flujo Diario de Admisiones y Cierre de Matrícula
                        </h4>
                        <div className="mt-3 aspect-video rounded-xl bg-slate-900 border border-slate-700 flex flex-col items-center justify-center p-4 relative overflow-hidden group cursor-pointer">
                          <div className="w-12 h-12 rounded-full bg-[#FFC72C] text-slate-950 group-hover:scale-110 flex items-center justify-center shadow-lg transition font-black">
                            <i data-lucide="play" className="w-5 h-5 ml-0.5"></i>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-2">Ver Tutorial de Admisiones</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400">
                        💡 Descubre cómo los asesores aumentan su tasa de conversión contactando por WhatsApp directo desde la ficha.
                      </div>
                    </div>
                  </div>
                )}

                {/* Acordeón de Preguntas Frecuentes (FAQ) */}
                <div className="rounded-2xl border border-slate-700 bg-[#1E293B] p-5 space-y-3 shadow-md">
                  <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                    <i data-lucide="help-circle" className="w-4 h-4 text-[#FFC72C]"></i>
                    Preguntas Frecuentes & Soporte Técnico (FAQ)
                  </h3>

                  <div className="space-y-2 pt-1 text-xs">
                    {[
                      {
                        q: '¿Cómo funciona la arquitectura Multi-Tenant SaaS?',
                        a: 'El backend procesa los mensajes entrantes de Meta WhatsApp leyendo el phone_number_id. En base a ese ID, localiza la sede correspondiente en la tabla sedes de MariaDB, descifra las credenciales con AES-256-GCM y responde con la configuración de dicho campus.'
                      },
                      {
                        q: '¿Qué ocurre si se agota la cuota del modelo de IA o falla la conexión?',
                        a: 'Metal-Uriel cuenta con un sistema de Respaldo en Cascada (Fallback) y Circuit Breaker automático. Si Google Gemini agota tokens o límites HTTP 429/403, salta en milisegundos a Anthropic Claude, OpenAI, DeepSeek o Groq Cloud sin interrumpir la plática del aspirante.'
                      },
                      {
                        q: '¿Cómo se protegen los datos personales de los aspirantes?',
                        a: 'Cumpliendo con los estándares de privacidad educativa y la Ley Federal de Protección de Datos Personales, los tokens y datos sensibles se cifran en reposo con AES-256-GCM y los accesos al panel requieren autenticación institucional Office 365 / JWT.'
                      },
                      {
                        q: '¿Podemos alojar una sola instancia central en la nube para todo México?',
                        a: 'Sí. Metal-Uriel está diseñado para correr en contenedores Docker o servicios de nube como DigitalOcean, AWS, Railway o Render, atendiendo a todas las sedes del país con un solo webhook central y base de datos distribuida.'
                      }
                    ].map((faq, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-800 bg-[#0A192F] overflow-hidden">
                        <button
                          onClick={() => setFaqOpenIndex(faqOpenIndex === idx ? null : idx)}
                          className="w-full p-3 text-left font-bold text-slate-200 flex items-center justify-between hover:text-amber-300 transition"
                        >
                          <span>{faq.q}</span>
                          <i data-lucide={faqOpenIndex === idx ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-slate-400"></i>
                        </button>
                        {faqOpenIndex === idx && (
                          <div className="px-3 pb-3 text-slate-400 text-[11px] leading-relaxed border-t border-slate-800/60 pt-2 bg-slate-900/40">
                            {faq.a}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= MODAL FLOTANTE: LABORATORIO DE PRUEBAS IA ================= */}
      {showTestSuiteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-purple-500/50 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden shadow-purple-950/70">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0F172A]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow">
                  <i data-lucide="flask-conical" className="w-4 h-4"></i>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                    Laboratorio de Pruebas IA & Casos Borde
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    Ejecuta flujos reales de admisión, solicitudes de PDF y pruebas anti-alucinación con un solo clic.
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setShowTestSuiteModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <i data-lucide="x" className="w-5 h-5"></i>
              </button>
            </div>

            {/* Categorías de Casos de Prueba */}
            <div className="px-4 pt-3 pb-2 border-b border-slate-800 flex items-center gap-2 overflow-x-auto bg-[#0A192F]/50">
              {TEST_SUITE_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedTestCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                    selectedTestCategory === cat.id
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {cat.title}
                </button>
              ))}
            </div>

            {/* Lista de Casos de la Categoría Seleccionada */}
            <div className="p-5 overflow-y-auto space-y-3 text-xs flex-1">
              {TEST_SUITE_CATEGORIES.find(c => c.id === selectedTestCategory)?.cases.map((tCase, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-700/80 hover:border-purple-400 transition space-y-2 group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-white group-hover:text-purple-300 transition">
                        {tCase.title}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300 font-mono">
                        {tCase.desc}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1.5 italic bg-[#1E293B]/60 p-2.5 rounded-xl border border-slate-800 leading-relaxed">
                      "{tCase.text}"
                    </p>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setInputText(tCase.text);
                        setShowTestSuiteModal(false);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                    >
                      Copiar al Input
                    </button>

                    <button
                      onClick={() => handleRunTestCase(tCase)}
                      className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-purple-950/50 active:scale-95"
                    >
                      <i data-lucide="play" className="w-3.5 h-3.5"></i>
                      <span>Ejecutar en Simulador</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-[#0F172A] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>💡 Puedes probar el rechazo automático de carreras no existentes o la derivación a Online.</span>
              <button
                onClick={() => setShowTestSuiteModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DE MONITOR DE SALUD & CIRCUIT BREAKER ================= */}
      {showHealthModal && healthFull && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-slate-700 rounded-3xl max-w-xl w-full flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0F172A]">
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <i data-lucide="activity" className="w-4 h-4 text-[#FFC72C]"></i>
                Monitor de Salud & Respaldo en Cascada
              </h3>
              <button 
                onClick={() => setShowHealthModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <i data-lucide="x" className="w-5 h-5"></i>
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[75vh]">
              
              {/* Circuit Breaker Status */}
              <div className="p-3.5 rounded-2xl bg-[#0A192F] border border-amber-500/40 space-y-1.5 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#FFC72C] flex items-center gap-2">
                    <i data-lucide="shield" className="w-4 h-4"></i> Circuit Breaker & Cooldown
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    healthFull.circuitBreaker?.cooldownsActive
                      ? 'bg-amber-950 text-amber-300 border-amber-500/40 animate-pulse'
                      : 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                  }`}>
                    {healthFull.circuitBreaker?.cooldownsActive ? '⏳ Cooldown Activo' : '🛡️ Todos Disponibles'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Si un modelo agota tokens o límites HTTP 429/403, se pone en enfriamiento por 10 min y el sistema salta al siguiente proveedor sin pausas.
                </p>
              </div>

              {/* MariaDB */}
              <div className="p-3.5 rounded-xl bg-[#0F172A] border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 flex items-center gap-2">
                    <i data-lucide="database" className="w-4 h-4 text-sky-400"></i> MariaDB Server Local
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    healthFull.services?.mariadb?.status === 'online'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-950 text-rose-300 border-rose-500/40'
                  }`}>
                    {healthFull.services?.mariadb?.status === 'online' ? '🟢 ONLINE' : '🔴 OFFLINE'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400 font-mono">
                  <div>Host: <span className="text-slate-200">{healthFull.services?.mariadb?.host}</span></div>
                  <div>Latencia: <span className="text-slate-200">{healthFull.services?.mariadb?.latencyMs}ms</span></div>
                  <div>Registros: <span className="text-slate-200">{healthFull.services?.mariadb?.totalRecords}</span></div>
                </div>
              </div>

              {/* Motores de IA Multi-Proveedor */}
              <div className="p-3.5 rounded-xl bg-[#0F172A] border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 flex items-center gap-2">
                    <i data-lucide="cpu" className="w-4 h-4 text-amber-400"></i> Estado de Proveedores LLM
                  </span>
                  <span className="text-[10px] font-mono text-amber-300">Activo: {healthFull.services?.aiEngines?.activeModel}</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-xl bg-[#0A192F] border border-slate-800 flex items-center justify-between">
                    <span>✨ Google Gemini:</span>
                    <strong className={
                      healthFull.services?.aiEngines?.gemini?.status === 'online' ? 'text-emerald-400' :
                      healthFull.services?.aiEngines?.gemini?.status === 'cooldown' ? 'text-amber-400' : 'text-slate-500'
                    }>
                      {healthFull.services?.aiEngines?.gemini?.status === 'online' ? '🟢 Listo' :
                       healthFull.services?.aiEngines?.gemini?.status === 'cooldown' ? `⏳ Cooldown (${healthFull.services.aiEngines.gemini.cooldownSec}s)` : '⚪ Sin Key'}
                    </strong>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#0A192F] border border-slate-800 flex items-center justify-between">
                    <span>🔮 Anthropic Claude:</span>
                    <strong className={
                      healthFull.services?.aiEngines?.claude?.status === 'online' ? 'text-emerald-400' :
                      healthFull.services?.aiEngines?.claude?.status === 'cooldown' ? 'text-amber-400' : 'text-slate-500'
                    }>
                      {healthFull.services?.aiEngines?.claude?.status === 'online' ? '🟢 Listo' :
                       healthFull.services?.aiEngines?.claude?.status === 'cooldown' ? `⏳ Cooldown (${healthFull.services.aiEngines.claude.cooldownSec}s)` : '⚪ Sin Key'}
                    </strong>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#0A192F] border border-slate-800 flex items-center justify-between">
                    <span>🤖 OpenAI:</span>
                    <strong className={
                      healthFull.services?.aiEngines?.openai?.status === 'online' ? 'text-emerald-400' :
                      healthFull.services?.aiEngines?.openai?.status === 'cooldown' ? 'text-amber-400' : 'text-slate-500'
                    }>
                      {healthFull.services?.aiEngines?.openai?.status === 'online' ? '🟢 Listo' :
                       healthFull.services?.aiEngines?.openai?.status === 'cooldown' ? `⏳ Cooldown (${healthFull.services.aiEngines.openai.cooldownSec}s)` : '⚪ Sin Key'}
                    </strong>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#0A192F] border border-slate-800 flex items-center justify-between">
                    <span>🐳 DeepSeek:</span>
                    <strong className={
                      healthFull.services?.aiEngines?.deepseek?.status === 'online' ? 'text-emerald-400' :
                      healthFull.services?.aiEngines?.deepseek?.status === 'cooldown' ? 'text-amber-400' : 'text-slate-500'
                    }>
                      {healthFull.services?.aiEngines?.deepseek?.status === 'online' ? '🟢 Listo' :
                       healthFull.services?.aiEngines?.deepseek?.status === 'cooldown' ? `⏳ Cooldown (${healthFull.services.aiEngines.deepseek.cooldownSec}s)` : '⚪ Sin Key'}
                    </strong>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#0A192F] border border-slate-800 flex items-center justify-between sm:col-span-2">
                    <span>⚡ Groq Cloud (Llama 3.3):</span>
                    <strong className={
                      healthFull.services?.aiEngines?.groq?.status === 'online' ? 'text-emerald-400' :
                      healthFull.services?.aiEngines?.groq?.status === 'cooldown' ? 'text-amber-400' : 'text-slate-500'
                    }>
                      {healthFull.services?.aiEngines?.groq?.status === 'online' ? '🟢 Listo' :
                       healthFull.services?.aiEngines?.groq?.status === 'cooldown' ? `⏳ Cooldown (${healthFull.services.aiEngines.groq.cooldownSec}s)` : '⚪ Sin Key'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Meta WhatsApp */}
              <div className="p-3.5 rounded-xl bg-[#0F172A] border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 flex items-center gap-2">
                    <i data-lucide="message-square" className="w-4 h-4 text-emerald-400"></i> Meta WhatsApp Cloud API
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-500/40">
                    {healthFull.services?.metaWhatsApp?.status === 'configured' ? '🟢 OFICIAL META' : '🔵 SIMULADOR LOCAL'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Ruta del Webhook: <code className="text-slate-200 bg-slate-900 px-1 py-0.5 rounded">/webhook</code>
                </p>
              </div>
            </div>

            <div className="p-4 bg-[#0F172A] border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowHealthModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DE LOGIN INSTITUCIONAL O365 & JWT ================= */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-amber-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 shadow-amber-950/40">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#FFC72C] to-[#F59E0B] flex items-center justify-center text-slate-950 font-black text-sm shadow">
                  :UNID
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Acceso al Centro de Mando</h3>
                  <span className="text-[10px] text-slate-400">Microsoft 365 & Control de Roles (RBAC)</span>
                </div>
              </div>
              {authToken && (
                <button 
                  onClick={() => setShowLoginModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <i data-lucide="x" className="w-5 h-5"></i>
                </button>
              )}
            </div>

            {/* Selector Rápido de Cuentas para Testing */}
            <div className="space-y-1.5 p-3 rounded-2xl bg-[#0A192F] border border-slate-700/80">
              <span className="text-[10px] font-bold text-amber-300 block uppercase tracking-wider">
                ⚡ Acceso Rápido para Testing (Selecciona un Rol):
              </span>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setO365Email('00774343@red.unid.mx');
                    setO365Name('Luis Felipe Pérez (Admin Sistemas)');
                    setLoginForm({ username: '00774343@red.unid.mx', password: 'admin', error: '', loading: false });
                  }}
                  className="p-2 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/50 text-left transition"
                >
                  <div className="text-[11px] font-extrabold text-amber-300 flex items-center gap-1">
                    <i data-lucide="shield-alert" className="w-3 h-3"></i>
                    <span>Admin (Sistemas)</span>
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono mt-0.5">00774343 / admin</div>
                  <div className="text-[9px] text-emerald-400 font-bold mt-0.5">8 Pestañas Completas</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setO365Email('67676767@red.unid.mx');
                    setO365Name('Equipo de Admisiones (Campus Campeche)');
                    setLoginForm({ username: '67676767@red.unid.mx', password: 'user', error: '', loading: false });
                  }}
                  className="p-2 rounded-xl bg-sky-950/60 hover:bg-sky-900/80 border border-sky-500/50 text-left transition"
                >
                  <div className="text-[11px] font-extrabold text-sky-300 flex items-center gap-1">
                    <i data-lucide="users" className="w-3 h-3"></i>
                    <span>Usuario (Admisiones)</span>
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono mt-0.5">67676767 / user</div>
                  <div className="text-[9px] text-sky-400 font-bold mt-0.5">5 Pestañas Operativas</div>
                </button>
              </div>
            </div>

            {/* Pestañas de Acceso */}
            <div className="flex items-center gap-1 bg-[#0A192F] p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setAuthTab('o365')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                  authTab === 'o365' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <i data-lucide="globe" className="w-3.5 h-3.5"></i>
                <span>Office 365 UNID</span>
              </button>

              <button
                type="button"
                onClick={() => setAuthTab('local')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                  authTab === 'local' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <i data-lucide="key" className="w-3.5 h-3.5"></i>
                <span>Login Directo</span>
              </button>
            </div>

            {loginForm.error && (
              <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/60 text-rose-200 text-xs flex items-center gap-2">
                <i data-lucide="alert-circle" className="w-4 h-4 text-rose-400 shrink-0"></i>
                <span>{loginForm.error}</span>
              </div>
            )}

            {authTab === 'o365' ? (
              <form onSubmit={handleLoginSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="text-slate-300 block mb-1 font-bold">Correo Institucional (@red.unid.mx):</label>
                  <input
                    type="email"
                    value={o365Email}
                    onChange={(e) => setO365Email(e.target.value)}
                    placeholder="00774343@red.unid.mx"
                    required
                    className="w-full bg-[#0A192F] border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-[#FFC72C]"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-bold">Nombre del Asesor / Personal:</label>
                  <input
                    type="text"
                    value={o365Name}
                    onChange={(e) => setO365Name(e.target.value)}
                    placeholder="Luis Felipe Pérez (Admin Sistemas)"
                    required
                    className="w-full bg-[#0A192F] border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-[#FFC72C]"
                  />
                </div>

                <div className="p-2.5 rounded-xl bg-[#0A192F] border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                  <i data-lucide="check-circle-2" className="w-4 h-4 text-emerald-400 shrink-0"></i>
                  <span>Validado con Azure Entra ID para la red educativa Talisis UNID.</span>
                </div>

                <button
                  type="submit"
                  disabled={loginForm.loading}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/30 active:scale-95"
                >
                  <i data-lucide="log-in" className="w-4 h-4"></i>
                  <span>{loginForm.loading ? 'Verificando con Microsoft...' : 'Iniciar Sesión con Office 365'}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleLoginSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="text-slate-300 block mb-1 font-bold">Usuario / Correo Institucional:</label>
                  <input
                    type="text"
                    value={loginForm.username}
                    onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                    placeholder="00774343@red.unid.mx"
                    required
                    className="w-full bg-[#0A192F] border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-[#FFC72C]"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-bold">Contraseña:</label>
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    placeholder="admin o user"
                    required
                    className="w-full bg-[#0A192F] border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-[#FFC72C]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loginForm.loading}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#FFC72C] to-[#F59E0B] hover:from-[#F59E0B] hover:to-[#D97706] text-slate-950 font-black transition flex items-center justify-center gap-2 shadow-lg shadow-amber-900/30 active:scale-95"
                >
                  <i data-lucide="key" className="w-4 h-4"></i>
                  <span>{loginForm.loading ? 'Accediendo...' : 'Acceder al Panel'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ================= REPRODUCTOR DE BGM METAL SONIC (YOUTUBE IFRAME API) ================= */}
      <div className="hidden pointer-events-none opacity-0 select-none">
        <iframe
          id="metal-sonic-bgm-iframe"
          width="200"
          height="120"
          src="https://www.youtube.com/embed/nR9BxVgma_8?enablejsapi=1&start=1515&version=3&loop=1&playlist=nR9BxVgma_8"
          title="Metal Sonic Cyber Soundtrack"
          allow="autoplay"
        ></iframe>
      </div>

      {/* ================= MODAL DE DETALLE DE ASPIRANTE ================= */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-slate-700 rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0F172A]">
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <i data-lucide="file-text" className="w-4 h-4 text-[#FFC72C]"></i>
                Ficha Oficial del Aspirante #{selectedLead.id}
              </h3>
              <button 
                onClick={() => setSelectedLead(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <i data-lucide="x" className="w-5 h-5"></i>
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
              
              <div className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-700 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#FFC72C]">⚡ Lead Scoring & Resumen IA:</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-bold text-[10px]">
                    {selectedLead.nivel_interes || 'Alto'} 🔥
                  </span>
                </div>
                <p className="text-slate-200 italic leading-relaxed">
                  "{selectedLead.resumen_ia || 'Aspirante con registro completo y datos confirmados.'}"
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded-xl bg-[#0F172A] border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Nombre Completo</span>
                  <span className="font-bold text-white">{selectedLead.nombre_completo}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0F172A] border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Carrera de Interés</span>
                  <span className="font-bold text-amber-300">{selectedLead.carrera_interes}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0F172A] border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Modalidad</span>
                  <span className="font-bold text-white">{selectedLead.modalidad_estudios}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0F172A] border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Campus</span>
                  <span className="font-bold text-white">{selectedLead.campus_interes}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0F172A] border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Teléfono Celular</span>
                  <span className="font-bold text-white flex items-center gap-1">
                    {selectedLead.telefono_celular}
                    <a
                      href={`https://wa.me/${selectedLead.telefono_celular ? selectedLead.telefono_celular.replace(/\D/g, '') : ''}`}
                      target="_blank"
                      className="text-emerald-400 hover:underline ml-1 font-bold"
                    >
                      [WA]
                    </a>
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0F172A] border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Correo Electrónico</span>
                  <span className="font-bold text-white">{selectedLead.correo_electronico}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0F172A] border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Fecha Nacimiento</span>
                  <span className="font-bold text-white">{selectedLead.fecha_nacimiento}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0F172A] border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Bachillerato</span>
                  <span className="font-bold text-white">{selectedLead.bachillerato_procedencia}</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#0F172A] border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Dirección y Código Postal</span>
                <span className="font-bold text-white">{selectedLead.direccion} (CP: {selectedLead.codigo_postal})</span>
              </div>

              {selectedLead.raw_json_data && (
                <div className="space-y-1">
                  <span className="text-slate-400 text-[10px] font-mono">Payload JSON de Integración:</span>
                  <pre className="p-2.5 rounded-xl bg-[#0A192F] border border-slate-800 text-[10px] text-emerald-400 font-mono overflow-x-auto max-h-32">
                    {typeof selectedLead.raw_json_data === 'string'
                      ? selectedLead.raw_json_data
                      : JSON.stringify(selectedLead.raw_json_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-4 bg-[#0F172A] border-t border-slate-800 flex items-center justify-between">
              <a
                href={'https://wa.me/' + (selectedLead.telefono_celular ? selectedLead.telefono_celular.replace(/\D/g, '') : '')}
                target="_blank"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-900/30"
              >
                <i data-lucide="message-square" className="w-3.5 h-3.5"></i>
                <span>Contactar por WhatsApp</span>
              </a>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleArchiveLead(selectedLead.id, Boolean(selectedLead.archivado))}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition flex items-center gap-1"
                >
                  <i data-lucide={selectedLead.archivado ? 'arrow-up-circle' : 'archive'} className="w-3.5 h-3.5"></i>
                  <span>{selectedLead.archivado ? 'Desarchivar' : 'Archivar'}</span>
                </button>

                <button
                  onClick={() => setSelectedLead(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
