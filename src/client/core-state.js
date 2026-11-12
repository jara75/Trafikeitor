/**
 * TRAFIKEITOR // CORE STATE, CONSTANTES Y EVENT BUS
 * Módulo 1: Fuente de verdad del estado en memoria y desacoplamiento de eventos.
 */

// ============================================================================
// CONSTANTES DE ALMACENAMIENTO Y CATÁLOGOS MAESTROS
// ============================================================================
export const STORAGE_KEY = 'resolve_traffic_orders_v2';
export const CLIENTS_STORAGE_KEY = 'resolve_traffic_clients_v2';
export const STATUSES_STORAGE_KEY = 'resolve_traffic_statuses_v2';
export const STRIPBOARD_STORAGE_KEY = 'resolve_traffic_stripboard_v2';
export const RESPONSIBLES_STORAGE_KEY = 'resolve_traffic_responsibles_v2';
export const DEPARTMENTS_STORAGE_KEY = 'resolve_traffic_departments_v2';
export const USER_PROFILE_STORAGE_KEY = 'resolve_traffic_user_profile_v2';

export const CLIENT_COLOR_PALETTE = [
  { name: 'emerald', label: 'Esmeralda', hex: '#34d399', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', badge: 'bg-emerald-950/40 text-emerald-300 border-emerald-700/60', dot: 'bg-emerald-400' },
  { name: 'sky',     label: 'Azul Cielo', hex: '#38bdf8', text: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     badge: 'bg-sky-950/40 text-sky-300 border-sky-700/60',         dot: 'bg-sky-400' },
  { name: 'violet',  label: 'Violeta', hex: '#a78bfa', text: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  badge: 'bg-violet-950/40 text-violet-300 border-violet-700/60', dot: 'bg-violet-400' },
  { name: 'amber',   label: 'Ámbar', hex: '#fbbf24', text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   badge: 'bg-amber-950/40 text-amber-300 border-amber-700/60',   dot: 'bg-amber-400' },
  { name: 'rose',    label: 'Rosa', hex: '#fb7185', text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    badge: 'bg-rose-950/40 text-rose-300 border-rose-700/60',       dot: 'bg-rose-400' },
  { name: 'cyan',    label: 'Cian', hex: '#22d3ee', text: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30',    badge: 'bg-cyan-950/40 text-cyan-300 border-cyan-700/60',       dot: 'bg-cyan-400' },
  { name: 'fuchsia', label: 'Fucsia', hex: '#e879f9', text: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/30', badge: 'bg-fuchsia-950/40 text-fuchsia-300 border-fuchsia-700/60', dot: 'bg-fuchsia-400' },
  { name: 'lime',    label: 'Lima', hex: '#a3e635', text: 'text-lime-400',    bg: 'bg-lime-500/10',    border: 'border-lime-500/30',    badge: 'bg-lime-950/40 text-lime-300 border-lime-700/60',       dot: 'bg-lime-400' },
  { name: 'orange',  label: 'Naranja', hex: '#fb923c', text: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  badge: 'bg-orange-950/40 text-orange-300 border-orange-700/60', dot: 'bg-orange-400' },
  { name: 'teal',    label: 'Verde Azulado', hex: '#2dd4bf', text: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/30',    badge: 'bg-teal-950/40 text-teal-300 border-teal-700/60',       dot: 'bg-teal-400' }
];

export const USER_AVATAR_ICONS = {
  pen: {
    label: 'Copy / Pluma',
    svg: '<svg class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>'
  },
  clapper: {
    label: 'Dirección / Claqueta',
    svg: '<svg class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="12" rx="2"/><path stroke-linecap="round" stroke-linejoin="round" d="M3 9l3-6h14l-3 6M9 3l3 6M15 3l3 6"/></svg>'
  },
  bezier: {
    label: 'Arte / Vector',
    svg: '<svg class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="9.5" y="16" width="5" height="5" rx="1"/><path stroke-linecap="round" stroke-linejoin="round" d="M5.5 8v3a6.5 6.5 0 006.5 6.5M18.5 8v3A6.5 6.5 0 0112 17.5"/></svg>'
  },
  megaphone: {
    label: 'Cuentas / Medios',
    svg: '<svg class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5L6 9H2v6h4l5 4V5z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></svg>'
  },
  clock: {
    label: 'Control de Tráfico',
    svg: '<svg class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 3"/></svg>'
  },
  code: {
    label: 'Desarrollo / Web',
    svg: '<svg class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 18l6-6-6-6M8 6l-6 6 6 6M14 4l-4 16"/></svg>'
  },
  glasses: {
    label: 'Estrategia / Planning',
    svg: '<svg class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="6" cy="14" r="4"/><circle cx="18" cy="14" r="4"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 14h4M2 12l2-4 2-1M22 12l-2-4-2-1"/></svg>'
  },
  bolt: {
    label: 'Producción / Energía',
    svg: '<svg class="w-full h-full" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>'
  }
};

export const DEFAULT_USER_PROFILE = {
  fullName: 'Andrés Jaramillo',
  shortName: 'Andrés J.',
  email: 'contacto@marcanter.com',
  color: 'cyan',
  avatarMode: 'initials', // 'initials' | 'icon' | 'image'
  avatarIcon: 'pen',
  avatarImage: '',
  departments: ['Cuentas', 'Tráfico', 'Creativos']
};

export const defaultResponsibles = [
  "Andrés J."
];

export const legacyGenericRoles = [
  "Cuentas",
  "Creativos",
  "Redacción / Copy",
  "Dirección de Arte",
  "Dirección Creativa",
  "Control de Tráfico",
  "Producción Audiovisual",
  "Artes Finales / Preprensa",
  "Cliente"
];

export const defaultDepartments = [
  "Cliente",
  "Tráfico",
  "Cuentas",
  "Creativos",
  "Producción",
  "Medios",
  "Web",
  "Desarrollo",
  "Sistemas",
  "Administrativo"
];

export const defaultStatuses = [
  { id: "st-1", name: "Tráfico", color: "amber" },
  { id: "st-2", name: "Recibido", color: "blue" },
  { id: "st-3", name: "Desarrollo", color: "purple" },
  { id: "st-4", name: "Cliente", color: "cyan" },
  { id: "st-5", name: "Entregado", color: "emerald" },
  { id: "st-6", name: "Facturación", color: "yellow" },
  { id: "st-7", name: "Cerrado", color: "stone" },
  { id: "st-8", name: "Cancelado", color: "red" }
];

export const statusDescriptions = {
  "Tráfico": "OT abierta pero le falta información.",
  "Recibido": "Ya entró la OT con información completa, pero no se ha empezado a trabajar.",
  "Desarrollo": "Programada, con tiempo de trabajo asignado y en ejecución.",
  "Cliente": "Presentada al cliente para revisión y aprobación (si no aprueba vuelve a Desarrollo; si aprueba pasa a Entregado).",
  "Entregado": "Entregada o publicada, pendiente de facturar.",
  "Facturación": "Factura presentada, pendiente de pago.",
  "Cerrado": "Pago recibido; la OT se cierra y se archiva.",
  "Cancelado": "Se cierra sin trabajar/terminar porque ya no se va a realizar."
};

export const CODE_EXTS = [
  'html', 'htm', 'js', 'mjs', 'jsx', 'ts', 'tsx', 'css', 'scss', 'sass',
  'json', 'py', 'sh', 'bash', 'zsh', 'sql', 'xml', 'yaml', 'yml', 'php',
  'rb', 'go', 'rs', 'c', 'cpp', 'h', 'txt', 'csv', 'svg'
];

export const SUITE_DEFS = {
  ai:       { type: 'adobe',    badge: 'AI',    sub: 'Illustrator',       color: '#ff9a00', brand: 'ADOBE CREATIVE CLOUD' },
  psd:      { type: 'adobe',    badge: 'PSD',   sub: 'Photoshop',         color: '#31a8ff', brand: 'ADOBE CREATIVE CLOUD' },
  psb:      { type: 'adobe',    badge: 'PSB',   sub: 'Photoshop Large',   color: '#31a8ff', brand: 'ADOBE CREATIVE CLOUD' },
  indd:     { type: 'adobe',    badge: 'INDD',  sub: 'InDesign',          color: '#ff3366', brand: 'ADOBE CREATIVE CLOUD' },
  prproj:   { type: 'adobe',    badge: 'PR',    sub: 'Premiere Pro',      color: '#ea77ff', brand: 'ADOBE CREATIVE CLOUD' },
  aep:      { type: 'adobe',    badge: 'AEP',   sub: 'After Effects',     color: '#9999ff', brand: 'ADOBE CREATIVE CLOUD' },
  af:       { type: 'affinity', badge: 'AF',    sub: 'Affinity',          color: '#00d2d3', brand: 'AFFINITY' },
  pages:    { type: 'pages',    badge: 'PAGES', sub: 'Apple Pages',       color: '#f59e0b', brand: 'APPLE iWORK' },
  key:      { type: 'pages',    badge: 'KEY',   sub: 'Apple Keynote',     color: '#3b82f6', brand: 'APPLE iWORK' },
  numbers:  { type: 'pages',    badge: 'NUM',   sub: 'Apple Numbers',     color: '#10b981', brand: 'APPLE iWORK' },
  docx:     { type: 'word',     badge: 'DOCX',  sub: 'Microsoft Word',    color: '#2563eb', brand: 'MICROSOFT 365' },
  doc:      { type: 'word',     badge: 'DOC',   sub: 'Microsoft Word',    color: '#2563eb', brand: 'MICROSOFT 365' },
  xlsx:     { type: 'word',     badge: 'XLSX',  sub: 'Microsoft Excel',   color: '#10b981', brand: 'MICROSOFT 365' },
  xls:      { type: 'word',     badge: 'XLS',   sub: 'Microsoft Excel',   color: '#10b981', brand: 'MICROSOFT 365' },
  pptx:     { type: 'word',     badge: 'PPTX',  sub: 'PowerPoint',        color: '#ea580c', brand: 'MICROSOFT 365' },
  ppt:      { type: 'word',     badge: 'PPT',   sub: 'PowerPoint',        color: '#ea580c', brand: 'MICROSOFT 365' }
};

// ============================================================================
// OBJETO DE ESTADO MUTABLE CENTRALIZADO
// ============================================================================
export const state = {
  currentMainView: 'desk',              // 'desk' | 'stripboard'
  currentDeskMode: 'list',              // 'grid' | 'list'
  currentStripboardSubView: 'day',      // 'day' | 'week' | 'gantt' | 'month'
  currentStripboardDate: '',            // 'YYYY-MM-DD'
  selectedTreeFilter: {
    type: 'all',                        // 'all' | 'client' | 'brand'
    client: null,
    brand: null
  },
  currentTableSort: {
    field: 'otNumber',                  // 'none' | 'otNumber' | 'client' | 'brand' | 'inDate' | 'outDate' | 'status' | 'responsible' | 'department'
    dir: 'asc'                          // 'asc' | 'desc'
  },
  currentTableGroup: 'client',          // 'none' | 'client' | 'status' | 'responsible' | 'department'
  collapsedGroupKeys: new Set(),
  filterUrgentOnly: false,              // true para filtrar solo OTs marcadas como urgentes
  hideTreeBadges: typeof localStorage !== 'undefined' ? (localStorage.getItem('resolve_hide_tree_badges') === 'true') : false,
  activeOtId: null,
  activeOtTab: 'route',                 // 'route' | 'media' | 'specs'
  activeCustomTaskIndex: null,
  activeCustomTaskDate: null,
  currentStampIndex: null,
  selectedMediaIndex: 0,
  inlineCodeViewMode: 'code',           // 'code' | 'preview'
  inlineMarkdownViewMode: 'rendered',   // 'rendered' | 'raw'
  inlineFontSize: 26,
  modalPreviewIndex: 0,
  dragState: {
    isDragging: false,
    sourceType: null,                   // 'table-row' | 'strip' | 'pool-ot'
    sourceDate: null,
    sourceIndex: null,
    sourceContext: null,                // 'trafico' | 'stripboard'
    otId: null,
    dropTargetIndex: null,
    dropTargetOtId: null,
    dropPosition: null                  // 'before' | 'after'
  }
};

// ============================================================================
// EVENT BUS NATIVO
// ============================================================================
const eventBus = new EventTarget();

export function on(eventName, handler) {
  eventBus.addEventListener(eventName, handler);
}

export function off(eventName, handler) {
  eventBus.removeEventListener(eventName, handler);
}

export function emit(eventName, detail = null) {
  eventBus.dispatchEvent(new CustomEvent(eventName, { detail }));
}

// ============================================================================
// FUNCIONES DE CONTROL DE ESTADO Y ARRASTRE
// ============================================================================
export function resetDragState() {
  state.dragState.isDragging = false;
  state.dragState.sourceType = null;
  state.dragState.sourceDate = null;
  state.dragState.sourceIndex = null;
  state.dragState.sourceContext = null;
  state.dragState.otId = null;
  state.dragState.dropTargetIndex = null;
  state.dragState.dropTargetOtId = null;
  state.dragState.dropPosition = null;
}

export function pauseRowDrag(el) {
  if (!el || !el.closest) return;
  const row = el.closest('.stripboard-row, [draggable="true"]');
  if (row) {
    row.setAttribute('draggable', 'false');
    row.dataset.dragPaused = 'true';
  }
}

export function resumeRowDrag(el) {
  if (!el || !el.closest) return;
  const row = el.closest('.stripboard-row, [data-drag-paused="true"]');
  if (row) {
    row.setAttribute('draggable', 'true');
    delete row.dataset.dragPaused;
  }
}

export function clearStripDropIndicators() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.stripboard-row, tr.stripboard-row').forEach(row => {
    row.classList.remove('drop-before', 'drop-after', 'dragging');
  });
  const container = document.getElementById('stripboard-strips-container');
  if (container) container.classList.remove('drag-over-empty');
  document.querySelectorAll('.week-day-col, .gantt-track-lane, .month-day-cell').forEach(el => {
    el.classList.remove('ring-1', 'ring-amber-500', 'bg-amber-950/10');
  });
}

// ============================================================================
// EXPOSICIÓN GLOBAL EN WINDOW
// ============================================================================
if (typeof window !== 'undefined') {
  window.emit = emit;
}

