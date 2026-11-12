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
  collapsedTreeClients: new Set(),
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

