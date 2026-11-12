/**
 * TRAFIKEITOR // MOTOR DEL STRIPBOARD (PLAN DE RODAJE/TRABAJO DIARIO, SEMANAL, GANTT Y MENSUAL)
 * Módulo 4: Motor Stripboard completo en sus 4 vistas operativas (Día, Semana Lun-Sáb, Timeline Gantt 08-19h
 * y Calendario Mensual), piscina de OTs pendientes, trim interactivo estilo DaVinci Resolve y Drag & Drop.
 */

import {
  state,
  resetDragState,
  clearStripDropIndicators,
  pauseRowDrag,
  resumeRowDrag,
  emit,
  on
} from './core-state.js';

import {
  getOrders,
  saveOrders,
  getOrderById,
  getAllStripboardStorage,
  getDayStrips,
  saveDayStrips,
  getStatuses,
  getStatusBadgeClass,
  getResponsibles,
  addResponsible,
  getDepartments,
  formatDateKeyLocal,
  escapeHtml
} from './data-bridge.js';

import {
  renderUnifiedTableRows,
  syncSortAndGroupControls
} from './traffic-desk-view.js';

// Inicializar fecha por defecto en el estado si no existe
if (!state.currentStripboardDate) {
  state.currentStripboardDate = formatDateKeyLocal(new Date());
}

let currentPoolFilter = 'all'; // 'all' | 'unscheduled' | 'scheduled'
let activeCustomTaskIndex = -1;
let activeCustomTaskDate = '';

// Constantes de escala temporal para Timeline Gantt
const GANTT_START_MIN = 8 * 60;  // 08:00 = 480m
const GANTT_END_MIN = 19 * 60;   // 19:00 = 1140m
const GANTT_TOTAL_MIN = GANTT_END_MIN - GANTT_START_MIN; // 660m (11 horas)

// ============================================================================
// CICLO DE VIDA Y CONMUTACIÓN DE VISTAS DEL STRIPBOARD
// ============================================================================

export function setStripboardViewMode(mode) {
  state.currentStripboardSubView = mode;

  if (typeof document !== 'undefined') {
    const modes = ['day', 'week', 'gantt', 'month'];
    modes.forEach(m => {
      const viewEl = document.getElementById(`stripboard-${m}-view`);
      const btnEl = document.getElementById(`sb-view-btn-${m}`);
      if (viewEl) {
        if (m === mode) viewEl.classList.remove('hidden');
        else viewEl.classList.add('hidden');
      }
      if (btnEl) {
        if (m === mode) {
          btnEl.className = "h-5 px-2 rounded font-medium transition-all bg-white/[0.12] text-amber-300 shadow-xs border border-white/[0.08] cursor-pointer";
        } else {
          btnEl.className = "h-5 px-2 rounded font-medium transition-all text-resolve-dimText hover:text-white cursor-pointer";
        }
      }
    });

    const hintEl = document.getElementById('stripboard-footer-hint');
    const periodLabelEl = document.getElementById('stripboard-period-label');
    if (hintEl) {
      if (mode === 'day') hintEl.innerText = 'Vista Día (Tiras) • Arrastra y suelta las tiras en la posición exacta del día';
      else if (mode === 'week') hintEl.innerText = 'Semana Laboral (Lunes a Sábado) • Arrastra tiras de un día a otro o desde la piscina de OTs pendientes';
      else if (mode === 'gantt') hintEl.innerText = 'Timeline Gantt (08:00 a 19:00) • Arrastra los bordes del clip para expandir/contraer tiempo (DaVinci Trim) o arrastra entre pistas';
      else if (mode === 'month') hintEl.innerText = 'Calendario Mensual (Lunes a Sábado) • Hitos de entrega comprometida y carga de tiras por día';
    }
    if (periodLabelEl) {
      if (mode === 'week') periodLabelEl.innerText = 'Semana:';
      else if (mode === 'month') periodLabelEl.innerText = 'Mes Base:';
      else periodLabelEl.innerText = 'Plan Día:';
    }
  }

  renderStripboard();
}

export function selectStripboardDate(dateStr, switchToDayView = false) {
  if (!dateStr) return;
  state.currentStripboardDate = dateStr;
  if (typeof document !== 'undefined') {
    const dateInput = document.getElementById('stripboard-date-input');
    if (dateInput) dateInput.value = state.currentStripboardDate;
  }
  if (switchToDayView) {
    setStripboardViewMode('day');
  } else {
    renderStripboard();
  }
}

export function initStripboard() {
  if (typeof document !== 'undefined') {
    const dateInput = document.getElementById('stripboard-date-input');
    if (dateInput && !dateInput.value) {
      dateInput.value = state.currentStripboardDate;
    } else if (dateInput && dateInput.value) {
      state.currentStripboardDate = dateInput.value;
    }
  }
  updateDeptOptionsDatalist();
  renderStripboard();
}

export function handleStripboardDateChange(newDate) {
  if (!newDate) return;
  state.currentStripboardDate = newDate;
  renderStripboard();
}

export function setStripboardToToday() {
  state.currentStripboardDate = formatDateKeyLocal(new Date());
  if (typeof document !== 'undefined') {
    const dateInput = document.getElementById('stripboard-date-input');
    if (dateInput) dateInput.value = state.currentStripboardDate;
  }
  renderStripboard();
}

export function changeStripboardDay(offset) {
  const d = new Date(state.currentStripboardDate + 'T00:00:00');
  if (state.currentStripboardSubView === 'week') {
    d.setDate(d.getDate() + (offset * 7));
  } else if (state.currentStripboardSubView === 'month') {
    d.setMonth(d.getMonth() + offset);
  } else {
    d.setDate(d.getDate() + offset);
    // Si cae en domingo (0), saltar al sábado o lunes según dirección (jornada Lunes a Sábado)
    if (d.getDay() === 0) {
      d.setDate(d.getDate() + (offset >= 0 ? 1 : -1));
    }
  }
  state.currentStripboardDate = formatDateKeyLocal(d);
  if (typeof document !== 'undefined') {
    const dateInput = document.getElementById('stripboard-date-input');
    if (dateInput) dateInput.value = state.currentStripboardDate;
  }
  renderStripboard();
}

export function updateDeptOptionsDatalist() {
  if (typeof document === 'undefined') return;
  const dl = document.getElementById('dept-options');
  if (!dl) return;
  const list = [...new Set([...getDepartments(), ...getResponsibles()])];
  dl.innerHTML = list.map(r => `<option value="${escapeHtml(r)}"></option>`).join('');
}

// ============================================================================
// PISCINA DE OTS PENDIENTES Y TESTIGOS DE ASIGNACIÓN
// ============================================================================

export function setStripboardPoolFilter(filterMode) {
  currentPoolFilter = filterMode;
  if (typeof document !== 'undefined') {
    const modes = ['all', 'unscheduled', 'scheduled'];
    modes.forEach(m => {
      const btn = document.getElementById(`pool-filter-btn-${m}`);
      if (!btn) return;
      if (m === filterMode) {
        btn.className = "py-1 rounded font-bold bg-resolve-panel text-amber-400 transition-colors cursor-pointer";
      } else {
        btn.className = "py-1 rounded text-resolve-dimText hover:text-white transition-colors cursor-pointer";
      }
    });
  }
  renderStripboardPendingPool();
}

export function formatShortDayDateLabel(dateStr) {
  const parts = String(dateStr || '').split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(`${dateStr}T00:00:00`);
  const dayAbbr = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()] || '';
  return `${dayAbbr} ${parts[2]}/${parts[1]}`;
}

export function getOtScheduledDays(otId) {
  if (!otId) return [];
  const all = getAllStripboardStorage();
  const result = [];

  Object.keys(all).sort().forEach(dateStr => {
    const dayStrips = all[dateStr] || [];
    const matched = [];
    dayStrips.forEach((s, idx) => {
      if (s && s.type === 'ot' && s.otId === otId) {
        matched.push({ strip: s, idx });
      }
    });

    if (matched.length > 0) {
      let dominantStatus = 'Por Iniciar';
      if (matched.some(m => m.strip.shiftStatus === 'Detenido')) dominantStatus = 'Detenido';
      else if (matched.some(m => m.strip.shiftStatus === 'En Mesa')) dominantStatus = 'En Mesa';
      else if (matched.every(m => m.strip.shiftStatus === 'Entregado')) dominantStatus = 'Entregado';

      result.push({
        dateStr,
        shortLabel: formatShortDayDateLabel(dateStr),
        count: matched.length,
        matched,
        dominantStatus,
        isCurrentDay: dateStr === state.currentStripboardDate
      });
    }
  });

  return result;
}

export function renderStripboardPendingPool() {
  if (typeof document === 'undefined') return;

  const orders = getOrders();
  const currentStrips = getDayStrips(state.currentStripboardDate);
  const query = (document.getElementById('stripboard-pool-search')?.value || '').toLowerCase().trim();
  const container = document.getElementById('stripboard-pending-list');
  const badge = document.getElementById('stripboard-pending-badge');
  const countEl = document.getElementById('stripboard-pool-count');

  if (!container) return;

  // OTs activas no cerradas ni canceladas
  const activeOrders = orders.filter(o => o.status !== 'Cerrado' && o.status !== 'Cancelado' && o.status !== 'Archivada');
  if (badge) badge.innerText = activeOrders.length;

  // Filtrado por texto y por estado de agendamiento
  let filtered = activeOrders.filter(ot => {
    const scheduledDays = getOtScheduledDays(ot.id);
    if (currentPoolFilter === 'unscheduled' && scheduledDays.length > 0) return false;
    if (currentPoolFilter === 'scheduled' && scheduledDays.length === 0) return false;

    if (!query) return true;
    return (ot.id || '').toLowerCase().includes(query) ||
           (ot.ref || '').toLowerCase().includes(query) ||
           (ot.client || '').toLowerCase().includes(query) ||
           (ot.brand || ot.product || '').toLowerCase().includes(query) ||
           (ot.title || ot.description || '').toLowerCase().includes(query);
  });

  if (countEl) countEl.innerText = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-4 text-center text-stone-500 italic text-[11px]">
        No hay OTs que coincidan con este filtro.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(ot => {
    const inTodayCount = currentStrips.filter(s => s.otId === ot.id).length;
    const scheduledDays = getOtScheduledDays(ot.id);

    const witnessPillsHtml = scheduledDays.length > 0
      ? scheduledDays.map(d => {
          let pillColor = 'bg-white/[0.04] text-zinc-300 border-white/[0.08] hover:border-amber-400/50';
          if (d.dominantStatus === 'En Mesa') pillColor = 'bg-amber-500/10 text-amber-300 border-amber-500/25';
          else if (d.dominantStatus === 'Entregado') pillColor = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25';
          else if (d.dominantStatus === 'Detenido') pillColor = 'bg-rose-500/10 text-rose-300 border-rose-500/25';

          const activeRing = d.isCurrentDay ? 'ring-1 ring-amber-400 font-bold' : '';
          return `
            <button
              type="button"
              onclick="event.stopPropagation(); selectStripboardDate('${d.dateStr}', false)"
              title="Ir al plan del ${d.shortLabel} (${d.dominantStatus})"
              class="px-1.5 py-0.5 rounded-md border text-[9px] transition-all cursor-pointer ${pillColor} ${activeRing}"
            >
              ${d.shortLabel}${d.count > 1 ? ` ×${d.count}` : ''}
            </button>
          `;
        }).join('')
      : `<span class="text-[9px] text-zinc-500 italic">Sin días asignados</span>`;

    const actionBtnHtml = inTodayCount > 0
      ? `
        <button 
          onclick="event.stopPropagation(); addOtToStripboard('${ot.id}')" 
          title="Ya tiene ${inTodayCount} turno(s) en este día. Pulsa para agregar otro turno adicional hoy."
          class="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold rounded-lg text-[10px] transition-all cursor-pointer"
        >
          ✓ En este día (${inTodayCount}) + Turno
        </button>
      `
      : `
        <button 
          onclick="event.stopPropagation(); addOtToStripboard('${ot.id}')" 
          title="Agregar esta OT al plan del día seleccionado"
          class="px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold rounded-lg text-[10px] transition-all cursor-pointer"
        >
          + Al Día
        </button>
      `;

    return `
      <div 
        draggable="true"
        ondragstart="handlePoolOtDragStart(event, '${ot.id}')"
        ondragend="handlePoolOtDragEnd(event)"
        title="Arrastra esta OT hacia el Stripboard o haz clic en su código para abrir el Sobre"
        class="p-2.5 bg-white/[0.02] hover:bg-white/[0.05] border ${ot.urgent ? 'border-rose-500/50 shadow-sm shadow-rose-950/20' : (inTodayCount > 0 ? 'border-emerald-500/30' : 'border-resolve-border')} rounded-xl group hover:border-amber-400/50 transition-all cursor-grab active:cursor-grabbing select-none"
      >
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-1.5 truncate">
            <svg class="w-3.5 h-3.5 text-stone-500 group-hover:text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm6-12a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0z"/>
            </svg>
            <button
              type="button"
              onclick="event.stopPropagation(); emit('modal:open-envelope', { otId: '${ot.id}' });"
              title="Abrir Sobre OT completo"
              class="font-mono font-bold text-amber-400 hover:text-white text-[11px] px-1.5 py-0.2 bg-black/40 hover:bg-black/60 rounded-md border border-resolve-border transition-colors cursor-pointer"
            >
              ${ot.id}
            </button>
            ${ot.urgent ? '<span class="w-2 h-2 rounded-full bg-rose-500 shrink-0" title="Urgente"></span>' : ''}
          </div>
          <span class="text-[9px] font-semibold px-2 py-0.5 rounded-full border ${getStatusBadgeClass(ot.status)}">
            ${escapeHtml(ot.status || 'Tráfico')}
          </span>
        </div>

        <div
          onclick="emit('modal:open-envelope', { otId: '${ot.id}' });"
          class="font-bold text-white hover:text-amber-400 text-[11px] truncate mb-0.5 cursor-pointer transition-colors"
          title="Clic para abrir el Sobre: ${escapeHtml(ot.title || ot.description || '')}"
        >
          ${escapeHtml(ot.title || ot.description || '')}
        </div>
        <div class="text-[10px] text-resolve-dimText truncate mb-1.5">
          ${escapeHtml(ot.client || '')} ${ot.brand || ot.product ? '• ' + escapeHtml(ot.brand || ot.product) : ''}
        </div>

        <!-- Testigo de Días Asignados en el Stripboard -->
        <div class="mb-2 pt-1.5 border-t border-resolve-border/40">
          <div class="flex items-center justify-between text-[9px] text-resolve-dimText uppercase font-bold mb-1">
            <span>Testigo de Días (${scheduledDays.length}):</span>
            <button
              type="button"
              onclick="event.stopPropagation(); emit('modal:open-envelope', { otId: '${ot.id}' });"
              class="text-stone-400 hover:text-amber-400 underline lowercase font-normal cursor-pointer"
            >
              abrir sobre →
            </button>
          </div>
          <div class="flex items-center gap-1 flex-wrap">
            ${witnessPillsHtml}
          </div>
        </div>

        <div class="flex items-center justify-between pt-1.5 border-t border-resolve-border/60 text-[10px]">
          <span class="text-stone-400 text-[9px]">
            ${formatShortDayDateLabel(state.currentStripboardDate)}
          </span>
          ${actionBtnHtml}
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// VISTA 1: STRIPBOARD DÍA (TABLA UNIFICADA Y TIRAS DE CINE)
// ============================================================================

export function renderStripboard() {
  if (typeof document === 'undefined') return;

  const strips = getDayStrips(state.currentStripboardDate);
  const orders = getOrders();
  const container = document.getElementById('stripboard-strips-container');
  const dateInput = document.getElementById('stripboard-date-input');
  if (dateInput) dateInput.value = state.currentStripboardDate;

  // Actualizar fecha en cabecera de impresión
  const printDateEl = document.getElementById('print-date-display');
  if (printDateEl) {
    const [yyyy, mm, dd] = state.currentStripboardDate.split('-');
    printDateEl.innerText = `${dd}/${mm}/${yyyy}`;
  }

  // Métricas
  const otStrips = strips.filter(s => s.type === 'ot');
  const activeCount = otStrips.filter(s => s.shiftStatus === 'En Mesa').length;
  const doneCount = otStrips.filter(s => s.shiftStatus === 'Entregado').length;

  const totalBadge = document.getElementById('strip-count-total');
  if (totalBadge) totalBadge.innerText = otStrips.length;
  const activeBadge = document.getElementById('strip-count-active');
  if (activeBadge) activeBadge.innerText = activeCount;
  const doneBadge = document.getElementById('strip-count-done');
  if (doneBadge) doneBadge.innerText = doneCount;

  renderStripboardPendingPool();

  // Render de Vista Día: Tabla Unificada de 11 Columnas
  const dayTableBody = document.getElementById('stripboard-day-table-body');
  if (dayTableBody) {
    const scheduledIds = strips.filter(s => s.type === 'ot' && s.otId).map(s => s.otId);
    let stripboardOrders = [];
    if (scheduledIds.length > 0) {
      stripboardOrders = scheduledIds.map(id => orders.find(o => o.id === id)).filter(Boolean);
    } else {
      stripboardOrders = orders.filter(o => o.status !== 'Cerrado' && o.status !== 'Cancelado' && o.status !== 'Archivada');
    }
    if (stripboardOrders.length === 0) {
      stripboardOrders = orders;
    }
    dayTableBody.innerHTML = renderUnifiedTableRows(stripboardOrders, 'stripboard');
    syncSortAndGroupControls();
  }

  // Renderizar también las vistas complementarias según el modo activo
  if (state.currentStripboardSubView === 'week') {
    renderStripboardWeekView();
  } else if (state.currentStripboardSubView === 'gantt') {
    renderStripboardGanttView();
  } else if (state.currentStripboardSubView === 'month') {
    renderStripboardMonthView();
  }

  if (container) {
    if (!strips || strips.length === 0) {
      container.innerHTML = `
        <div class="p-12 text-center border border-dashed border-resolve-border rounded-2xl bg-white/[0.02] text-xs text-resolve-dimText flex flex-col items-center justify-center">
          <svg class="w-10 h-10 text-stone-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          <span class="font-bold text-white text-sm">Arrastra OTs aquí o cárgales automáticamente</span>
          <p class="text-[11px] text-resolve-dimText mt-1 max-w-sm">Puedes arrastrar cualquier OT desde la columna izquierda y soltarla en este tablero, o pulsar el botón para cargar todas las pendientes.</p>
          <button onclick="autoPopulatePendingOts()" class="mt-4 px-3.5 py-1.5 bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-stone-950 font-semibold rounded-lg transition-all active:scale-[0.98] text-xs flex items-center gap-1.5 shadow-sm">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            <span>Cargar OTs Pendientes al Plan</span>
          </button>
        </div>
      `;
      return;
    }

    // Render de tiras horizontales arrastrables estilo Stripboard de Cine
    container.innerHTML = strips.map((strip, idx) => {
      if (strip.type === 'break') {
        return `
          <div 
            draggable="true"
            ondragstart="handleStripDragStart(event, ${idx})"
            ondragover="handleStripDragOver(event, ${idx})"
            ondragleave="handleStripDragLeave(event)"
            ondrop="handleStripDrop(event, ${idx})"
            ondragend="handleStripDragEnd(event)"
            class="stripboard-row strip-item-print bg-resolve-panel/90 border border-amber-600/30 rounded-xl px-3 py-2 flex items-center justify-between text-xs border-l-4 border-l-amber-500 shadow-xs cursor-grab active:cursor-grabbing"
          >
            <div class="flex items-center gap-2.5 flex-1">
              <span class="text-resolve-dimText hover:text-amber-400 cursor-grab active:cursor-grabbing no-print" title="Arrastrar para mover de posición">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm6-12a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0z"/>
                </svg>
              </span>
              <span class="text-[10px] text-amber-400 font-bold tracking-widest uppercase shrink-0">BANDA / CORTE:</span>
              <input 
                type="text" 
                onmousedown="pauseRowDrag(this)"
                onmouseup="resumeRowDrag(this)"
                onblur="resumeRowDrag(this)"
                value="${escapeHtml(strip.title || 'SEPARADOR DE TURNO')}" 
                onchange="updateStripField(${idx}, 'title', this.value)" 
                class="bg-transparent border-0 border-b border-transparent hover:border-resolve-border focus:border-amber-500 font-semibold text-white text-xs px-1 flex-1 focus:ring-0 cursor-text"
              />
            </div>
            <div class="flex items-center gap-1 no-print">
              <button onclick="removeStrip(${idx})" title="Eliminar banda separadora" class="p-1 hover:text-red-400 text-resolve-dimText ml-1">✕</button>
            </div>
          </div>
        `;
      }

      const ot = strip.otId ? orders.find(o => o.id === strip.otId) : null;
      let borderLeftColor = 'border-l-sky-500';
      if (strip.shiftStatus === 'En Mesa') borderLeftColor = 'border-l-amber-500 bg-amber-500/[0.04]';
      else if (strip.shiftStatus === 'Entregado') borderLeftColor = 'border-l-emerald-500 opacity-80';
      else if (strip.shiftStatus === 'Detenido') borderLeftColor = 'border-l-rose-500 bg-rose-500/[0.04]';

      const clientDisplay = ot ? (ot.client || '--') : (strip.client || '--');
      const brandDisplay = ot ? (ot.brand || ot.product || '--') : (strip.brand || '--');
      const productDisplay = ot && ot.product && ot.product !== ot.brand ? ot.product : (strip.product || '');
      const refDisplay = ot ? (ot.ref || '') : '';

      return `
        <div 
          draggable="true"
          ondragstart="handleStripDragStart(event, ${idx})"
          ondragover="handleStripDragOver(event, ${idx})"
          ondragleave="handleStripDragLeave(event)"
          ondrop="handleStripDrop(event, ${idx})"
          ondragend="handleStripDragEnd(event)"
          ondblclick="handleStripCardClick(event, '${strip.otId || ''}', ${idx}, '${state.currentStripboardDate}')"
          class="stripboard-row strip-item-print group bg-resolve-surface hover:bg-resolve-card border border-resolve-border rounded-xl p-2.5 grid grid-cols-12 gap-2 items-center text-xs transition-all border-l-4 ${borderLeftColor} shadow-xs cursor-grab active:cursor-grabbing"
        >
          <!-- Col 1: Grip de arrastre + N° de secuencia -->
          <div class="col-span-1 flex items-center gap-1.5 text-[11px] text-resolve-dimText">
            <span class="text-stone-500 group-hover:text-amber-400 transition-colors cursor-grab active:cursor-grabbing no-print" title="Arrastra la tira a cualquier posición del día">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm6-12a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0z"/>
              </svg>
            </span>
            <span class="font-bold text-stone-300">#${idx + 1}</span>
          </div>

          <!-- Col 2: Horario / Turno -->
          <div class="col-span-2">
            <input 
              type="text" 
              onmousedown="pauseRowDrag(this)"
              onmouseup="resumeRowDrag(this)"
              onblur="resumeRowDrag(this)"
              value="${escapeHtml(strip.timeSlot || '')}" 
              onchange="updateStripField(${idx}, 'timeSlot', this.value)" 
              placeholder="08:30 - 10:30" 
              class="w-full bg-black/40 border border-resolve-border rounded-lg px-2 py-1 text-white font-bold text-xs font-mono focus:border-amber-500/60 focus:outline-none cursor-text"
            />
          </div>

          <!-- Col 3: N° OT y Referencia -->
          <div class="col-span-2 flex items-center gap-1.5 truncate">
            ${strip.otId ? `
              <button 
                type="button"
                data-no-drag="true"
                onmousedown="pauseRowDrag(this); event.stopPropagation();"
                onmouseup="resumeRowDrag(this)"
                onclick="event.stopPropagation(); emit('modal:open-envelope', { otId: '${strip.otId}' });" 
                title="Abrir Sobre OT" 
                class="px-2 py-0.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-xs font-mono truncate transition-all cursor-pointer"
              >
                ${strip.otId}
              </button>
            ` : `
              <button 
                type="button" 
                data-no-drag="true" 
                onmousedown="pauseRowDrag(this); event.stopPropagation();"
                onmouseup="resumeRowDrag(this)"
                onclick="event.stopPropagation(); openCustomTaskModal(${idx}, '${state.currentStripboardDate}')" 
                title="Editar Tarea Libre y Responsable" 
                class="px-2 py-0.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold text-xs transition-colors cursor-pointer"
              >
                LIBRE ✎
              </button>
            `}
            ${refDisplay ? `
              <span class="text-[10px] text-zinc-400 font-mono truncate" title="Ref: ${escapeHtml(refDisplay)}">
                ${escapeHtml(refDisplay)}
              </span>
            ` : ''}
          </div>

          <!-- Col 4: Cliente / Marca / Producto -->
          <div
            data-no-drag="true"
            onmousedown="pauseRowDrag(this)"
            onmouseup="resumeRowDrag(this)"
            onclick="event.stopPropagation(); handleStripCardClick(event, '${strip.otId || ''}', ${idx}, '${state.currentStripboardDate}')"
            class="col-span-2 truncate cursor-pointer group/client"
            title="${strip.otId ? 'Clic para abrir Sobre OT' : 'Clic para editar Tarea Libre'}"
          >
            <div class="font-bold text-white group-hover/client:text-amber-400 truncate transition-colors">${escapeHtml(clientDisplay)}</div>
            <div class="text-[10px] text-resolve-dimText truncate">
              ${escapeHtml(brandDisplay)}${productDisplay ? ' • ' + escapeHtml(productDisplay) : ''}
            </div>
          </div>

          <!-- Col 5: Tarea Asignada al Turno -->
          <div class="col-span-3">
            <input 
              type="text" 
              onmousedown="pauseRowDrag(this)"
              onmouseup="resumeRowDrag(this)"
              onblur="resumeRowDrag(this)"
              value="${escapeHtml(strip.task || '')}" 
              onchange="updateStripField(${idx}, 'task', this.value)" 
              placeholder="Instrucción de este turno de trabajo..." 
              class="w-full bg-black/30 border border-resolve-border rounded-lg px-2.5 py-1 text-zinc-100 text-xs focus:border-amber-500/60 focus:outline-none cursor-text"
            />
          </div>

          <!-- Col 6: Responsable / Área -->
          <div class="col-span-1">
            <input 
              type="text" 
              list="dept-options" 
              onmousedown="pauseRowDrag(this)"
              onmouseup="resumeRowDrag(this)"
              onblur="resumeRowDrag(this)"
              value="${escapeHtml(strip.assignee || 'Andrés J.')}" 
              onchange="addResponsible(this.value); updateStripField(${idx}, 'assignee', this.value)" 
              placeholder="Responsable" 
              class="w-full bg-black/30 border border-resolve-border rounded-lg px-1.5 py-1 text-cyan-300 font-semibold text-[11px] focus:border-amber-500/60 focus:outline-none text-center cursor-text"
            />
          </div>

          <!-- Col 7: Estado del Turno & Eliminar -->
          <div class="col-span-1 flex items-center justify-end gap-1.5">
            <select 
              onmousedown="pauseRowDrag(this)"
              onmouseup="resumeRowDrag(this)"
              onblur="resumeRowDrag(this)"
              onchange="updateStripField(${idx}, 'shiftStatus', this.value)" 
              class="bg-black/40 border border-resolve-border rounded-lg px-1.5 py-1 text-[10px] font-semibold text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="Por Iniciar" ${strip.shiftStatus === 'Por Iniciar' ? 'selected' : ''}>Por Iniciar</option>
              <option value="En Mesa" ${strip.shiftStatus === 'En Mesa' ? 'selected' : ''}>En Mesa</option>
              <option value="Entregado" ${strip.shiftStatus === 'Entregado' ? 'selected' : ''}>Entregado</option>
              <option value="Detenido" ${strip.shiftStatus === 'Detenido' ? 'selected' : ''}>Detenido</option>
            </select>
            <button 
              onclick="removeStrip(${idx})" 
              title="Quitar tira del plan" 
              class="p-1 hover:text-red-400 text-resolve-dimText transition-colors no-print cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
}

export function insertOtStripAtPosition(otId, positionIndex) {
  insertOtStripOnDate(otId, state.currentStripboardDate, positionIndex);
}

export function insertOtStripOnDate(otId, dateStr, positionIndex, customAssignee, customTimeSlot) {
  const orders = getOrders();
  const ot = orders.find(o => o.id === otId);
  if (!ot) return;

  const targetDate = dateStr || state.currentStripboardDate;
  const strips = getDayStrips(targetDate);
  const lastRoute = ot.routes && ot.routes.length > 0 ? ot.routes[ot.routes.length - 1] : null;
  const timeSlots = ["08:30 - 10:00", "10:00 - 11:30", "11:30 - 13:00", "14:00 - 15:30", "15:30 - 17:00", "17:00 - 18:30"];
  const idxForSlot = typeof positionIndex === 'number' ? positionIndex : strips.length;
  const nextSlot = customTimeSlot || timeSlots[Math.min(idxForSlot, timeSlots.length - 1)] || "17:00 - 18:30";

  const newStrip = {
    id: 'strip-' + Date.now() + Math.random().toString(36).substring(7),
    type: 'ot',
    otId: ot.id,
    client: ot.client,
    brand: ot.brand || ot.product,
    product: ot.product || '',
    timeSlot: nextSlot,
    task: lastRoute ? lastRoute.task : (ot.title || 'Desarrollo de piezas de campaña'),
    assignee: customAssignee || ot.responsible || (lastRoute ? (lastRoute.to || 'Andrés J.') : 'Andrés J.'),
    shiftStatus: 'Por Iniciar'
  };

  const safeIdx = Math.max(0, Math.min(strips.length, idxForSlot));
  strips.splice(safeIdx, 0, newStrip);
  saveDayStrips(targetDate, strips);
}

export function addOtToStripboard(otId) {
  const strips = getDayStrips(state.currentStripboardDate);
  insertOtStripAtPosition(otId, strips.length);
}

export function addBreakStripPrompt() {
  const title = typeof window !== 'undefined' ? window.prompt("Título de la banda separadora o corte:", "13:00 - 14:00 CORTE DE MEDIODÍA / ALMUERZO") : null;
  if (!title || !title.trim()) return;

  const strips = getDayStrips(state.currentStripboardDate);
  strips.push({
    id: 'strip-brk-' + Date.now(),
    type: 'break',
    title: title.trim()
  });

  saveDayStrips(state.currentStripboardDate, strips);
}

export function moveStrip(index, direction) {
  const strips = getDayStrips(state.currentStripboardDate);
  const targetIdx = index + direction;
  if (targetIdx < 0 || targetIdx >= strips.length) return;

  const temp = strips[index];
  strips[index] = strips[targetIdx];
  strips[targetIdx] = temp;

  saveDayStrips(state.currentStripboardDate, strips);
}

export function removeStrip(index, dateStr) {
  const targetDate = dateStr || state.currentStripboardDate;
  const strips = getDayStrips(targetDate);
  strips.splice(index, 1);
  saveDayStrips(targetDate, strips);
}

export function updateStripField(index, field, value, dateStr) {
  const targetDate = dateStr || state.currentStripboardDate;
  const strips = getDayStrips(targetDate);
  if (!strips[index]) return;
  strips[index][field] = value;
  saveDayStrips(targetDate, strips);
}

export function cycleStripStatusOnDate(dateStr, index) {
  const states = ['Por Iniciar', 'En Mesa', 'Entregado', 'Detenido'];
  const strips = getDayStrips(dateStr);
  if (!strips[index]) return;
  const currIdx = states.indexOf(strips[index].shiftStatus || 'Por Iniciar');
  strips[index].shiftStatus = states[(currIdx + 1) % states.length];
  saveDayStrips(dateStr, strips);
}

export function autoPopulatePendingOts() {
  const orders = getOrders();
  const activeOrders = orders.filter(o => o.status !== 'Cerrado' && o.status !== 'Cancelado' && o.status !== 'Archivada');
  if (activeOrders.length === 0) {
    if (typeof window !== 'undefined') window.alert("No hay OTs activas para planificar.");
    return;
  }

  const strips = getDayStrips(state.currentStripboardDate);
  const timeSlots = ["08:30 - 10:00", "10:00 - 11:30", "11:30 - 13:00", "14:00 - 15:30", "15:30 - 17:00", "17:00 - 18:30"];
  let slotIdx = strips.filter(s => s.type === 'ot').length;

  activeOrders.forEach(ot => {
    if (!strips.some(s => s.otId === ot.id)) {
      const lastRoute = ot.routes && ot.routes.length > 0 ? ot.routes[ot.routes.length - 1] : null;
      const assignedSlot = timeSlots[slotIdx % timeSlots.length] || "17:00 - 18:30";
      slotIdx++;

      strips.push({
        id: 'strip-' + Date.now() + Math.random().toString(36).substring(7),
        type: 'ot',
        otId: ot.id,
        client: ot.client,
        brand: ot.brand || ot.product,
        product: ot.product || '',
        timeSlot: assignedSlot,
        task: lastRoute ? lastRoute.task : (ot.title || 'Desarrollo'),
        assignee: ot.responsible || (lastRoute ? (lastRoute.to || 'Andrés J.') : 'Andrés J.'),
        shiftStatus: 'Por Iniciar'
      });
    }
  });

  saveDayStrips(state.currentStripboardDate, strips);
}

export function clearTodayStripboard() {
  if (typeof window !== 'undefined' && !window.confirm("¿Deseas vaciar todas las tiras del plan del día seleccionado?")) return;
  saveDayStrips(state.currentStripboardDate, []);
}

export function printStripboard() {
  if (typeof window !== 'undefined') window.print();
}

// ============================================================================
// DRAG & DROP: MANEJADORES DE TIRAS Y CONTENEDOR DÍA
// ============================================================================

export function handleStripCardClick(e, otId, stripIdx, dateStr) {
  if (state.dragState.isDragging) return;
  if (e && e.target && e.target.closest && e.target.closest('input, select, textarea, [data-no-open]')) {
    return;
  }
  if (otId) {
    emit('modal:open-envelope', { otId });
  } else if (stripIdx !== undefined && stripIdx !== null && stripIdx >= 0) {
    openCustomTaskModal(stripIdx, dateStr || state.currentStripboardDate);
  }
}

export function handleStripDragStart(e, idx, dateStr) {
  if (e.target && e.target.closest && e.target.closest('button, input, select, textarea, a, [data-no-drag]')) {
    e.preventDefault();
    return;
  }
  state.dragState.isDragging = true;
  state.dragState.sourceType = 'strip';
  state.dragState.sourceDate = dateStr || state.currentStripboardDate;
  state.dragState.sourceIndex = idx;
  state.dragState.otId = null;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }
  const row = e.currentTarget;
  setTimeout(() => {
    if (row && row.classList) row.classList.add('dragging');
  }, 0);
}

export function handlePoolOtDragStart(e, otId) {
  if (e.target && e.target.closest && e.target.closest('button, input, select, textarea, a, [data-no-drag]')) {
    e.preventDefault();
    return;
  }
  state.dragState.isDragging = true;
  state.dragState.sourceType = 'pool-ot';
  state.dragState.sourceDate = null;
  state.dragState.sourceIndex = null;
  state.dragState.otId = otId;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', otId);
  }
  const card = e.currentTarget;
  setTimeout(() => {
    if (card && card.classList) card.classList.add('opacity-40');
  }, 0);
}

export function handlePoolOtDragEnd(e) {
  if (e.currentTarget && e.currentTarget.classList) {
    e.currentTarget.classList.remove('opacity-40');
  }
  clearStripDropIndicators();
  resetDragState();
}

export function handleStripDragOver(e, idx) {
  e.preventDefault();
  e.stopPropagation();
  const row = e.currentTarget;
  if (!row) return;

  const rect = row.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const pos = e.clientY < midY ? 'before' : 'after';

  if (typeof document !== 'undefined') {
    document.querySelectorAll('.stripboard-row').forEach(r => {
      if (r !== row) r.classList.remove('drop-before', 'drop-after');
    });
  }

  if (pos === 'before') {
    row.classList.add('drop-before');
    row.classList.remove('drop-after');
  } else {
    row.classList.add('drop-after');
    row.classList.remove('drop-before');
  }

  state.dragState.dropTargetIndex = idx;
  state.dragState.dropPosition = pos;
}

export function handleStripDragLeave(e) {
  const row = e.currentTarget;
  if (row && (!e.relatedTarget || !row.contains(e.relatedTarget))) {
    row.classList.remove('drop-before', 'drop-after');
  }
}

export function handleStripDrop(e, targetIdx, targetDateStr) {
  e.preventDefault();
  e.stopPropagation();
  const destDate = targetDateStr || state.currentStripboardDate;
  const pos = state.dragState.dropPosition || 'after';
  clearStripDropIndicators();

  if (state.dragState.sourceType === 'strip' && state.dragState.sourceIndex !== null) {
    const srcDate = state.dragState.sourceDate || state.currentStripboardDate;
    const fromIdx = state.dragState.sourceIndex;

    if (srcDate === destDate) {
      const strips = getDayStrips(destDate);
      if (fromIdx === targetIdx) {
        resetDragState();
        return;
      }
      const [movedItem] = strips.splice(fromIdx, 1);
      let insertIdx = targetIdx;
      if (fromIdx < targetIdx) {
        insertIdx = pos === 'before' ? targetIdx - 1 : targetIdx;
      } else {
        insertIdx = pos === 'before' ? targetIdx : targetIdx + 1;
      }
      insertIdx = Math.max(0, Math.min(strips.length, insertIdx));
      strips.splice(insertIdx, 0, movedItem);
      saveDayStrips(destDate, strips);
    } else {
      const srcStrips = getDayStrips(srcDate);
      const destStrips = getDayStrips(destDate);
      if (srcStrips[fromIdx]) {
        const [movedItem] = srcStrips.splice(fromIdx, 1);
        const insertIdx = pos === 'before' ? targetIdx : targetIdx + 1;
        const safeIdx = Math.max(0, Math.min(destStrips.length, insertIdx));
        destStrips.splice(safeIdx, 0, movedItem);
        saveDayStrips(srcDate, srcStrips);
        saveDayStrips(destDate, destStrips);
        renderStripboard();
      }
    }
  } else if (state.dragState.sourceType === 'pool-ot' && state.dragState.otId) {
    const insertIdx = pos === 'before' ? targetIdx : targetIdx + 1;
    insertOtStripOnDate(state.dragState.otId, destDate, insertIdx);
  }

  resetDragState();
}

export function handleStripDragEnd(e) {
  clearStripDropIndicators();
  resetDragState();
}

export function handleContainerDragOver(e) {
  e.preventDefault();
  if (typeof document !== 'undefined') {
    const container = document.getElementById('stripboard-strips-container');
    if (container) container.classList.add('drag-over-empty');
  }
}

export function handleContainerDragLeave(e) {
  if (typeof document !== 'undefined') {
    const container = document.getElementById('stripboard-strips-container');
    if (container && (!e.relatedTarget || !container.contains(e.relatedTarget))) {
      container.classList.remove('drag-over-empty');
    }
  }
}

export function handleContainerDrop(e) {
  e.preventDefault();
  clearStripDropIndicators();
  const strips = getDayStrips(state.currentStripboardDate);

  if (state.dragState.sourceType === 'strip' && state.dragState.sourceIndex !== null) {
    const [movedItem] = strips.splice(state.dragState.sourceIndex, 1);
    strips.push(movedItem);
    saveDayStrips(state.currentStripboardDate, strips);
  } else if (state.dragState.sourceType === 'pool-ot' && state.dragState.otId) {
    insertOtStripOnDate(state.dragState.otId, state.currentStripboardDate, strips.length);
  }

  resetDragState();
}

// ============================================================================
// VISTA 2: SEMANA LABORAL (LUNES A SÁBADO)
// ============================================================================

export function getWeekMondayToSaturday(refDateStr) {
  const ref = new Date(refDateStr + 'T00:00:00');
  const dayOfWeek = ref.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
  const diffToMonday = dayOfWeek === 0 ? -6 : (1 - dayOfWeek);
  const monday = new Date(ref);
  monday.setDate(ref.getDate() + diffToMonday);

  const dayNames = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  const todayKey = formatDateKeyLocal(new Date());
  const days = [];

  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = formatDateKeyLocal(d);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    days.push({
      dateStr,
      dayName: dayNames[i],
      shortDate: `${dd}/${mm}`,
      isToday: dateStr === todayKey,
      isSelected: dateStr === state.currentStripboardDate
    });
  }
  return days;
}

export function handleWeekColDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('ring-1', 'ring-amber-500', 'bg-amber-950/10');
}

export function handleWeekColDragLeave(e) {
  const col = e.currentTarget;
  if (!col.contains(e.relatedTarget)) {
    col.classList.remove('ring-1', 'ring-amber-500', 'bg-amber-950/10');
  }
}

export function handleWeekColDrop(e, targetDateStr) {
  e.preventDefault();
  clearStripDropIndicators();

  if (state.dragState.sourceType === 'strip' && state.dragState.sourceIndex !== null) {
    const srcDate = state.dragState.sourceDate || state.currentStripboardDate;
    const fromIdx = state.dragState.sourceIndex;
    const srcStrips = getDayStrips(srcDate);
    const destStrips = srcDate === targetDateStr ? srcStrips : getDayStrips(targetDateStr);

    if (srcStrips[fromIdx]) {
      const [movedItem] = srcStrips.splice(fromIdx, 1);
      destStrips.push(movedItem);
      saveDayStrips(srcDate, srcStrips);
      if (srcDate !== targetDateStr) {
        saveDayStrips(targetDateStr, destStrips);
      }
      state.currentStripboardDate = targetDateStr;
      renderStripboard();
    }
  } else if (state.dragState.sourceType === 'pool-ot' && state.dragState.otId) {
    const destStrips = getDayStrips(targetDateStr);
    state.currentStripboardDate = targetDateStr;
    insertOtStripOnDate(state.dragState.otId, targetDateStr, destStrips.length);
  }

  resetDragState();
}

export function renderStripboardWeekView() {
  if (typeof document === 'undefined') return;

  const gridEl = document.getElementById('stripboard-week-grid');
  const rangeLabelEl = document.getElementById('stripboard-week-range-label');
  if (!gridEl) return;

  const weekDays = getWeekMondayToSaturday(state.currentStripboardDate);
  const orders = getOrders();

  if (rangeLabelEl && weekDays.length === 6) {
    rangeLabelEl.innerText = `SEMANA LABORAL: LUNES ${weekDays[0].shortDate} AL SÁBADO ${weekDays[5].shortDate}`;
  }

  gridEl.innerHTML = weekDays.map(day => {
    const dayStrips = getDayStrips(day.dateStr);
    const otCount = dayStrips.filter(s => s.type === 'ot').length;

    const headerHighlight = day.isSelected
      ? 'bg-amber-950/40 border-b-2 border-b-amber-500'
      : (day.isToday ? 'bg-resolve-card border-b border-resolve-border' : 'bg-resolve-panel border-b border-resolve-border');

    const stripsHtml = dayStrips.length === 0 ? `
      <div class="h-32 border border-dashed border-resolve-border/60 rounded p-3 flex flex-col items-center justify-center text-center text-[10px] text-stone-500">
        <span>Sin tiras asignadas</span>
        <span class="text-[9px] text-stone-600 mt-1">Arrastra OTs o tiras aquí</span>
      </div>
    ` : dayStrips.map((strip, idx) => {
      if (strip.type === 'break') {
        return `
          <div
            draggable="true"
            ondragstart="handleStripDragStart(event, ${idx}, '${day.dateStr}')"
            ondragover="handleStripDragOver(event, ${idx})"
            ondragleave="handleStripDragLeave(event)"
            ondrop="handleStripDrop(event, ${idx}, '${day.dateStr}')"
            ondragend="handleStripDragEnd(event)"
            class="stripboard-row bg-resolve-panel border border-amber-600/40 border-l-4 border-l-amber-500 rounded px-2 py-1.5 text-[10px] text-amber-300 font-bold flex items-center justify-between gap-1 cursor-grab active:cursor-grabbing"
          >
            <span class="truncate">${escapeHtml(strip.title || 'CORTE / SEPARADOR')}</span>
            <button onclick="removeStrip(${idx}, '${day.dateStr}')" class="text-stone-500 hover:text-red-400 shrink-0 cursor-pointer">✕</button>
          </div>
        `;
      }

      const ot = strip.otId ? orders.find(o => o.id === strip.otId) : null;
      let borderLeft = 'border-l-blue-500';
      let statusBadge = 'text-stone-300 bg-resolve-bg border-resolve-border';
      if (strip.shiftStatus === 'En Mesa') {
        borderLeft = 'border-l-amber-500 bg-amber-950/10';
        statusBadge = 'text-amber-300 bg-amber-950/60 border-amber-700/60';
      } else if (strip.shiftStatus === 'Entregado') {
        borderLeft = 'border-l-emerald-500 opacity-80';
        statusBadge = 'text-emerald-300 bg-emerald-950/60 border-emerald-700/60';
      } else if (strip.shiftStatus === 'Detenido') {
        borderLeft = 'border-l-red-500 bg-red-950/10';
        statusBadge = 'text-red-300 bg-red-950/60 border-red-700/60';
      }

      const clientDisplay = ot ? (ot.client || '--') : (strip.client || '--');
      const brandDisplay = ot ? (ot.brand || ot.product || '') : (strip.brand || '');

      return `
        <div
          draggable="true"
          ondragstart="handleStripDragStart(event, ${idx}, '${day.dateStr}')"
          ondragover="handleStripDragOver(event, ${idx})"
          ondragleave="handleStripDragLeave(event)"
          ondrop="handleStripDrop(event, ${idx}, '${day.dateStr}')"
          ondragend="handleStripDragEnd(event)"
          onclick="handleStripCardClick(event, '${strip.otId || ''}', ${idx}, '${day.dateStr}')"
          class="stripboard-row bg-resolve-surface hover:bg-resolve-card border border-resolve-border border-l-4 ${borderLeft} rounded p-2 text-[11px] flex flex-col gap-1 shadow-xs cursor-pointer transition-colors"
        >
          <div class="flex items-center justify-between gap-1">
            <div class="flex items-center gap-1 min-w-0">
              <span class="text-[10px] font-bold text-stone-400">#${idx + 1}</span>
              ${strip.otId ? `
                <button
                  type="button"
                  data-no-drag="true"
                  onmousedown="pauseRowDrag(this); event.stopPropagation();"
                  onmouseup="resumeRowDrag(this)"
                  onclick="event.stopPropagation(); emit('modal:open-envelope', { otId: '${strip.otId}' });"
                  class="px-1.5 py-0.2 bg-resolve-panel hover:bg-resolve-border border border-resolve-border hover:border-amber-400 rounded text-amber-400 font-bold text-[10px] truncate cursor-pointer"
                >
                  ${strip.otId}
                </button>
              ` : `
                <button
                  type="button"
                  data-no-drag="true"
                  onmousedown="pauseRowDrag(this); event.stopPropagation();"
                  onmouseup="resumeRowDrag(this)"
                  onclick="event.stopPropagation(); openCustomTaskModal(${idx}, '${day.dateStr}')"
                  class="px-1.5 py-0.2 bg-resolve-panel hover:bg-resolve-border border border-resolve-border hover:border-amber-400 rounded text-amber-300 font-bold text-[10px] cursor-pointer"
                  title="Editar Tarea Libre y Responsable"
                >
                  LIBRE ✎
                </button>
              `}
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <span class="text-[9px] text-stone-400">${escapeHtml(strip.timeSlot || '')}</span>
              <button
                type="button"
                data-no-drag="true"
                data-no-open="true"
                onmousedown="pauseRowDrag(this); event.stopPropagation();"
                onmouseup="resumeRowDrag(this)"
                onclick="event.stopPropagation(); removeStrip(${idx}, '${day.dateStr}')"
                title="Quitar tira"
                class="text-stone-500 hover:text-red-400 text-[10px] cursor-pointer"
              >✕</button>
            </div>
          </div>

          <div class="font-bold text-white hover:text-amber-400 text-[11px] truncate transition-colors" title="Clic para abrir Sobre OT • ${escapeHtml(clientDisplay)}">
            ${escapeHtml(clientDisplay)} ${brandDisplay ? '<span class="text-resolve-dimText font-normal">• ' + escapeHtml(brandDisplay) + '</span>' : ''}
          </div>

          <div class="text-[10px] text-stone-300 line-clamp-2 leading-tight">
            ${escapeHtml(strip.task || '')}
          </div>

          <div class="flex items-center justify-between pt-1 mt-0.5 border-t border-resolve-border/50 text-[9px]">
            <span class="text-cyan-300 font-bold truncate max-w-[95px]">${escapeHtml(strip.assignee || 'Creativos')}</span>
            <button
              type="button"
              data-no-drag="true"
              data-no-open="true"
              onmousedown="pauseRowDrag(this); event.stopPropagation();"
              onmouseup="resumeRowDrag(this)"
              onclick="event.stopPropagation(); cycleStripStatusOnDate('${day.dateStr}', ${idx})"
              title="Clic para cambiar estado del turno"
              class="px-1.5 py-0.5 rounded border ${statusBadge} font-bold cursor-pointer"
            >
              ${escapeHtml(strip.shiftStatus || 'Por Iniciar')}
            </button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div
        ondragover="handleWeekColDragOver(event)"
        ondragleave="handleWeekColDragLeave(event)"
        ondrop="handleWeekColDrop(event, '${day.dateStr}')"
        class="week-day-col flex flex-col h-full min-w-[195px] overflow-hidden transition-colors ${day.isSelected ? 'bg-resolve-surface/40' : ''}"
      >
        <!-- Cabecera del día -->
        <div
          onclick="selectStripboardDate('${day.dateStr}', false)"
          class="px-2.5 py-2 ${headerHighlight} flex items-center justify-between cursor-pointer shrink-0"
        >
          <div>
            <div class="flex items-center gap-1.5">
              <span class="text-[11px] font-black tracking-wider ${day.isSelected ? 'text-amber-400' : 'text-white'}">${day.dayName}</span>
              ${day.isToday ? '<span class="px-1 py-0.2 bg-amber-500 text-stone-950 font-black text-[8px] rounded uppercase">HOY</span>' : ''}
            </div>
            <div class="text-[10px] text-resolve-dimText font-bold">${day.shortDate}</div>
          </div>
          <div class="flex items-center gap-1">
            <span class="px-1.5 py-0.5 rounded bg-resolve-bg border border-resolve-border text-[10px] font-bold text-stone-300">${otCount}</span>
            <button
              onclick="event.stopPropagation(); selectStripboardDate('${day.dateStr}', true)"
              title="Abrir este día en vista detallada de Tiras"
              class="px-1.5 py-0.5 rounded bg-resolve-bg hover:bg-resolve-card border border-resolve-border text-[9px] text-amber-400 font-bold cursor-pointer"
            >
              Ver Día
            </button>
          </div>
        </div>

        <!-- Pila vertical de tiras del día -->
        <div class="flex-1 overflow-y-auto p-2 space-y-2">
          ${stripsHtml}
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// VISTA 3: TIMELINE GANTT (08:00 A 19:00) Y DAVINCI RESOLVE TRIM
// ============================================================================

export function parseTimeSlotToMinutes(timeSlot, fallbackIdx = 0) {
  const str = String(timeSlot || '');
  const matches = str.match(/(\d{1,2}):(\d{2})\s*[-–a]\s*(\d{1,2}):(\d{2})/);
  if (matches) {
    let startM = parseInt(matches[1], 10) * 60 + parseInt(matches[2], 10);
    let endM = parseInt(matches[3], 10) * 60 + parseInt(matches[4], 10);
    if (endM <= startM) endM = startM + 90;
    startM = Math.max(GANTT_START_MIN, Math.min(GANTT_END_MIN - 30, startM));
    endM = Math.max(startM + 30, Math.min(GANTT_END_MIN, endM));
    return { startMin: startM, endMin: endM };
  }
  const defaultStart = Math.min(GANTT_END_MIN - 90, GANTT_START_MIN + 30 + (fallbackIdx * 90));
  return { startMin: defaultStart, endMin: defaultStart + 90 };
}

export function minutesToHHMM(mins) {
  const clamped = Math.max(GANTT_START_MIN, Math.min(GANTT_END_MIN, Math.round(mins / 15) * 15));
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mm = String(clamped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function shiftStripTimeSlot(dateStr, stripIdx, deltaMinutes) {
  const strips = getDayStrips(dateStr);
  const strip = strips[stripIdx];
  if (!strip) return;

  const { startMin, endMin } = parseTimeSlotToMinutes(strip.timeSlot, stripIdx);
  const duration = Math.max(15, endMin - startMin);
  let newStart = startMin + deltaMinutes;
  if (newStart < GANTT_START_MIN) newStart = GANTT_START_MIN;
  if (newStart + duration > GANTT_END_MIN) newStart = GANTT_END_MIN - duration;
  const newEnd = newStart + duration;

  strip.timeSlot = `${minutesToHHMM(newStart)} - ${minutesToHHMM(newEnd)}`;
  saveDayStrips(dateStr, strips);
}

export function startGanttClipTrim(e, dateStr, stripIdx, edge) {
  e.preventDefault();
  e.stopPropagation();

  const handle = e.currentTarget;
  const clip = handle.closest('.gantt-clip');
  if (!clip) return;

  const lane = clip.closest('.gantt-track-lane');
  if (!lane) return;

  const strips = getDayStrips(dateStr);
  const strip = strips[stripIdx];
  if (!strip) return;

  clip.setAttribute('draggable', 'false');
  clip.classList.add('ring-2', 'ring-amber-400', 'z-40', 'shadow-2xl');

  const { startMin: initialStart, endMin: initialEnd } = parseTimeSlotToMinutes(strip.timeSlot, stripIdx);
  let currentStart = initialStart;
  let currentEnd = initialEnd;

  let hud = document.getElementById('gantt-trim-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'gantt-trim-hud';
    hud.className = 'fixed z-50 pointer-events-none px-2.5 py-1.5 rounded-lg bg-stone-950/95 text-amber-300 font-mono text-[11px] font-bold border border-amber-500/50 shadow-2xl backdrop-blur-md flex items-center gap-2 select-none transition-opacity';
    document.body.appendChild(hud);
  }
  hud.style.display = 'flex';
  hud.style.opacity = '1';

  const timeSlotSpan = clip.querySelector('.gantt-clip-timeslot');

  function formatDuration(start, end) {
    const total = Math.max(0, end - start);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}` : `${m}m`;
  }

  function updateHudPosition(clientEvent) {
    const durStr = formatDuration(currentStart, currentEnd);
    const delta = edge === 'left' ? (initialStart - currentStart) : (currentEnd - initialEnd);
    const deltaSign = delta > 0 ? `+${delta}m` : (delta < 0 ? `${delta}m` : '0m');
    const deltaColor = delta > 0 ? 'text-emerald-400' : (delta < 0 ? 'text-amber-400' : 'text-zinc-400');

    hud.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
      <span>${minutesToHHMM(currentStart)} – ${minutesToHHMM(currentEnd)}</span>
      <span class="text-zinc-400 font-sans text-[10px]">(${durStr})</span>
      <span class="${deltaColor} font-bold text-[11px]">${deltaSign}</span>
    `;
    const hudX = Math.min(window.innerWidth - 240, Math.max(10, clientEvent.clientX - 110));
    const hudY = Math.max(10, clientEvent.clientY - 44);
    hud.style.left = `${hudX}px`;
    hud.style.top = `${hudY}px`;
  }

  updateHudPosition(e);

  function onMouseMove(moveEvent) {
    const laneRect = lane.getBoundingClientRect();
    if (laneRect.width <= 0) return;

    const relX = moveEvent.clientX - laneRect.left;
    const ratio = Math.max(0, Math.min(1, relX / laneRect.width));
    const rawMinutes = GANTT_START_MIN + (ratio * GANTT_TOTAL_MIN);
    const snapped = Math.round(rawMinutes / 15) * 15;

    if (edge === 'left') {
      currentStart = Math.max(GANTT_START_MIN, Math.min(currentEnd - 15, snapped));
    } else {
      currentEnd = Math.max(currentStart + 15, Math.min(GANTT_END_MIN, snapped));
    }

    const leftPct = ((currentStart - GANTT_START_MIN) / GANTT_TOTAL_MIN) * 100;
    const widthPct = Math.max(2.2, ((currentEnd - currentStart) / GANTT_TOTAL_MIN) * 100);
    clip.style.left = `${leftPct.toFixed(2)}%`;
    clip.style.width = `${widthPct.toFixed(2)}%`;

    if (timeSlotSpan) {
      timeSlotSpan.innerText = `${minutesToHHMM(currentStart)} - ${minutesToHHMM(currentEnd)}`;
    }

    updateHudPosition(moveEvent);
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);

    clip.classList.remove('ring-2', 'ring-amber-400', 'z-40', 'shadow-2xl');
    clip.setAttribute('draggable', 'true');

    if (hud) {
      hud.style.opacity = '0';
      setTimeout(() => { if (hud) hud.style.display = 'none'; }, 200);
    }

    const newTimeSlot = `${minutesToHHMM(currentStart)} - ${minutesToHHMM(currentEnd)}`;
    if (newTimeSlot !== strip.timeSlot) {
      strip.timeSlot = newTimeSlot;
      saveDayStrips(dateStr, strips);
    }
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

export function classifyDepartmentTrack(assignee) {
  const a = (assignee || '').toLowerCase();
  if (a.includes('cuenta') || a.includes('cliente')) return 'Cuentas & Contacto';
  if (a.includes('redac') || a.includes('copy')) return 'Redacción / Copy';
  if (a.includes('arte') || a.includes('diseñ')) return 'Dirección de Arte';
  if (a.includes('dirección creativa') || a.includes('dgc') || a.includes('creativ')) return 'Dirección Creativa & Creativos';
  if (a.includes('produc') || a.includes('final') || a.includes('preprensa') || a.includes('audio')) return 'Producción & Artes Finales';
  return 'Control de Tráfico / General';
}

export function handleGanttTrackDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('ring-1', 'ring-amber-500', 'bg-amber-950/10');
}

export function handleGanttTrackDragLeave(e) {
  const lane = e.currentTarget;
  if (!lane.contains(e.relatedTarget)) {
    lane.classList.remove('ring-1', 'ring-amber-500', 'bg-amber-950/10');
  }
}

export function handleGanttTrackDrop(e, targetDeptAssignee) {
  e.preventDefault();
  const lane = e.currentTarget;
  const rect = lane.getBoundingClientRect();
  const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  const ratio = rect.width > 0 ? (relX / rect.width) : 0;
  const rawStartMin = GANTT_START_MIN + (ratio * GANTT_TOTAL_MIN);

  clearStripDropIndicators();

  if (state.dragState.sourceType === 'strip' && state.dragState.sourceIndex !== null) {
    const strips = getDayStrips(state.currentStripboardDate);
    const strip = strips[state.dragState.sourceIndex];
    if (strip) {
      const { startMin: oldStart, endMin: oldEnd } = parseTimeSlotToMinutes(strip.timeSlot, state.dragState.sourceIndex);
      const currentDuration = Math.max(15, oldEnd - oldStart);
      const snappedStart = Math.max(GANTT_START_MIN, Math.min(GANTT_END_MIN - currentDuration, Math.round(rawStartMin / 15) * 15));
      strip.assignee = targetDeptAssignee;
      strip.timeSlot = `${minutesToHHMM(snappedStart)} - ${minutesToHHMM(snappedStart + currentDuration)}`;
      saveDayStrips(state.currentStripboardDate, strips);
    }
  } else if (state.dragState.sourceType === 'pool-ot' && state.dragState.otId) {
    const strips = getDayStrips(state.currentStripboardDate);
    const snappedStart = Math.max(GANTT_START_MIN, Math.min(GANTT_END_MIN - 90, Math.round(rawStartMin / 30) * 30));
    const newSlot = `${minutesToHHMM(snappedStart)} - ${minutesToHHMM(snappedStart + 90)}`;
    insertOtStripOnDate(state.dragState.otId, state.currentStripboardDate, strips.length, targetDeptAssignee, newSlot);
  }

  resetDragState();
}

export function renderStripboardGanttView() {
  if (typeof document === 'undefined') return;

  const container = document.getElementById('stripboard-gantt-container');
  const dateLabel = document.getElementById('stripboard-gantt-date-label');
  if (!container) return;

  const [yyyy, mm, dd] = state.currentStripboardDate.split('-');
  if (dateLabel) dateLabel.innerText = `${dd}/${mm}/${yyyy}`;

  const strips = getDayStrips(state.currentStripboardDate);
  const orders = getOrders();

  const tracks = [
    { label: 'Cuentas & Contacto', defaultAssignee: 'Cuentas', color: 'border-cyan-500 bg-cyan-950/50 text-cyan-200' },
    { label: 'Dirección Creativa & Creativos', defaultAssignee: 'Creativos', color: 'border-amber-500 bg-amber-950/50 text-amber-200' },
    { label: 'Redacción / Copy', defaultAssignee: 'Redacción / Copy', color: 'border-yellow-500 bg-yellow-950/50 text-yellow-200' },
    { label: 'Dirección de Arte', defaultAssignee: 'Dirección de Arte', color: 'border-purple-500 bg-purple-950/50 text-purple-200' },
    { label: 'Producción & Artes Finales', defaultAssignee: 'Producción Audiovisual', color: 'border-emerald-500 bg-emerald-950/50 text-emerald-200' },
    { label: 'Control de Tráfico / General', defaultAssignee: 'Control de Tráfico', color: 'border-blue-500 bg-blue-950/50 text-blue-200' }
  ];

  const hours = [];
  for (let h = 8; h <= 18; h++) {
    hours.push(`${String(h).padStart(2, '0')}:00`);
  }

  const rulerHtml = hours.map(h => `
    <div class="flex-1 border-l border-resolve-border/70 pl-1.5 py-1.5 text-[10px] font-bold text-resolve-dimText">
      ${h}
    </div>
  `).join('');

  const tracksHtml = tracks.map(track => {
    const trackStrips = strips
      .map((strip, idx) => ({ strip, idx }))
      .filter(item => item.strip.type === 'ot' && classifyDepartmentTrack(item.strip.assignee) === track.label);

    const clipsHtml = trackStrips.map(({ strip, idx }) => {
      const { startMin, endMin } = parseTimeSlotToMinutes(strip.timeSlot, idx);
      const leftPct = ((startMin - GANTT_START_MIN) / GANTT_TOTAL_MIN) * 100;
      const widthPct = Math.max(2.5, ((endMin - startMin) / GANTT_TOTAL_MIN) * 100);
      const ot = strip.otId ? orders.find(o => o.id === strip.otId) : null;
      const clientName = ot ? ot.client : (strip.client || '');

      return `
        <div
          id="gantt-clip-${idx}"
          draggable="true"
          ondragstart="handleStripDragStart(event, ${idx}, '${state.currentStripboardDate}')"
          ondragend="handleStripDragEnd(event)"
          onclick="handleStripCardClick(event, '${strip.otId || ''}', ${idx}, '${state.currentStripboardDate}')"
          style="left: ${leftPct.toFixed(2)}%; width: ${widthPct.toFixed(2)}%;"
          class="gantt-clip stripboard-row absolute top-1.5 bottom-1.5 rounded-md border-l-4 ${track.color} border border-resolve-border hover:border-amber-400/80 px-2.5 py-1 flex flex-col justify-between overflow-hidden shadow-md cursor-pointer hover:z-20 transition-[border-color,background-color] group/clip select-none"
          title="${strip.otId ? 'Clic para abrir Sobre ' + escapeHtml(strip.otId) : 'Clic para editar Tarea Libre'} • ${escapeHtml(strip.timeSlot || '')} • ${escapeHtml(strip.task || '')}"
        >
          <!-- DaVinci Trim Handle Izquierda (In-Point / Head) -->
          <div
            class="gantt-trim-handle gantt-trim-left absolute left-0 top-0 bottom-0 w-3 z-30 cursor-ew-resize flex items-center justify-center opacity-0 group-hover/clip:opacity-100 hover:!opacity-100 hover:bg-amber-400/30 active:bg-amber-400/50 transition-all rounded-l"
            title="Arrastrar para recortar/expandir inicio (DaVinci Trim Head)"
            onmousedown="startGanttClipTrim(event, '${state.currentStripboardDate}', ${idx}, 'left')"
            onclick="event.stopPropagation()"
          >
            <div class="w-[2px] h-3.5 bg-amber-400/90 rounded-full shadow-[0_0_4px_rgba(245,158,11,0.6)] pointer-events-none"></div>
          </div>

          <div class="flex items-center justify-between gap-1 text-[10px]">
            <div class="flex items-center gap-1 truncate min-w-0">
              ${strip.otId ? `
                <button
                  type="button"
                  data-no-drag="true"
                  onmousedown="pauseRowDrag(this); event.stopPropagation();"
                  onmouseup="resumeRowDrag(this)"
                  onclick="event.stopPropagation(); emit('modal:open-envelope', { otId: '${strip.otId}' });"
                  class="font-black text-amber-400 hover:text-white underline truncate cursor-pointer font-mono"
                >
                  ${strip.otId}
                </button>
              ` : `
                <button
                  type="button"
                  data-no-drag="true"
                  onmousedown="pauseRowDrag(this); event.stopPropagation();"
                  onmouseup="resumeRowDrag(this)"
                  onclick="event.stopPropagation(); openCustomTaskModal(${idx}, '${state.currentStripboardDate}')"
                  class="px-1.5 py-0.2 bg-resolve-panel hover:bg-resolve-border border border-resolve-border hover:border-amber-400 rounded text-amber-300 font-bold text-[9px] cursor-pointer"
                  title="Editar Tarea Libre y Responsable"
                >
                  LIBRE ✎
                </button>
              `}
              <span class="text-[9px] text-stone-300 truncate">${escapeHtml(clientName)}</span>
            </div>
            <div class="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                data-no-drag="true"
                data-no-open="true"
                onmousedown="pauseRowDrag(this); event.stopPropagation();"
                onmouseup="resumeRowDrag(this)"
                onclick="event.stopPropagation(); shiftStripTimeSlot('${state.currentStripboardDate}', ${idx}, -15)"
                title="Atrasar 15 min"
                class="px-1 hover:bg-black/40 rounded text-[9px] text-zinc-300 hover:text-white cursor-pointer"
              >◀</button>
              <button
                type="button"
                data-no-drag="true"
                data-no-open="true"
                onmousedown="pauseRowDrag(this); event.stopPropagation();"
                onmouseup="resumeRowDrag(this)"
                onclick="event.stopPropagation(); shiftStripTimeSlot('${state.currentStripboardDate}', ${idx}, 15)"
                title="Adelantar 15 min"
                class="px-1 hover:bg-black/40 rounded text-[9px] text-zinc-300 hover:text-white cursor-pointer"
              >▶</button>
            </div>
          </div>

          <div class="text-[10px] font-semibold text-white truncate my-auto">${escapeHtml(strip.task || '')}</div>

          <div class="flex items-center justify-between text-[9px] text-stone-300 pt-0.5">
            <span class="gantt-clip-timeslot font-mono tracking-tight">${escapeHtml(strip.timeSlot || '')}</span>
            <span class="font-semibold text-zinc-400 truncate ml-1">${escapeHtml(strip.shiftStatus || '')}</span>
          </div>

          <!-- DaVinci Trim Handle Derecha (Out-Point / Tail) -->
          <div
            class="gantt-trim-handle gantt-trim-right absolute right-0 top-0 bottom-0 w-3 z-30 cursor-ew-resize flex items-center justify-center opacity-0 group-hover/clip:opacity-100 hover:!opacity-100 hover:bg-amber-400/30 active:bg-amber-400/50 transition-all rounded-r"
            title="Arrastrar para expandir/contraer fin (DaVinci Trim Tail)"
            onmousedown="startGanttClipTrim(event, '${state.currentStripboardDate}', ${idx}, 'right')"
            onclick="event.stopPropagation()"
          >
            <div class="w-[2px] h-3.5 bg-amber-400/90 rounded-full shadow-[0_0_4px_rgba(245,158,11,0.6)] pointer-events-none"></div>
          </div>
        </div>
      `;
    }).join('');

    const bgGridCols = hours.map(() => `<div class="flex-1 border-l border-resolve-border/30 h-full"></div>`).join('');

    return `
      <div class="flex border-b border-resolve-border min-h-[76px] bg-resolve-surface/40">
        <div class="w-52 shrink-0 bg-resolve-panel border-r border-resolve-border p-2.5 flex flex-col justify-between">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold text-white leading-tight">${track.label}</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-resolve-bg border border-resolve-border text-amber-400 font-bold">${trackStrips.length}</span>
          </div>
          <div class="text-[9px] text-resolve-dimText uppercase tracking-wider">Pista de Departamento</div>
        </div>

        <div
          ondragover="handleGanttTrackDragOver(event)"
          ondragleave="handleGanttTrackDragLeave(event)"
          ondrop="handleGanttTrackDrop(event, '${track.defaultAssignee}')"
          class="gantt-track-lane relative flex-1 min-w-[780px] transition-colors"
        >
          <div class="absolute inset-0 flex pointer-events-none">
            ${bgGridCols}
          </div>
          ${clipsHtml}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="border border-resolve-border rounded bg-resolve-bg overflow-x-auto">
      <div class="flex bg-resolve-panel border-b border-resolve-border sticky top-0 z-10">
        <div class="w-52 shrink-0 border-r border-resolve-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-resolve-dimText flex items-center">
          PISTAS / HORARIO
        </div>
        <div class="flex-1 flex min-w-[780px]">
          ${rulerHtml}
        </div>
      </div>
      <div class="divide-y divide-resolve-border">
        ${tracksHtml}
      </div>
    </div>
  `;
}

// ============================================================================
// VISTA 4: CALENDARIO MENSUAL OPERATIVO (LUNES A SÁBADO)
// ============================================================================

export function extractCommitmentsByDate() {
  const orders = getOrders();
  const map = {};
  orders.forEach(ot => {
    if (!ot.routes) return;
    ot.routes.forEach(r => {
      if (!r.deliveryDate) return;
      const m = String(r.deliveryDate).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) {
        const key = `${m[3]}-${m[2]}-${m[1]}`;
        if (!map[key]) map[key] = [];
        if (!map[key].some(item => item.otId === ot.id)) {
          map[key].push({
            otId: ot.id,
            client: ot.client,
            brand: ot.brand || ot.product || '',
            task: r.task || ot.title || '',
            urgent: ot.urgent
          });
        }
      }
    });
  });
  return map;
}

export function handleMonthCellDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('ring-1', 'ring-amber-500', 'bg-amber-950/10');
}

export function handleMonthCellDragLeave(e) {
  const cell = e.currentTarget;
  if (!cell.contains(e.relatedTarget)) {
    cell.classList.remove('ring-1', 'ring-amber-500', 'bg-amber-950/10');
  }
}

export function handleMonthCellDrop(e, targetDateStr) {
  e.preventDefault();
  clearStripDropIndicators();

  if (state.dragState.sourceType === 'pool-ot' && state.dragState.otId) {
    const destStrips = getDayStrips(targetDateStr);
    state.currentStripboardDate = targetDateStr;
    insertOtStripOnDate(state.dragState.otId, targetDateStr, destStrips.length);
  }
  resetDragState();
}

export function renderStripboardMonthView() {
  if (typeof document === 'undefined') return;

  const gridEl = document.getElementById('stripboard-month-grid');
  const titleEl = document.getElementById('stripboard-month-title');
  if (!gridEl) return;

  const ref = new Date(state.currentStripboardDate + 'T00:00:00');
  const year = ref.getFullYear();
  const month = ref.getMonth();

  const monthNames = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  if (titleEl) {
    titleEl.innerText = `CALENDARIO OPERATIVO (LUNES A SÁBADO) • ${monthNames[month]} ${year}`;
  }

  const commitmentsMap = extractCommitmentsByDate();
  const todayKey = formatDateKeyLocal(new Date());

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  let startCursor = new Date(firstDayOfMonth);
  if (startCursor.getDay() === 0) {
    startCursor.setDate(startCursor.getDate() + 1);
  } else {
    const diffToMon = 1 - startCursor.getDay();
    startCursor.setDate(startCursor.getDate() + diffToMon);
  }

  const cells = [];
  let cursor = new Date(startCursor);
  while (cursor <= lastDayOfMonth || cursor.getDay() !== 1) {
    const dow = cursor.getDay();
    if (dow >= 1 && dow <= 6) {
      cells.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
    if (cells.length >= 36) break;
  }

  gridEl.innerHTML = cells.map(d => {
    const dateStr = formatDateKeyLocal(d);
    const inCurrentMonth = d.getMonth() === month;
    const isToday = dateStr === todayKey;
    const isSelected = dateStr === state.currentStripboardDate;

    const dayStrips = getDayStrips(dateStr).filter(s => s.type === 'ot');
    const deliveries = commitmentsMap[dateStr] || [];

    const deliveriesHtml = deliveries.slice(0, 2).map(del => `
      <div
        onclick="event.stopPropagation(); emit('modal:open-envelope', { otId: '${del.otId}' });"
        class="px-1.5 py-0.5 rounded bg-red-950/70 border border-red-700/70 text-red-300 text-[9px] font-bold truncate cursor-pointer hover:bg-red-900/70"
        title="SALIDA COMPROMETIDA: ${escapeHtml(del.otId)} • ${escapeHtml(del.client)} (${escapeHtml(del.task)})"
      >
        ENTREGA ${del.otId} • ${escapeHtml(del.client)}
      </div>
    `).join('');

    const stripsHtml = dayStrips.slice(0, 3).map(st => `
      <div
        onclick="event.stopPropagation(); ${st.otId ? `emit('modal:open-envelope', { otId: '${st.otId}' });` : `selectStripboardDate('${dateStr}', true)`}"
        class="px-1.5 py-0.5 rounded bg-resolve-panel border border-resolve-border text-stone-200 text-[9px] truncate cursor-pointer hover:border-amber-500/60"
        title="Tira en Plan: ${escapeHtml(st.otId || 'LIBRE')} • ${escapeHtml(st.timeSlot || '')} • ${escapeHtml(st.task || '')}"
      >
        <span class="text-amber-400 font-bold">${escapeHtml(st.otId || 'TIRA')}</span> ${escapeHtml(st.client || '')}
      </div>
    `).join('');

    const extraCount = (dayStrips.length > 3 ? dayStrips.length - 3 : 0) + (deliveries.length > 2 ? deliveries.length - 2 : 0);

    return `
      <div
        onclick="selectStripboardDate('${dateStr}', false)"
        ondblclick="selectStripboardDate('${dateStr}', true)"
        ondragover="handleMonthCellDragOver(event)"
        ondragleave="handleMonthCellDragLeave(event)"
        ondrop="handleMonthCellDrop(event, '${dateStr}')"
        class="month-day-cell min-h-[115px] p-2 flex flex-col justify-between transition-colors cursor-pointer ${inCurrentMonth ? 'bg-resolve-bg hover:bg-resolve-surface/60' : 'bg-resolve-bg/40 opacity-45'} ${isSelected ? 'ring-1 ring-inset ring-amber-500 bg-amber-950/10' : ''}"
      >
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-1">
              <span class="text-xs font-black ${isToday ? 'px-1.5 py-0.2 rounded bg-amber-500 text-stone-950' : (isSelected ? 'text-amber-400' : 'text-white')}">
                ${String(d.getDate()).padStart(2, '0')}
              </span>
              ${deliveries.length > 0 ? `<span class="px-1 py-0.2 rounded bg-red-950 text-red-400 border border-red-800 text-[8px] font-bold">${deliveries.length} ENT</span>` : ''}
            </div>
            <div class="flex items-center gap-1">
              ${dayStrips.length > 0 ? `<span class="text-[9px] text-amber-400 font-bold">${dayStrips.length} tiras</span>` : ''}
              <button
                onclick="event.stopPropagation(); selectStripboardDate('${dateStr}', true)"
                title="Abrir plan de este día"
                class="px-1 py-0.2 rounded bg-resolve-panel hover:bg-resolve-card border border-resolve-border text-[8px] text-stone-300 hover:text-white cursor-pointer"
              >
                Abrir
              </button>
            </div>
          </div>

          <div class="space-y-1">
            ${deliveriesHtml}
            ${stripsHtml}
            ${extraCount > 0 ? `<div class="text-[9px] text-resolve-dimText font-bold pl-1">+${extraCount} más...</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// GESTIÓN DE TAREAS LIBRES (MODAL DE EDICIÓN RÁPIDA)
// ============================================================================

export function addCustomTaskStripPrompt() {
  openCustomTaskModal(-1, state.currentStripboardDate);
}

export function openCustomTaskModal(index, dateStr) {
  if (typeof document === 'undefined') return;

  activeCustomTaskIndex = (index !== undefined && index !== null) ? parseInt(index, 10) : -1;
  activeCustomTaskDate = dateStr || state.currentStripboardDate;

  const modal = document.getElementById('custom-task-modal');
  const modalTitle = document.getElementById('custom-task-modal-title');
  const titleInput = document.getElementById('custom-task-title-input');
  const assigneeInput = document.getElementById('custom-task-assignee-input');
  const timeSlotInput = document.getElementById('custom-task-timeslot-input');
  const statusInput = document.getElementById('custom-task-status-input');
  const clientInput = document.getElementById('custom-task-client-input');
  const deleteBtn = document.getElementById('custom-task-delete-btn');
  const quickContainer = document.getElementById('custom-task-quick-responsibles');

  if (!modal) return;

  updateDeptOptionsDatalist();

  if (quickContainer) {
    const respList = getResponsibles();
    quickContainer.innerHTML = respList.slice(0, 8).map(r => `
      <button 
        type="button" 
        onclick="setCustomTaskAssignee('${escapeHtml(r)}')" 
        class="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-zinc-300 hover:text-white border border-resolve-border text-[10px] transition-colors cursor-pointer"
      >
        ${escapeHtml(r)}
      </button>
    `).join('') + `
      <button 
        type="button" 
        onclick="promptNewResponsible()" 
        class="px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-semibold transition-colors cursor-pointer"
        title="Crear un nuevo responsable"
      >
        + Nuevo
      </button>
    `;
  }

  if (activeCustomTaskIndex >= 0) {
    const strips = getDayStrips(activeCustomTaskDate);
    const strip = strips[activeCustomTaskIndex];
    if (strip) {
      if (modalTitle) modalTitle.innerText = `Editar Tarea Libre (#${activeCustomTaskIndex + 1})`;
      if (titleInput) titleInput.value = strip.task || '';
      if (assigneeInput) assigneeInput.value = strip.assignee || 'Andrés J.';
      if (timeSlotInput) timeSlotInput.value = strip.timeSlot || '08:30 - 09:30';
      if (statusInput) statusInput.value = strip.shiftStatus || 'Por Iniciar';
      if (clientInput) clientInput.value = strip.client || 'Interno';
      if (deleteBtn) deleteBtn.classList.remove('hidden');
    }
  } else {
    if (modalTitle) modalTitle.innerText = 'Nueva Tarea Libre';
    if (titleInput) titleInput.value = '';
    if (assigneeInput) assigneeInput.value = 'Andrés J.';
    if (timeSlotInput) timeSlotInput.value = '08:30 - 09:30';
    if (statusInput) statusInput.value = 'Por Iniciar';
    if (clientInput) clientInput.value = 'Interno';
    if (deleteBtn) deleteBtn.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  setTimeout(() => { if (titleInput) titleInput.focus(); }, 50);
}

export function closeCustomTaskModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('custom-task-modal');
  if (modal) modal.classList.add('hidden');
  activeCustomTaskIndex = -1;
}

export function setCustomTaskAssignee(name) {
  if (typeof document === 'undefined') return;
  const assigneeInput = document.getElementById('custom-task-assignee-input');
  if (assigneeInput) {
    assigneeInput.value = name;
    assigneeInput.focus();
  }
}

export function promptNewResponsible() {
  const name = typeof window !== 'undefined' ? window.prompt("Nombre propio del nuevo responsable:") : null;
  if (!name || !name.trim()) return;
  const clean = addResponsible(name.trim());
  setCustomTaskAssignee(clean);
}

export function saveCustomTaskModal(e) {
  if (e) e.preventDefault();
  if (typeof document === 'undefined') return;

  const titleInput = document.getElementById('custom-task-title-input');
  const assigneeInput = document.getElementById('custom-task-assignee-input');
  const timeSlotInput = document.getElementById('custom-task-timeslot-input');
  const statusInput = document.getElementById('custom-task-status-input');
  const clientInput = document.getElementById('custom-task-client-input');

  const title = (titleInput ? titleInput.value : '').trim();
  const rawAssignee = (assigneeInput ? assigneeInput.value : '').trim() || 'Andrés J.';
  const timeSlot = (timeSlotInput ? timeSlotInput.value : '').trim() || '08:30 - 09:30';
  const shiftStatus = (statusInput ? statusInput.value : 'Por Iniciar');
  const client = (clientInput ? clientInput.value : 'Interno').trim() || 'Interno';

  if (!title) {
    if (typeof window !== 'undefined') window.alert("Por favor ingresa la descripción de la tarea.");
    return;
  }

  const assignee = addResponsible(rawAssignee) || rawAssignee;
  const dateToSave = activeCustomTaskDate || state.currentStripboardDate;
  const strips = getDayStrips(dateToSave);

  if (activeCustomTaskIndex >= 0 && strips[activeCustomTaskIndex]) {
    const strip = strips[activeCustomTaskIndex];
    strip.task = title;
    strip.assignee = assignee;
    strip.timeSlot = timeSlot;
    strip.shiftStatus = shiftStatus;
    strip.client = client;
  } else {
    strips.push({
      id: 'strip-cust-' + Date.now(),
      type: 'ot',
      otId: null,
      client: client,
      brand: "Tráfico General",
      product: "",
      timeSlot: timeSlot,
      task: title,
      assignee: assignee,
      shiftStatus: shiftStatus
    });
  }

  saveDayStrips(dateToSave, strips);
  closeCustomTaskModal();
}

export function deleteCustomTaskFromModal() {
  if (activeCustomTaskIndex < 0) return;
  if (typeof window !== 'undefined' && !window.confirm("¿Eliminar esta tarea libre del plan de trabajo?")) return;
  removeStrip(activeCustomTaskIndex, activeCustomTaskDate || state.currentStripboardDate);
  closeCustomTaskModal();
}

export function removeStripFromModalWitness(dateStr, stripIdx) {
  if (typeof window !== 'undefined' && !window.confirm("¿Quitar este turno del Stripboard en esa fecha?")) return;
  removeStrip(stripIdx, dateStr);
  emit('stripboard:witness-change', { dateStr, stripIdx });
}

// ============================================================================
// ESCUCHA DE EVENTOS REACTIVOS
// ============================================================================
on('views:refresh', () => {
  if (state.currentMainView === 'stripboard') {
    renderStripboard();
  }
});

on('stripboard:updated', () => {
  renderStripboard();
});

on('data:changed', () => {
  if (state.currentMainView === 'stripboard') {
    renderStripboard();
  }
});

on('data:ready', () => {
  renderStripboard();
});

on('data:sync', () => {
  if (state.currentMainView === 'stripboard') {
    renderStripboard();
  }
});

// ============================================================================
// EXPOSICIÓN GLOBAL EN WINDOW PARA MANEJADORES DE PLANTILLA
// ============================================================================
if (typeof window !== 'undefined') {
  window.initStripboard = initStripboard;
  window.setStripboardViewMode = setStripboardViewMode;
  window.selectStripboardDate = selectStripboardDate;
  window.handleStripboardDateChange = handleStripboardDateChange;
  window.setStripboardToToday = setStripboardToToday;
  window.changeStripboardDay = changeStripboardDay;
  window.renderStripboard = renderStripboard;
  window.renderStripboardPendingPool = renderStripboardPendingPool;
  window.setStripboardPoolFilter = setStripboardPoolFilter;
  window.getOtScheduledDays = getOtScheduledDays;
  window.formatShortDayDateLabel = formatShortDayDateLabel;
  window.addOtToStripboard = addOtToStripboard;
  window.addBreakStripPrompt = addBreakStripPrompt;
  window.moveStrip = moveStrip;
  window.removeStrip = removeStrip;
  window.updateStripField = updateStripField;
  window.cycleStripStatusOnDate = cycleStripStatusOnDate;
  window.autoPopulatePendingOts = autoPopulatePendingOts;
  window.clearTodayStripboard = clearTodayStripboard;
  window.printStripboard = printStripboard;
  window.handleStripCardClick = handleStripCardClick;
  window.handleStripDragStart = handleStripDragStart;
  window.handlePoolOtDragStart = handlePoolOtDragStart;
  window.handlePoolOtDragEnd = handlePoolOtDragEnd;
  window.handleStripDragOver = handleStripDragOver;
  window.handleStripDragLeave = handleStripDragLeave;
  window.handleStripDrop = handleStripDrop;
  window.handleStripDragEnd = handleStripDragEnd;
  window.handleContainerDragOver = handleContainerDragOver;
  window.handleContainerDragLeave = handleContainerDragLeave;
  window.handleContainerDrop = handleContainerDrop;
  window.getWeekMondayToSaturday = getWeekMondayToSaturday;
  window.handleWeekColDragOver = handleWeekColDragOver;
  window.handleWeekColDragLeave = handleWeekColDragLeave;
  window.handleWeekColDrop = handleWeekColDrop;
  window.renderStripboardWeekView = renderStripboardWeekView;
  window.parseTimeSlotToMinutes = parseTimeSlotToMinutes;
  window.minutesToHHMM = minutesToHHMM;
  window.shiftStripTimeSlot = shiftStripTimeSlot;
  window.startGanttClipTrim = startGanttClipTrim;
  window.classifyDepartmentTrack = classifyDepartmentTrack;
  window.handleGanttTrackDragOver = handleGanttTrackDragOver;
  window.handleGanttTrackDragLeave = handleGanttTrackDragLeave;
  window.handleGanttTrackDrop = handleGanttTrackDrop;
  window.renderStripboardGanttView = renderStripboardGanttView;
  window.extractCommitmentsByDate = extractCommitmentsByDate;
  window.handleMonthCellDragOver = handleMonthCellDragOver;
  window.handleMonthCellDragLeave = handleMonthCellDragLeave;
  window.handleMonthCellDrop = handleMonthCellDrop;
  window.renderStripboardMonthView = renderStripboardMonthView;
  window.addCustomTaskStripPrompt = addCustomTaskStripPrompt;
  window.openCustomTaskModal = openCustomTaskModal;
  window.closeCustomTaskModal = closeCustomTaskModal;
  window.setCustomTaskAssignee = setCustomTaskAssignee;
  window.promptNewResponsible = promptNewResponsible;
  window.saveCustomTaskModal = saveCustomTaskModal;
  window.deleteCustomTaskFromModal = deleteCustomTaskFromModal;
  window.removeStripFromModalWitness = removeStripFromModalWitness;
  window.updateDeptOptionsDatalist = updateDeptOptionsDatalist;
}

