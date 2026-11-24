
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

export { REQUIRED_FIELDS, KANBAN_COLUMNS, DEFAULT_CAMPUSES, TEST_SUITE_CATEGORIES, formatTimeAgo };
