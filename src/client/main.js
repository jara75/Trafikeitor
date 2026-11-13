/**
 * TRAFIKEITOR // PUNTO DE ENTRADA Y ORQUESTADOR PRINCIPAL
 * Módulo 0: Inicialización del sistema, arranque reactivo, delegación de eventos raíz (data-action),
 * atajos de teclado y sincronización de vistas.
 */

import {
  state,
  emit,
  on,
  clearScopedLocalCache
} from './core-state.js';

import {
  bootstrap,
  scheduleSync,
  getCurrentUser,
  getCurrentOrganization,
  escapeHtml,
  translateAuthError,
  getUserProfile,
  deriveShortName,
  renderUserAvatarHtml
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
  initSidebarResizer,
  setMainDeskView,
  refreshAllViews,
  getResponsibleColorClasses
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
  importBackupData,
  openUserProfileModal,
  closeUserProfileModal
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
      const onboardingModal = document.getElementById('onboarding-studio-modal');
      if (onboardingModal && !onboardingModal.classList.contains('hidden')) {
        return;
      }
      const paywallModal = document.getElementById('subscription-paywall-modal');
      if (paywallModal && !paywallModal.classList.contains('hidden')) {
        if (paywallModal.dataset.blocking === 'true') {
          return;
        }
        if (typeof closeSubscriptionPaywallModal === 'function') {
          closeSubscriptionPaywallModal();
        }
        return;
      }
      const reassignModal = document.getElementById('member-reassign-modal');
      if (reassignModal && !reassignModal.classList.contains('hidden')) {
        if (typeof window.closeMemberReassignModal === 'function') {
          window.closeMemberReassignModal();
        }
        return;
      }
      const userProfileModal = document.getElementById('user-profile-modal');
      if (userProfileModal && !userProfileModal.classList.contains('hidden')) {
        closeUserProfileModal();
        return;
      }
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
// GESTIÓN DE SESIÓN, USUARIOS Y TESTIGO DE SINCRONIZACIÓN SQLITE
// ============================================================================

export function updateSyncBadge(stateText, isSaving) {
  if (typeof document === 'undefined') return;
  const badge = document.getElementById('sqlite-sync-badge');
  if (!badge) return;

  if (isSaving) {
    badge.className = 'hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-[10px] font-semibold text-amber-300';
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span><span id="sqlite-sync-text">${escapeHtml(stateText || 'Guardando en SQLite...')}</span>`;
  } else {
    badge.className = 'hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-semibold text-emerald-300';
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span id="sqlite-sync-text">${escapeHtml(stateText || 'SQLite Activo')}</span>`;
  }
}

export function updateTrialBadge(org) {
  if (typeof document === 'undefined') return;
  const badge = document.getElementById('header-trial-badge');
  const textEl = document.getElementById('header-trial-text');
  if (!badge) return;

  if (!org) {
    badge.classList.add('hidden');
    badge.classList.remove('flex');
    return;
  }

  const subStatus = org.subscriptionStatus || 'trialing';
  const trialDaysLeft = typeof org.trialDaysLeft === 'number' ? org.trialDaysLeft : 14;

  badge.classList.remove('hidden');
  badge.classList.add('flex');

  badge.className = 'flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[10px] font-semibold border transition-all cursor-pointer select-none';

  if (subStatus === 'active') {
    badge.classList.add('bg-cyan-500/10', 'border-cyan-500/25', 'text-cyan-300', 'hover:bg-cyan-500/20');
    if (textEl) textEl.innerText = 'Plan Pro Activo';
    badge.title = 'Suscripción Pro activa y vigente';
  } else if (trialDaysLeft <= 0) {
    badge.classList.add('bg-rose-500/15', 'border-rose-500/35', 'text-rose-300', 'hover:bg-rose-500/25');
    if (textEl) textEl.innerText = 'Prueba Finalizada';
    badge.title = 'Período de prueba finalizado. Clic para activar con Bold.';
  } else if (trialDaysLeft <= 3) {
    badge.classList.add('bg-amber-500/15', 'border-amber-500/35', 'text-amber-300', 'hover:bg-amber-500/25', 'animate-pulse');
    if (textEl) textEl.innerText = `Prueba Pro: ${trialDaysLeft} ${trialDaysLeft === 1 ? 'día' : 'días'}`;
    badge.title = `Prueba por vencer (${trialDaysLeft} días restantes). Clic para activar con Bold.`;
  } else {
    badge.classList.add('bg-emerald-500/10', 'border-emerald-500/25', 'text-emerald-300', 'hover:bg-emerald-500/20');
    if (textEl) textEl.innerText = `Prueba Pro: ${trialDaysLeft} días`;
    badge.title = `Prueba Pro activa (${trialDaysLeft} días restantes). Clic para ver detalles.`;
  }
}

export function updateUserPill(user) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('header-user-container');
  if (!container) return;

  const profile = getUserProfile();
  const rawShort = (profile.shortName || '').trim();
  const cleanName = (user && user.name ? user.name : profile.fullName || '').trim();
  const isResidual = rawShort === 'Andrés J.' && cleanName && !cleanName.toLowerCase().includes('andrés');
  const displayName = (!rawShort || isResidual)
    ? (deriveShortName(cleanName) || cleanName || 'Usuario')
    : rawShort;
  const colorClasses = getResponsibleColorClasses(displayName);

  if (user) {
    container.innerHTML = `
      <button 
        id="elmarcante-user-btn" 
        type="button" 
        class="h-7 pl-1.5 pr-2.5 text-[11px] font-medium bg-white/[0.05] hover:bg-white/[0.10] text-zinc-300 rounded-md border border-white/[0.08] hover:border-white/[0.20] transition-all cursor-pointer flex items-center gap-1.5 group select-none shadow-sm"
        title="Perfil de ${escapeHtml(profile.fullName || displayName)} (${escapeHtml(user.email || profile.email)})"
      >
        ${renderUserAvatarHtml('w-5 h-5 text-[9px]')}
        <span class="${colorClasses.text} font-semibold">${escapeHtml(displayName)}</span>
        <svg class="w-3 h-3 text-zinc-400 group-hover:text-zinc-200 transition-colors -mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </button>
    `;
    const btn = document.getElementById('elmarcante-user-btn');
    if (btn) {
      btn.onclick = () => {
        if (typeof openUserProfileModal === 'function') {
          openUserProfileModal();
        }
      };
    }
  } else {
    container.innerHTML = `
      <button 
        id="elmarcante-login-btn" 
        type="button" 
        onclick="showAuthGate(true)" 
        class="h-7 px-2.5 text-[11px] font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-md border border-amber-500/30 transition-all cursor-pointer flex items-center gap-1.5"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/></svg>
        <span>Iniciar Sesión</span>
      </button>
    `;
  }
}

export function showAuthGate(hasAnyUsers = true, inviteIdParam = null, inviteInfo = null) {
  if (typeof document === 'undefined') return;

  const urlParams = new URLSearchParams(window.location.search);
  const inviteId = inviteIdParam || urlParams.get('invite');
  const activeUser = getCurrentUser();
  const invitedEmail = inviteInfo?.email || '';

  let gate = document.getElementById('elmarcante-auth-gate');
  if (gate) gate.remove();

  gate = document.createElement('div');
  gate.id = 'elmarcante-auth-gate';
  gate.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-xl p-4 select-none';

  let isRegisterMode = inviteId ? true : !hasAnyUsers;

  const renderGateForm = () => {
    gate.innerHTML = `
      <div class="w-full max-w-md bg-[#16171b]/95 border border-white/[0.12] rounded-2xl shadow-2xl shadow-black/90 p-7 text-xs text-zinc-200">
        <div class="flex items-center justify-between border-b border-white/[0.08] pb-4 mb-5">
          <div class="flex items-center gap-2.5">
            <img src="/assets/favicon-32x32.png" alt="Trafikeitor" class="w-6 h-6 rounded-md object-cover shadow-[0_1px_4px_rgba(0,0,0,0.6),0_0_8px_rgba(245,158,11,0.25)]">
            <div>
              <h1 class="font-bold text-sm tracking-tight text-white uppercase">TRAFIKEITOR</h1>
              <p class="text-[10px] text-zinc-400 font-medium">CONTROL DE TRÁFICO • EL MARCANTE</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-[10px] text-amber-300 font-semibold">
              ${inviteId ? 'INVITACIÓN' : (isRegisterMode ? 'ACTIVAR CUENTA' : 'BETTER AUTH')}
            </span>
            <button type="button" id="auth-close-btn" class="p-1 hover:bg-white/[0.10] text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer" title="Cerrar (Esc)">✕</button>
          </div>
        </div>

        ${inviteId ? `
          <div class="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
            <span class="text-base leading-none pt-0.5">🤝</span>
            <div>
              <div class="font-bold text-amber-300 text-[11px]">Invitación a ${escapeHtml(inviteInfo?.organizationName || 'Micro-Estudio')}</div>
              <div class="text-[10px] text-zinc-300 leading-relaxed mt-0.5">
                ${invitedEmail ? `Invitación dirigida a <strong class="text-white">${escapeHtml(invitedEmail)}</strong>. ` : ''}Regístrate o inicia sesión con ese correo para unirte automáticamente al equipo.
              </div>
            </div>
          </div>
        ` : ''}

        <p class="text-[11px] text-zinc-400 mb-4 leading-relaxed font-normal">
          ${isRegisterMode
            ? 'Bienvenido. Crea tu cuenta para proteger tus Órdenes de Trabajo, el Media Pool y sincronizar tu espacio en tiempo real.'
            : 'Ingresa tus credenciales para abrir la Mesa de Tráfico y sincronizar con la base de datos.'}
        </p>

        <form id="elmarcante-auth-form" class="space-y-3.5">
          ${isRegisterMode ? `
            <div>
              <label class="block text-[10px] uppercase text-zinc-400 font-semibold mb-1">Nombre Completo *</label>
              <input type="text" id="auth-name" required placeholder="Ej: Carolina Cárdenas" value="" class="w-full bg-black/40 border border-white/[0.10] rounded-lg px-3 py-2 text-white font-medium focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 focus:outline-none transition-all">
            </div>
          ` : ''}

          <div>
            <label class="block text-[10px] uppercase text-zinc-400 font-semibold mb-1">Correo Electrónico *</label>
            <input type="email" id="auth-email" required placeholder="correo@estudio.com" value="${escapeHtml(invitedEmail)}" class="w-full bg-black/40 border border-white/[0.10] rounded-lg px-3 py-2 text-white font-medium focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 focus:outline-none transition-all">
          </div>

          <div>
            <label class="block text-[10px] uppercase text-zinc-400 font-semibold mb-1">Contraseña (mín. 8 caracteres) *</label>
            <div class="relative flex items-center">
              <input 
                type="password" 
                id="auth-password" 
                required 
                minlength="8" 
                placeholder="••••••••" 
                class="w-full bg-black/40 border border-white/[0.10] rounded-lg pl-3 pr-10 py-2 text-white font-medium focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 focus:outline-none transition-all"
              >
              <button 
                type="button" 
                id="auth-toggle-pwd-btn" 
                class="absolute right-2 text-zinc-400 hover:text-amber-400 p-1 rounded transition-colors cursor-pointer select-none flex items-center justify-center" 
                title="Mostrar u ocultar contraseña"
                tabindex="-1"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
              </button>
            </div>
          </div>

          <div id="auth-error-msg" class="hidden p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-medium"></div>

          <button type="submit" id="auth-submit-btn" class="w-full py-2.5 bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-stone-950 font-semibold uppercase tracking-wider rounded-lg shadow-sm border border-amber-300/40 transition-all active:scale-[0.98] cursor-pointer text-xs">
            ${isRegisterMode ? (inviteId ? 'Unirse al Equipo' : 'Crear Cuenta y Entrar') : 'Entrar al Estudio'}
          </button>
        </form>

        <div class="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-zinc-400">
          <span>${isRegisterMode ? '¿Ya tienes cuenta creada?' : '¿Necesitas registrar un usuario?'}</span>
          <button type="button" id="auth-toggle-mode" class="text-amber-400 hover:underline font-semibold cursor-pointer">
            ${isRegisterMode ? 'Iniciar Sesión' : 'Crear Cuenta'}
          </button>
        </div>
      </div>
    `;

    gate.querySelector('#auth-toggle-mode').onclick = () => {
      isRegisterMode = !isRegisterMode;
      renderGateForm();
    };

    const pwdInput = gate.querySelector('#auth-password');
    const togglePwdBtn = gate.querySelector('#auth-toggle-pwd-btn');
    if (togglePwdBtn && pwdInput) {
      togglePwdBtn.onclick = () => {
        const isPassword = pwdInput.type === 'password';
        pwdInput.type = isPassword ? 'text' : 'password';
        togglePwdBtn.innerHTML = isPassword ? `
          <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/>
          </svg>
        ` : `
          <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
          </svg>
        `;
      };
    }

    const closeBtn = gate.querySelector('#auth-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => gate.remove();
    }

    gate.querySelector('#elmarcante-auth-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const errEl = gate.querySelector('#auth-error-msg');
      const btnEl = gate.querySelector('#auth-submit-btn');
      errEl.classList.add('hidden');
      btnEl.disabled = true;
      btnEl.innerText = 'Verificando...';

      const email = gate.querySelector('#auth-email').value.trim();
      const password = gate.querySelector('#auth-password').value;
      const nameInput = gate.querySelector('#auth-name');
      const name = nameInput ? nameInput.value.trim() : (email.split('@')[0] || 'Colaborador');

      try {
        if (inviteId && getCurrentUser()) {
          await fetch('/api/auth/sign-out', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({}),
          }).catch(() => {});
        }

        const endpoint = isRegisterMode ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email';
        const payload = isRegisterMode ? { name, email, password } : { email, password };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
          throw new Error(translateAuthError(data.message || data.error?.message, 'Credenciales inválidas o error de acceso.'));
        }

        // Si venía de una invitación, aceptarla y fijar la organización como activa
        if (inviteId) {
          try {
            const acceptRes = await fetch('/api/auth/organization/accept-invitation', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ invitationId: inviteId })
            });
            const acceptData = await acceptRes.json().catch(() => ({}));
            const orgId = acceptData?.invitation?.organizationId || acceptData?.member?.organizationId;
            if (orgId) {
              await fetch('/api/auth/organization/set-active', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ organizationId: orgId })
              });
            }
          } catch (e) {
            console.warn('[Invite] Error al aceptar invitación:', e);
          }
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        gate.remove();
        await bootstrap();
        updateUserPill(getCurrentUser());
        updateTrialBadge(getCurrentOrganization());
        refreshAllViews();
        if (typeof window.loadTeamTabUI === 'function') {
          window.loadTeamTabUI();
        }
      } catch (err) {
        errEl.innerText = err.message || 'Error al autenticar';
        errEl.classList.remove('hidden');
        btnEl.disabled = false;
        btnEl.innerText = isRegisterMode ? (inviteId ? 'Unirse al Equipo' : 'Crear Cuenta y Entrar') : 'Entrar al Estudio';
      }
    };
  };

  renderGateForm();
  document.body.appendChild(gate);
}

// Suscripción a eventos de sincronización y autenticación
on('sync:status', (e) => {
  if (!e || !e.detail) return;
  updateSyncBadge(e.detail.text, e.detail.isSaving);
  if (e.detail.user) updateUserPill(e.detail.user);
});

on('data:ready', (e) => {
  if (!e || !e.detail) return;
  if (e.detail.user) updateUserPill(e.detail.user);
  if (e.detail.organization) {
    updateTrialBadge(e.detail.organization);
    // Si la prueba expiró y no hay suscripción activa, abrir paywall bloqueante
    if (e.detail.organization.trialDaysLeft <= 0 && e.detail.organization.subscriptionStatus !== 'active') {
      if (typeof window.openSubscriptionPaywallModal === 'function') {
        window.openSubscriptionPaywallModal(true);
      }
    }
  }
  if (e.detail.authRequired) {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteId = urlParams.get('invite');
    showAuthGate(true, inviteId);
  }
});

on('auth:required', (e) => {
  const urlParams = new URLSearchParams(window.location.search);
  const inviteId = urlParams.get('invite');
  showAuthGate(e && e.detail ? e.detail.hasUsers : true, inviteId);
});

on('auth:no-organization', (e) => {
  if (typeof window.openOnboardingStudioModal === 'function') {
    window.openOnboardingStudioModal();
  }
});

on('auth:account-deactivated', (e) => {
  if (typeof document === 'undefined') return;
  let overlay = document.getElementById('account-deactivated-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'account-deactivated-overlay';
    overlay.className = 'fixed inset-0 bg-black/90 backdrop-blur-xl z-[10000] flex items-center justify-center p-4';
    const msg = escapeHtml((e && e.detail && e.detail.message) || 'Tu cuenta ha sido desactivada en este estudio. Contacta al Director del espacio.');
    overlay.innerHTML = `
      <div class="w-full max-w-md bg-resolve-surface border border-rose-500/40 rounded-2xl shadow-2xl p-6 text-center space-y-4">
        <div class="w-12 h-12 mx-auto rounded-full bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400 text-xl font-bold">!</div>
        <h2 class="text-base font-bold text-white">Acceso Suspendido</h2>
        <p class="text-xs text-zinc-400 leading-relaxed">${msg}</p>
        <button type="button" onclick="if(typeof handleUserSignOut==='function'){handleUserSignOut();}" class="w-full py-2.5 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-semibold text-xs transition-all cursor-pointer">
          Cerrar Sesión
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
  }
});

on('billing:trial-expired', () => {
  if (typeof window.openSubscriptionPaywallModal === 'function') {
    window.openSubscriptionPaywallModal(true);
  }
});

on('license:suspended', async (e) => {
  if (typeof document === 'undefined') return;
  const gate = document.getElementById('license-suspended-gate');
  if (!gate) return;
  gate.classList.remove('hidden');
  gate.classList.add('flex');

  const msgEl = document.getElementById('license-suspended-message');
  if (msgEl && e?.detail?.message) {
    msgEl.textContent = e.detail.message;
  }

  const switcherBox = document.getElementById('license-suspended-org-switcher');
  if (switcherBox) {
    try {
      const res = await fetch('/api/auth/organization/list', { credentials: 'include' });
      const orgs = res.ok ? await res.json() : [];
      if (Array.isArray(orgs) && orgs.length > 1) {
        const currentId = state.organizationId;
        const buttons = orgs
          .filter((o) => o && o.id && o.id !== currentId)
          .map(
            (o) =>
              `<button type="button" onclick="window.switchActiveOrganization('${escapeHtml(o.id)}')" class="w-full py-2 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 border border-white/10 text-xs font-medium transition-all cursor-pointer truncate">Cambiar a ${escapeHtml(o.name || o.slug || o.id)}</button>`
          )
          .join('');
        if (buttons) {
          switcherBox.innerHTML = `<div class="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Cambiar de estudio</div>${buttons}`;
          switcherBox.classList.remove('hidden');
        }
      }
    } catch {
      // Ignorar fallo de red al listar estudios
    }
  }
});

on('user:profile-updated', () => {
  updateUserPill(getCurrentUser());
});

async function switchActiveOrganization(orgId) {
  if (!orgId || orgId === state.organizationId) return;
  try {
    const res = await fetch('/api/auth/organization/set-active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ organizationId: orgId })
    });
    if (res.ok) {
      clearScopedLocalCache();
      window.location.reload();
    }
  } catch (err) {
    console.error('Error al cambiar de organización:', err);
  }
}
if (typeof window !== 'undefined') {
  window.switchActiveOrganization = switchActiveOrganization;
}

async function syncRoleHeaderVisibilityAndOrgSwitcher() {
  if (typeof document === 'undefined') return;
  const restoreLabel = document.getElementById('header-restore-label');
  if (restoreLabel) {
    restoreLabel.classList.toggle('hidden', state.memberRole !== 'owner');
  }

  const userContainer = document.getElementById('header-user-container');
  const existingSwitcher = document.getElementById('header-org-switcher');
  if (!userContainer || !getCurrentUser()) {
    if (existingSwitcher) existingSwitcher.remove();
    return;
  }

  try {
    const res = await fetch('/api/auth/organization/list', { credentials: 'include' });
    const orgs = res.ok ? await res.json() : [];
    if (!Array.isArray(orgs) || orgs.length <= 1) {
      if (existingSwitcher) existingSwitcher.remove();
      return;
    }

    let select = existingSwitcher;
    if (!select) {
      select = document.createElement('select');
      select.id = 'header-org-switcher';
      select.title = 'Cambiar estudio activo';
      select.className = 'h-7 max-w-[145px] px-2 text-[11px] font-medium bg-white/[0.05] hover:bg-white/[0.10] text-zinc-200 rounded-md border border-white/[0.08] focus:outline-none focus:border-amber-500/50 cursor-pointer truncate';
      select.onchange = (ev) => switchActiveOrganization(ev.target.value);
      userContainer.insertBefore(select, userContainer.firstChild);
    }

    select.innerHTML = orgs
      .map(
        (o) =>
          `<option value="${escapeHtml(o.id)}" ${o.id === state.organizationId ? 'selected' : ''} class="bg-zinc-900 text-zinc-100">${escapeHtml(o.name || o.slug || o.id)}</option>`
      )
      .join('');
  } catch {
    // Ignorar error de red al consultar lista de estudios
  }
}

on('data:ready', () => {
  syncRoleHeaderVisibilityAndOrgSwitcher();
});

// ============================================================================
// ARRANQUE E HIDRATACIÓN INICIAL (BOOTSTRAP)
// ============================================================================

async function initializeApp() {
  console.log('TRAFIKEITOR v1.1 // Iniciando arquitectura modular...');

  setupEventDelegation();

  // 1. Hidratar caché desde backend Hono/SQLite con fallback síncrono a localStorage
  try {
    await bootstrap();

    // Si viene con un enlace de invitación ?invite=..., validar si coincide con la sesión actual
    const urlParams = new URLSearchParams(window.location.search);
    const inviteId = urlParams.get('invite');
    if (inviteId) {
      let inviteInfo = null;
      try {
        const invRes = await fetch(`/api/public/invite/${encodeURIComponent(inviteId)}`);
        if (invRes.ok) {
          const invJson = await invRes.json();
          if (invJson?.ok) inviteInfo = invJson.invite;
        }
      } catch (_) {}

      const current = getCurrentUser();
      const sameUser = Boolean(
        current?.email && inviteInfo?.email && current.email.toLowerCase() === inviteInfo.email.toLowerCase()
      );

      if (current && sameUser) {
        try {
          const acceptRes = await fetch('/api/auth/organization/accept-invitation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ invitationId: inviteId })
          });
          const acceptData = await acceptRes.json().catch(() => ({}));
          const orgId = acceptData?.invitation?.organizationId || acceptData?.member?.organizationId;
          if (orgId) {
            await fetch('/api/auth/organization/set-active', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ organizationId: orgId })
            });
          }
          window.history.replaceState({}, document.title, window.location.pathname);
          await bootstrap();
        } catch (e) {
          console.warn('[Invite] Error procesando invitación de usuario autenticado:', e);
        }
      } else {
        showAuthGate(true, inviteId, inviteInfo);
      }
    }
  } catch (err) {
    console.warn('Iniciando en modo offline / almacenamiento local:', err);
  }

  updateUserPill(getCurrentUser());
  updateTrialBadge(getCurrentOrganization());
  syncRoleHeaderVisibilityAndOrgSwitcher();

  // 2. Renderizar componentes iniciales
  renderStatusSelects();
  renderResponsibleSelects();
  syncSortAndGroupControls();
  renderBinTree();
  initSidebarResizer();
  setMainDeskView(state.currentDeskMode);
  updateClientsDatalist();
  updateDeptOptionsDatalist();
  initStripboard();

  const otParam = new URLSearchParams(window.location.search).get('ot');
  if (otParam && typeof window.openEnvelopeModal === 'function') {
    window.openEnvelopeModal(otParam);
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('ot');
    window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
  }

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
  window.showAuthGate = showAuthGate;
  window.updateUserPill = updateUserPill;
  window.updateTrialBadge = updateTrialBadge;
  window.updateSyncBadge = updateSyncBadge;
  window.initSidebarResizer = initSidebarResizer;
}

