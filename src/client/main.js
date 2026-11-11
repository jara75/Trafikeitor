/**
 * TRAFIKEITOR // PUNTO DE ENTRADA Y ORQUESTADOR PRINCIPAL
 * Módulo 0: Inicialización del sistema, arranque reactivo, delegación de eventos raíz (data-action),
 * atajos de teclado y sincronización de vistas.
 */

import {
  state,
  emit,
  on
} from './core-state.js';

import {
  bootstrap,
  scheduleSync
} from './data-bridge.js';

import {
  renderTrafficDesk,
  renderBinTree,
  renderStatusSelects,
  renderResponsibleSelects,
  syncSortAndGroupControls,
  setTableSort,
  toggleTableSortDirection,
  setTableGroup,
  toggleSidebar,
  setMainDeskView,
  refreshAllViews
} from './traffic-desk-view.js';

import {
  initStripboard,
  renderStripboard,
  renderStripboardPendingPool,
  setStripboardViewMode,
  selectStripboardDate,
  handleStripboardDateChange,
  setStripboardToToday,
  changeStripboardDay,
  setStripboardPoolFilter,
  addOtToStripboard,
  addBreakStripPrompt,
  autoPopulatePendingOts,
  clearTodayStripboard,
  printStripboard,
  updateDeptOptionsDatalist
} from './stripboard-engine-view.js';

import {
  openEnvelopeModal,
  closeEnvelopeModal,
  switchOtTab,
  updateActiveOtField,
  deleteActiveOt,
  scheduleActiveOtFromModal,
  addNewRouteRow,
  openStampModal,
  closeStampModal,
  applyStamp,
  clearCurrentStamp,
  setMediaPoolView,
  promptAddMediaLink,
  openMediaPreviewModal,
  closeMediaPreviewModal,
  stepSelectedMediaItem,
  openNewOtModal,
  closeNewOtModal,
  handleCreateOt,
  syncNewOtBrandSuggestions,
  updateClientsDatalist,
  openClientModal,
  closeClientModal,
  handleSaveClient,
  deleteClientAction,
  openBrandModal,
  closeBrandModal,
  handleSaveBrand,
  deleteBrandAction,
  openStatusManagerModal,
  closeStatusManagerModal,
  handleCreateStatus,
  deleteStatusAction,
  openCustomTaskModal,
  closeCustomTaskModal,
  saveCustomTaskModal,
  deleteCustomTaskFromModal,
  exportBackupData,
  importBackupData
} from './modals-controller.js';

// ============================================================================
// CONMUTACIÓN DE VISTA PRINCIPAL (MESA DE TRÁFICO vs STRIPBOARD)
// ============================================================================

export function switchMainView(view) {
  state.currentMainView = view;
  if (typeof document === 'undefined') return;

  const deskEl = document.getElementById('app-view-desk');
  const stripboardEl = document.getElementById('app-view-stripboard');
  const btnDesk = document.getElementById('nav-btn-desk');
  const btnStripboard = document.getElementById('nav-btn-stripboard');

  if (view === 'desk') {
    if (deskEl) deskEl.classList.remove('hidden');
    if (stripboardEl) stripboardEl.classList.add('hidden');
    if (btnDesk) {
      btnDesk.className = "h-6 px-2.5 rounded font-medium transition-all bg-white/[0.12] text-white shadow-xs border border-white/[0.08] flex items-center gap-1.5 cursor-pointer";
    }
    if (btnStripboard) {
      btnStripboard.className = "h-6 px-2.5 rounded font-medium transition-all text-resolve-dimText hover:text-white flex items-center gap-1.5 cursor-pointer";
    }
    renderTrafficDesk();
  } else {
    if (deskEl) deskEl.classList.add('hidden');
    if (stripboardEl) stripboardEl.classList.remove('hidden');
    if (btnStripboard) {
      btnStripboard.className = "h-6 px-2.5 rounded font-medium transition-all bg-white/[0.12] text-white shadow-xs border border-white/[0.08] flex items-center gap-1.5 cursor-pointer";
    }
    if (btnDesk) {
      btnDesk.className = "h-6 px-2.5 rounded font-medium transition-all text-resolve-dimText hover:text-white flex items-center gap-1.5 cursor-pointer";
    }
    initStripboard();
  }
}

on('view:switch', e => {
  if (e && e.detail && e.detail.view) {
    switchMainView(e.detail.view);
  }
});

// ============================================================================
// SISTEMA DE DELEGACIÓN DE EVENTOS RAÍZ (DATA-ACTION DISPATCHER)
// ============================================================================

function setupEventDelegation() {
  if (typeof document === 'undefined') return;

  // 1. Delegación de Clics
  document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    switch (action) {
      case 'switch-main-view':
        switchMainView(actionEl.dataset.view);
        break;
      case 'open-new-ot':
        openNewOtModal();
        break;
      case 'close-new-ot':
        closeNewOtModal();
        break;
      case 'open-envelope':
        openEnvelopeModal(actionEl.dataset.otId);
        break;
      case 'close-envelope':
        closeEnvelopeModal();
        break;
      case 'switch-ot-tab':
        switchOtTab(actionEl.dataset.tab);
        break;
      case 'toggle-sidebar':
        toggleSidebar();
        break;
      case 'set-main-desk-view':
        setMainDeskView(actionEl.dataset.mode);
        break;
      case 'set-stripboard-view':
        setStripboardViewMode(actionEl.dataset.mode);
        break;
      case 'stripboard-today':
        setStripboardToToday();
        break;
      case 'stripboard-prev-day':
        changeStripboardDay(-1);
        break;
      case 'stripboard-next-day':
        changeStripboardDay(1);
        break;
      case 'stripboard-pool-filter':
        setStripboardPoolFilter(actionEl.dataset.filter);
        break;
      case 'add-break-strip':
        addBreakStripPrompt();
        break;
      case 'auto-populate-stripboard':
        autoPopulatePendingOts();
        break;
      case 'clear-stripboard':
        clearTodayStripboard();
        break;
      case 'print-stripboard':
        printStripboard();
        break;
      case 'open-status-manager':
        openStatusManagerModal();
        break;
      case 'close-status-manager':
        closeStatusManagerModal();
        break;
      case 'open-client-modal':
        openClientModal(actionEl.dataset.clientId || null);
        break;
      case 'close-client-modal':
        closeClientModal();
        break;
      case 'open-brand-modal':
        openBrandModal(actionEl.dataset.clientName, actionEl.dataset.brandName || null);
        break;
      case 'close-brand-modal':
        closeBrandModal();
        break;
      case 'open-custom-task':
        openCustomTaskModal(actionEl.dataset.index, actionEl.dataset.date);
        break;
      case 'close-custom-task':
        closeCustomTaskModal();
        break;
      case 'export-backup':
        exportBackupData();
        break;
      case 'trigger-backup-import':
        document.getElementById('backup-file-input')?.click();
        break;
      case 'add-route-row':
        addNewRouteRow();
        break;
      case 'delete-active-ot':
        deleteActiveOt();
        break;
      case 'schedule-active-ot':
        scheduleActiveOtFromModal();
        break;
      case 'prompt-add-media-link':
        promptAddMediaLink();
        break;
      case 'close-media-preview':
        closeMediaPreviewModal();
        break;
      case 'step-media-preview-prev':
        stepSelectedMediaItem(-1);
        break;
      case 'step-media-preview-next':
        stepSelectedMediaItem(1);
        break;
      case 'close-stamp-modal':
        closeStampModal();
        break;
      case 'clear-stamp':
        clearCurrentStamp();
        break;
      default:
        break;
    }
  });

  // 2. Delegación de Inputs y Changes (Búsqueda, Filtros, Selects)
  document.addEventListener('input', (e) => {
    const target = e.target;
    if (target.id === 'search-input') {
      renderTrafficDesk();
    } else if (target.id === 'stripboard-pool-search') {
      renderStripboardPendingPool();
    } else if (target.id === 'new-client-input') {
      syncNewOtBrandSuggestions();
    }
  });

  document.addEventListener('change', (e) => {
    const target = e.target;
    if (target.id === 'status-filter') {
      renderTrafficDesk();
    } else if (target.id === 'stripboard-date-input') {
      handleStripboardDateChange(target.value);
    } else if (target.id === 'backup-file-input') {
      importBackupData(e);
    } else if (target.id === 'trafico-sort-select' || target.id === 'stripboard-sort-select') {
      setTableSort(target.value);
    } else if (target.id === 'trafico-group-select' || target.id === 'stripboard-group-select') {
      setTableGroup(target.value);
    }
  });

  // 3. Atajos de Teclado Globales (Escape y Flechas de Visor)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const customTaskModal = document.getElementById('custom-task-modal');
      if (customTaskModal && !customTaskModal.classList.contains('hidden')) {
        closeCustomTaskModal();
        return;
      }
      const previewModal = document.getElementById('media-preview-modal');
      if (previewModal && !previewModal.classList.contains('hidden')) {
        closeMediaPreviewModal();
        return;
      }
      const stampModal = document.getElementById('stamp-modal');
      if (stampModal && !stampModal.classList.contains('hidden')) {
        closeStampModal();
        return;
      }
      const envModal = document.getElementById('envelope-modal');
      if (envModal && !envModal.classList.contains('hidden')) {
        closeEnvelopeModal();
        return;
      }
      const newOtModal = document.getElementById('new-ot-modal');
      if (newOtModal && !newOtModal.classList.contains('hidden')) {
        closeNewOtModal();
        return;
      }
      const statusModal = document.getElementById('status-manager-modal');
      if (statusModal && !statusModal.classList.contains('hidden')) {
        closeStatusManagerModal();
        return;
      }
      const clientModal = document.getElementById('client-modal');
      if (clientModal && !clientModal.classList.contains('hidden')) {
        closeClientModal();
        return;
      }
      const brandModal = document.getElementById('brand-modal');
      if (brandModal && !brandModal.classList.contains('hidden')) {
        closeBrandModal();
        return;
      }
    } else if (e.key === 'ArrowLeft') {
      const previewModal = document.getElementById('media-preview-modal');
      if (previewModal && !previewModal.classList.contains('hidden')) {
        stepSelectedMediaItem(-1);
      }
    } else if (e.key === 'ArrowRight') {
      const previewModal = document.getElementById('media-preview-modal');
      if (previewModal && !previewModal.classList.contains('hidden')) {
        stepSelectedMediaItem(1);
      }
    }
  });
}

// ============================================================================
// ARRANQUE E HIDRATACIÓN INICIAL (BOOTSTRAP)
// ============================================================================

async function initializeApp() {
  console.log('TRAFIKEITOR v1.1 // Iniciando arquitectura modular...');

  setupEventDelegation();

  // 1. Hidratar caché desde backend Hono/SQLite con fallback síncrono a localStorage
  try {
    await bootstrap();
  } catch (err) {
    console.warn('Iniciando en modo offline / almacenamiento local:', err);
  }

  // 2. Renderizar componentes iniciales
  renderStatusSelects();
  renderResponsibleSelects();
  syncSortAndGroupControls();
  renderBinTree();
  renderTrafficDesk();
  updateClientsDatalist();
  updateDeptOptionsDatalist();
  initStripboard();

  console.log('TRAFIKEITOR v1.1 // Listo.');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }
}

// Exposición en window para compatibilidad
if (typeof window !== 'undefined') {
  window.switchMainView = switchMainView;
}

