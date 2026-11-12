/**
 * TRAFIKEITOR // CONTROLADOR DE MODALES Y VISORES
 * Módulo 5: Gestión unificada de los 8 modales de la aplicación, visualizador multimedia fullscreen,
 * motor de previsualización inline, hoja de ruta, sellos retro y respaldos JSON.
 */

import {
  state,
  emit,
  on,
  SUITE_DEFS,
  CODE_EXTS,
  STORAGE_KEY,
  CLIENTS_STORAGE_KEY,
  STATUSES_STORAGE_KEY,
  RESPONSIBLES_STORAGE_KEY,
  STRIPBOARD_STORAGE_KEY
} from './core-state.js';

import {
  getOrders,
  saveOrders,
  getOrderById,
  getClients,
  saveClients,
  addClient,
  deleteClient as bridgeDeleteClient,
  addBrand,
  deleteBrand as bridgeDeleteBrand,
  getStatuses,
  saveStatuses,
  getStatusBadgeClass,
  getStatusOptionsHtml,
  getResponsibles,
  addResponsible,
  getResponsibleOptionsHtml,
  getDepartments,
  addDepartment,
  getDepartmentOptionsHtml,
  getAllStripboardStorage,
  getDayStrips,
  saveDayStrips,
  getNowFormatted,
  toIsoDateTime,
  fromIsoToDisplay,
  escapeHtml,
  uploadOtFiles
} from './data-bridge.js';

import {
  renderTrafficDesk,
  renderBinTree,
  renderStatusSelects,
  renderResponsibleSelects,
  syncSortAndGroupControls,
  refreshAllViews,
  CLIENT_COLOR_PALETTE,
  getClientColorClasses
} from './traffic-desk-view.js';

import {
  renderStripboard,
  renderStripboardPendingPool,
  getOtScheduledDays,
  selectStripboardDate,
  insertOtStripOnDate,
  removeStrip,
  openCustomTaskModal,
  closeCustomTaskModal,
  setCustomTaskAssignee,
  promptNewResponsible,
  saveCustomTaskModal,
  deleteCustomTaskFromModal,
  updateDeptOptionsDatalist
} from './stripboard-engine-view.js';

// Re-exportar funciones de tarea libre para unificar la API de modales
export {
  openCustomTaskModal,
  closeCustomTaskModal,
  setCustomTaskAssignee,
  promptNewResponsible,
  saveCustomTaskModal,
  deleteCustomTaskFromModal
};

let stampingRowIndex = null;
let mediaPoolViewMode = 'grid'; // 'grid' | 'list'

// ============================================================================
// 1. MODAL SOBRE OT (ENVELOPE-MODAL)
// ============================================================================

export function openEnvelopeModal(otId) {
  state.activeOtId = otId;
  const orders = getOrders();
  const ot = orders.find(o => o.id === otId);
  if (!ot) return;

  if (typeof document === 'undefined') return;

  if (document.getElementById('modal-ot-id-display')) {
    document.getElementById('modal-ot-id-display').value = ot.id;
  }
  if (document.getElementById('modal-ot-id')) {
    document.getElementById('modal-ot-id').innerText = ot.id;
  }
  if (document.getElementById('modal-ot-title-header')) {
    document.getElementById('modal-ot-title-header').innerText = ot.title || ot.description || '';
  }
  if (document.getElementById('modal-ot-client')) {
    document.getElementById('modal-ot-client').value = ot.client || '';
  }
  if (document.getElementById('modal-ot-brand')) {
    document.getElementById('modal-ot-brand').value = ot.brand || ot.product || '';
  }
  if (document.getElementById('modal-ot-product')) {
    document.getElementById('modal-ot-product').value = ot.product || '';
  }
  if (document.getElementById('modal-ot-media')) {
    document.getElementById('modal-ot-media').value = ot.media || '';
  }
  if (document.getElementById('modal-ot-ref')) {
    document.getElementById('modal-ot-ref').value = ot.ref || '';
  }
  if (document.getElementById('modal-ot-description')) {
    document.getElementById('modal-ot-description').value = ot.title || ot.description || '';
  }

  renderStatusSelects();
  renderResponsibleSelects();

  if (document.getElementById('modal-ot-status')) {
    document.getElementById('modal-ot-status').value = ot.status || 'Tráfico';
  }
  if (document.getElementById('modal-ot-responsible')) {
    document.getElementById('modal-ot-responsible').value = ot.responsible || 'Andrés J.';
  }

  const briefEl = document.getElementById('modal-ot-brief');
  if (briefEl) briefEl.value = ot.brief || '';

  const legalEl = document.getElementById('modal-ot-legal');
  if (legalEl) legalEl.value = ot.legalText || '';

  const urgentEl = document.getElementById('modal-ot-urgent');
  if (urgentEl) urgentEl.checked = !!ot.urgent;

  // Botón "← Volver al Stripboard" si se abrió desde Stripboard
  const backBtn = document.getElementById('modal-btn-back-stripboard');
  if (backBtn) {
    if (state.currentMainView === 'stripboard') {
      backBtn.classList.remove('hidden');
    } else {
      backBtn.classList.add('hidden');
    }
  }

  // Selector de fecha para agendar desde el Sobre
  const schedInput = document.getElementById('modal-schedule-date-input');
  if (schedInput) {
    schedInput.value = state.currentStripboardDate || new Date().toISOString().split('T')[0];
  }

  // Renderizar testigo de días asignados en el Stripboard
  renderModalStripboardWitness(ot.id);

  // Contador del badge de archivos
  const tabBadge = document.getElementById('tab-badge-files');
  if (tabBadge) {
    tabBadge.innerText = (ot.mediaFiles ? ot.mediaFiles.length : 0);
  }

  renderRouteSheetRows(ot.routes || []);
  renderMediaPool(ot.mediaFiles || []);
  renderInlineEnvelopeMedia(ot.mediaFiles || []);

  switchOtTab('hoja-ruta');
  const modal = document.getElementById('envelope-modal');
  if (modal) modal.classList.remove('hidden');
}

export function closeEnvelopeModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('envelope-modal');
  if (modal) modal.classList.add('hidden');
  state.activeOtId = null;

  renderTrafficDesk();
  if (state.currentMainView === 'stripboard') {
    renderStripboard();
  } else {
    renderStripboardPendingPool();
  }
}

export function switchOtTab(tab) {
  state.activeOtTab = tab;
  if (typeof document === 'undefined') return;

  const tabs = ['hoja-ruta', 'media-pool', 'brief'];
  tabs.forEach(t => {
    const el = document.getElementById(`ot-tab-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (el) {
      if (t === tab) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
    if (btn) {
      if (t === tab) {
        btn.classList.add('bg-resolve-panel', 'text-white', 'font-bold');
        btn.classList.remove('text-resolve-dimText');
      } else {
        btn.classList.remove('bg-resolve-panel', 'text-white', 'font-bold');
        btn.classList.add('text-resolve-dimText');
      }
    }
  });
}

export function updateActiveOtField(field, value) {
  if (!state.activeOtId) return;
  const orders = getOrders();
  const ot = orders.find(o => o.id === state.activeOtId);
  if (!ot) return;

  ot[field] = value;
  if (field === 'title') ot.description = value;
  if (field === 'description') ot.title = value;
  if (field === 'brand' && !ot.product) ot.product = value;

  saveOrders(orders);
  refreshAllViews();
}

export function deleteActiveOt() {
  if (!state.activeOtId) return;
  if (typeof window !== 'undefined' && !window.confirm("¿Deseas eliminar permanentemente esta Orden de Trabajo de la mesa?")) return;

  let orders = getOrders();
  orders = orders.filter(o => o.id !== state.activeOtId);
  saveOrders(orders);
  closeEnvelopeModal();
}

// ============================================================================
// TESTIGO DE DÍAS Y AGENDAMIENTO DESDE EL SOBRE OT
// ============================================================================

export function renderModalStripboardWitness(otId) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('modal-ot-stripboard-days');
  if (!container) return;

  const scheduledDays = getOtScheduledDays(otId);
  if (scheduledDays.length === 0) {
    container.innerHTML = `<span class="text-stone-500 italic text-[11px]">Esta OT aún no tiene turnos asignados en el Stripboard.</span>`;
    return;
  }

  container.innerHTML = scheduledDays.map(d => {
    return d.matched.map(m => {
      let pillColor = 'bg-white/[0.04] text-zinc-300 border-white/[0.08] hover:border-amber-400/50';
      if (m.strip.shiftStatus === 'En Mesa') pillColor = 'bg-amber-500/10 text-amber-300 border-amber-500/25';
      else if (m.strip.shiftStatus === 'Entregado') pillColor = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25';
      else if (m.strip.shiftStatus === 'Detenido') pillColor = 'bg-rose-500/10 text-rose-300 border-rose-500/25';

      return `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-medium ${pillColor}">
          <button
            type="button"
            onclick="jumpFromModalToStripboardDate('${d.dateStr}')"
            title="Cerrar sobre e ir al Stripboard del ${d.shortLabel}"
            class="font-semibold hover:underline cursor-pointer"
          >
            ${d.shortLabel} • <span class="font-mono">${escapeHtml(m.strip.timeSlot || '')}</span> (${escapeHtml(m.strip.assignee || 'Creativos')} • ${escapeHtml(m.strip.shiftStatus || 'Por Iniciar')})
          </button>
          <button
            type="button"
            onclick="removeStripFromModalWitness('${d.dateStr}', ${m.idx})"
            title="Quitar este turno del ${d.shortLabel}"
            class="text-stone-400 hover:text-red-400 font-bold cursor-pointer"
          >
            ✕
          </button>
        </span>
      `;
    }).join('');
  }).join('');
}

export function jumpFromModalToStripboardDate(dateStr) {
  closeEnvelopeModal();
  emit('view:switch', { view: 'stripboard' });
  if (typeof window !== 'undefined' && typeof window.switchMainView === 'function') {
    window.switchMainView('stripboard');
  }
  selectStripboardDate(dateStr, false);
}

export function removeStripFromModalWitness(dateStr, stripIdx) {
  removeStrip(stripIdx, dateStr);
  if (state.activeOtId) {
    renderModalStripboardWitness(state.activeOtId);
  }
}

export function scheduleActiveOtFromModal() {
  if (!state.activeOtId) return;
  const schedInput = document.getElementById('modal-schedule-date-input');
  const targetDate = (schedInput && schedInput.value) ? schedInput.value : state.currentStripboardDate;
  const destStrips = getDayStrips(targetDate);
  insertOtStripOnDate(state.activeOtId, targetDate, destStrips.length);
  renderModalStripboardWitness(state.activeOtId);
}

// ============================================================================
// 2. HOJA DE RUTA (7 COLUMNAS) Y SELLOS DE TINTA RETRO
// ============================================================================

export function renderRouteSheetRows(routes) {
  if (typeof document === 'undefined') return;
  const tbody = document.getElementById('route-sheet-rows');
  if (!tbody) return;

  if (!routes || routes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="p-8 text-center text-zinc-400 italic font-medium">
          Sin relevos asentados. Pulsa "+ AGREGAR MOVIMIENTO" para registrar un pase.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = routes.map((row, index) => {
    let stampHtml = '';
    if (row.stamp) {
      let stampColor = 'border-red-500 text-red-400';
      if (row.stamp === 'ENTREGADO') stampColor = 'border-blue-500 text-blue-400';
      else if (row.stamp === 'APROBADO') stampColor = 'border-emerald-500 text-emerald-400';
      else if (row.stamp === 'AJUSTES') stampColor = 'border-amber-500 text-amber-400';

      stampHtml = `
        <span onclick="openStampModal(${index})" class="ink-stamp-box px-2.5 py-0.5 text-[11px] font-bold cursor-pointer inline-block ${stampColor} hover:scale-105 transition-transform">
          [ ${escapeHtml(row.stamp)} ]
        </span>
      `;
    } else {
      stampHtml = `
        <button onclick="openStampModal(${index})" class="text-[10px] text-zinc-400 hover:text-white font-medium underline cursor-pointer">
          + Sello
        </button>
      `;
    }

    const isOdd = (index % 2 === 1);
    const zebraClass = isOdd ? 'bg-white/[0.035]' : 'bg-transparent';

    return `
      <tr class="${zebraClass} hover:bg-white/[0.08] transition-colors ${row.completed ? 'opacity-70 bg-black/20' : ''}">
        <!-- 1. DE: -->
        <td class="p-2 border-r border-resolve-border align-middle">
          <select 
            onchange="handleRouteDeptChange(${index}, 'from', this.value)" 
            class="w-full bg-black/50 border border-resolve-border hover:border-amber-400/50 rounded px-1.5 py-1 text-xs font-semibold text-amber-300 focus:border-amber-500/60 focus:outline-none cursor-pointer"
          >
            ${getDepartmentOptionsHtml(row.from || 'Tráfico')}
          </select>
        </td>

        <!-- 2. PARA: -->
        <td class="p-2 border-r border-resolve-border align-middle">
          <select 
            onchange="handleRouteDeptChange(${index}, 'to', this.value)" 
            class="w-full bg-black/50 border border-resolve-border hover:border-sky-400/50 rounded px-1.5 py-1 text-xs font-semibold text-sky-300 focus:border-sky-500/60 focus:outline-none cursor-pointer"
          >
            ${getDepartmentOptionsHtml(row.to || 'Creativos')}
          </select>
        </td>

        <!-- 3. DESCRIPCIÓN -->
        <td class="p-2 border-r border-resolve-border align-top">
          <textarea 
            rows="2" 
            onchange="updateRouteCell(${index}, 'task', this.value)" 
            placeholder="Instrucción del relevo..." 
            class="w-full bg-transparent border-0 border-b border-transparent hover:border-resolve-border focus:border-amber-500 focus:ring-0 p-1 text-xs text-zinc-100 leading-relaxed resize-y font-sans"
          >${escapeHtml(row.task || '')}</textarea>
        </td>

        <!-- 4. ENTRADA -->
        <td class="p-2 border-r border-resolve-border align-top">
          <div class="flex items-center gap-1">
            <input 
              type="datetime-local" 
              value="${toIsoDateTime(row.entryDate)}" 
              onchange="updateRouteDateCell(${index}, 'entryDate', this.value)" 
              onclick="try { this.showPicker(); } catch(e) {}"
              style="color-scheme: dark;"
              class="w-full bg-black/40 hover:bg-black/60 border border-resolve-border hover:border-amber-400/50 rounded-lg px-2 py-1 text-[11px] text-zinc-200 font-mono focus:border-amber-500/60 focus:outline-none cursor-pointer"
            />
            <button 
              type="button" 
              title="Poner fecha y hora actual" 
              onclick="stampCurrentTime(${index}, 'entryDate')" 
              class="p-1 text-zinc-400 hover:text-white hover:bg-white/[0.08] rounded-md transition-colors shrink-0"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </button>
          </div>
        </td>

        <!-- 5. ENTREGA -->
        <td class="p-2 border-r border-resolve-border align-top">
          <div class="flex items-center gap-1">
            <input 
              type="datetime-local" 
              value="${toIsoDateTime(row.deliveryDate)}" 
              onchange="updateRouteDateCell(${index}, 'deliveryDate', this.value)" 
              onclick="try { this.showPicker(); } catch(e) {}"
              style="color-scheme: dark;"
              class="w-full bg-black/40 hover:bg-black/60 border border-resolve-border hover:border-amber-400/50 rounded-lg px-2 py-1 text-[11px] text-zinc-200 font-mono focus:border-amber-500/60 focus:outline-none cursor-pointer"
            />
            <button 
              type="button" 
              title="Poner fecha y hora actual" 
              onclick="stampCurrentTime(${index}, 'deliveryDate')" 
              class="p-1 text-zinc-400 hover:text-white hover:bg-white/[0.08] rounded-md transition-colors shrink-0"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </button>
          </div>
        </td>

        <!-- 6. FIRMA -->
        <td class="p-2 border-r border-resolve-border align-top">
          <div class="flex flex-col gap-1">
            <select 
              onchange="handleRouteSignChange(${index}, this.value)" 
              class="w-full bg-black/50 border border-resolve-border hover:border-cyan-400/50 rounded px-1.5 py-1 text-[11px] font-semibold text-cyan-300 focus:border-cyan-500/60 focus:outline-none cursor-pointer"
            >
              ${getResponsibleOptionsHtml(row.sign || row.from || 'Andrés J.')}
            </select>
            <div class="text-center pt-0.5">
              ${stampHtml}
            </div>
          </div>
        </td>

        <!-- 7. NOTAS -->
        <td class="p-2 border-r border-resolve-border align-top">
          <textarea 
            rows="2" 
            onchange="updateRouteCell(${index}, 'notes', this.value)" 
            placeholder="Notas o comentarios..." 
            class="w-full bg-transparent border-0 border-b border-transparent hover:border-resolve-border focus:border-amber-500 focus:ring-0 p-1 text-xs text-zinc-300 leading-relaxed resize-y font-sans"
          >${escapeHtml(row.notes || '')}</textarea>
        </td>

        <!-- ACCIONES -->
        <td class="p-2 align-middle text-center">
          <div class="flex items-center justify-center gap-1">
            <button onclick="toggleRouteDone(${index})" title="${row.completed ? 'Marcar pendiente' : 'Completado'}" class="p-1 ${row.completed ? 'text-emerald-400' : 'text-resolve-dimText hover:text-white'}">
              ✓
            </button>
            <button onclick="deleteRouteRow(${index})" title="Eliminar fila" class="p-1 text-resolve-dimText hover:text-red-400">
              ✕
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

export function addNewRouteRow() {
  if (!state.activeOtId) return;
  const orders = getOrders();
  const ot = orders.find(o => o.id === state.activeOtId);
  if (!ot) return;

  if (!ot.routes) ot.routes = [];

  let defaultFrom = "Tráfico";
  let defaultTo = "Creativos";
  if (ot.routes.length > 0) {
    const last = ot.routes[ot.routes.length - 1];
    defaultFrom = last.to || "Tráfico";
    defaultTo = last.from || "Creativos";
  }

  ot.routes.push({
    from: defaultFrom,
    to: defaultTo,
    task: "",
    entryDate: getNowFormatted(),
    deliveryDate: "",
    sign: ot.responsible || "Andrés J.",
    notes: "",
    stamp: null,
    completed: false
  });

  saveOrders(orders);
  renderRouteSheetRows(ot.routes);
  refreshAllViews();
}

export function updateRouteCell(index, field, value) {
  if (!state.activeOtId) return;
  const orders = getOrders();
  const ot = orders.find(o => o.id === state.activeOtId);
  if (!ot || !ot.routes[index]) return;

  ot.routes[index][field] = value;
  saveOrders(orders);
  refreshAllViews();
}

export function updateRouteDateCell(index, field, isoValue) {
  const displayVal = fromIsoToDisplay(isoValue);
  updateRouteCell(index, field, displayVal);
}

export function handleRouteDeptChange(index, field, val) {
  if (!state.activeOtId) return;

  if (val === '__NEW_DEPT__') {
    const newName = typeof window !== 'undefined' ? window.prompt("Nombre del nuevo departamento / área:") : null;
    if (newName && newName.trim()) {
      const clean = addDepartment(newName.trim());
      updateDeptOptionsDatalist();
      updateRouteCell(index, field, clean);
      const ot = getOrders().find(o => o.id === state.activeOtId);
      if (ot) renderRouteSheetRows(ot.routes);
    } else {
      const ot = getOrders().find(o => o.id === state.activeOtId);
      if (ot) renderRouteSheetRows(ot.routes);
    }
    return;
  }

  updateRouteCell(index, field, val);
}

export function handleRouteSignChange(index, val) {
  if (!state.activeOtId) return;

  if (val === '__NEW_RESPONSIBLE__') {
    const newName = typeof window !== 'undefined' ? window.prompt("Nombre propio del responsable que firma / entrega:") : null;
    if (newName && newName.trim()) {
      const clean = addResponsible(newName.trim());
      updateRouteCell(index, 'sign', clean);
      const ot = getOrders().find(o => o.id === state.activeOtId);
      if (ot) renderRouteSheetRows(ot.routes);
    } else {
      const ot = getOrders().find(o => o.id === state.activeOtId);
      if (ot) renderRouteSheetRows(ot.routes);
    }
    return;
  }

  updateRouteCell(index, 'sign', val);
}

export function stampCurrentTime(index, field) {
  updateRouteCell(index, field, getNowFormatted());
  const ot = getOrders().find(o => o.id === state.activeOtId);
  if (ot) renderRouteSheetRows(ot.routes);
}

export function toggleRouteDone(index) {
  if (!state.activeOtId) return;
  const orders = getOrders();
  const ot = orders.find(o => o.id === state.activeOtId);
  if (!ot || !ot.routes[index]) return;

  ot.routes[index].completed = !ot.routes[index].completed;
  saveOrders(orders);
  renderRouteSheetRows(ot.routes);
}

export function deleteRouteRow(index) {
  if (!state.activeOtId) return;
  const orders = getOrders();
  const ot = orders.find(o => o.id === state.activeOtId);
  if (!ot || !ot.routes[index]) return;

  ot.routes.splice(index, 1);
  saveOrders(orders);
  renderRouteSheetRows(ot.routes);
}

// Control del Modal de Sellos de Tinta Retro
export function openStampModal(index) {
  stampingRowIndex = index;
  const modal = document.getElementById('stamp-modal');
  if (modal) modal.classList.remove('hidden');
}

export function closeStampModal() {
  const modal = document.getElementById('stamp-modal');
  if (modal) modal.classList.add('hidden');
  stampingRowIndex = null;
}

export function applyStamp(stampText) {
  if (stampingRowIndex === null || !state.activeOtId) return;
  const orders = getOrders();
  const ot = orders.find(o => o.id === state.activeOtId);
  if (!ot || !ot.routes[stampingRowIndex]) return;

  ot.routes[stampingRowIndex].stamp = stampText;
  saveOrders(orders);
  renderRouteSheetRows(ot.routes);
  closeStampModal();
}

export function clearCurrentStamp() {
  if (stampingRowIndex === null || !state.activeOtId) return;
  const orders = getOrders();
  const ot = orders.find(o => o.id === state.activeOtId);
  if (!ot || !ot.routes[stampingRowIndex]) return;

  ot.routes[stampingRowIndex].stamp = null;
  saveOrders(orders);
  renderRouteSheetRows(ot.routes);
  closeStampModal();
}

// ============================================================================
// 3. MEDIA POOL Y MOTOR MULTIMEDIA FULLSCREEN
// ============================================================================

export function setMediaPoolView(mode) {
  mediaPoolViewMode = mode;
  if (typeof document === 'undefined') return;

  const btnGrid = document.getElementById('btn-view-grid');
  const btnList = document.getElementById('btn-view-list');

  if (mode === 'grid') {
    if (btnGrid) {
      btnGrid.classList.add('bg-resolve-panel', 'text-white');
      btnGrid.classList.remove('text-resolve-dimText');
    }
    if (btnList) {
      btnList.classList.remove('bg-resolve-panel', 'text-white');
      btnList.classList.add('text-resolve-dimText');
    }
  } else {
    if (btnList) {
      btnList.classList.add('bg-resolve-panel', 'text-white');
      btnList.classList.remove('text-resolve-dimText');
    }
    if (btnGrid) {
      btnGrid.classList.remove('bg-resolve-panel', 'text-white');
      btnGrid.classList.add('text-resolve-dimText');
    }
  }

  const ot = getOrders().find(o => o.id === state.activeOtId);
  if (ot) renderMediaPool(ot.mediaFiles || []);
}

export function badgeStyle(color) {
  return 'background-color:' + color + '22;color:' + color + ';border:1px solid ' + color + '66;';
}

export function getFileExt(file) {
  const name = (file && file.name) ? file.name : '';
  if (file && file.ext) return String(file.ext).toLowerCase();
  return name.includes('.') ? name.split('.').pop().toLowerCase() : '';
}

export function getMediaMeta(file) {
  const ext = getFileExt(file);
  const t = (file && file.type) ? String(file.type).toLowerCase() : '';
  const mk = (type, badge, sub, color, extra) => Object.assign({
    type, ext, badge, subLabel: sub, color,
    badgeStyle: badgeStyle(color), isSuite: false, fullLabel: sub
  }, extra || {});

  if (ext === 'svg') return mk('image', 'SVG', 'Imagen vectorial', '#d97706');
  if (['jpg','jpeg','png','gif','webp','bmp','ico','avif'].includes(ext) || t === 'image') return mk('image', (ext || 'IMG').toUpperCase(), 'Imagen', '#d97706');
  if (['mp4','webm','mov','ogg','m4v','avi','mkv'].includes(ext) || t === 'video') return mk('video', (ext || 'VID').toUpperCase(), 'Video', '#a855f7');
  if (ext === 'pdf' || t === 'pdf') return mk('pdf', 'PDF', 'Documento PDF', '#ef4444');
  if (['md','markdown'].includes(ext) || t === 'markdown') return mk('markdown', 'MD', 'Markdown', '#38bdf8');
  if (['ttf','otf','woff','woff2'].includes(ext) || t === 'font') return mk('font', (ext || 'FONT').toUpperCase(), 'Tipografía ' + (ext || '').toUpperCase(), '#8b5cf6');
  if (CODE_EXTS.includes(ext) || t === 'code') return mk('code', (ext || 'CODE').toUpperCase(), 'Código ' + (ext || '').toUpperCase(), '#10b981');
  const s = SUITE_DEFS[ext];
  if (s) return mk(s.type, s.badge, s.sub, s.color, { isSuite: true, suiteBrand: s.brand });
  return mk(t || 'document', (ext || 'DOC').toUpperCase().substring(0, 5), t === 'link' ? 'Enlace web' : 'Archivo', '#a8a29e');
}

export function formatMarkdown(raw) {
  if (!raw) return '<p class="text-stone-400 italic">Documento vacío.</p>';
  let s = String(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = s.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (m, lang, code) =>
    '<pre class="my-2 p-2.5 bg-black/80 border border-resolve-border rounded font-mono text-[11px] text-emerald-400 overflow-x-auto"><code>' + code.trim() + '</code></pre>');
  s = s.replace(/^### (.*$)/gim, '<h3 class="text-xs font-bold text-amber-400 uppercase mt-3 mb-1">$1</h3>');
  s = s.replace(/^## (.*$)/gim, '<h2 class="text-sm font-bold text-white mt-4 mb-2 border-b border-resolve-border pb-1">$1</h2>');
  s = s.replace(/^# (.*$)/gim, '<h1 class="text-base font-bold text-amber-400 mt-4 mb-2 border-b border-amber-500/40 pb-1">$1</h1>');
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
  s = s.replace(/\*(.*?)\*/g, '<em class="text-amber-200/90">$1</em>');
  s = s.replace(/`([^`]+)`/g, '<code class="bg-resolve-card text-amber-300 px-1 rounded text-[10px] font-mono">$1</code>');
  s = s.replace(/^&gt; (.*$)/gim, '<blockquote class="border-l-2 border-amber-500 pl-3 my-2 text-stone-300 italic">$1</blockquote>');
  s = s.replace(/^---$/gim, '<hr class="border-resolve-border my-3">');
  s = s.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="ml-4 list-disc text-stone-300">$1</li>');
  s = s.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="ml-4 list-decimal text-stone-300">$1</li>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-amber-400 hover:underline">$1</a>');
  s = s.replace(/\n{2,}/g, '</p><p class="my-2 text-stone-300 text-xs leading-relaxed">');
  return '<p class="my-2 text-stone-300 text-xs leading-relaxed">' + s + '</p>';
}

export function fontSafeId(file) {
  return 'font-' + String((file && file.id) || 'f').replace(/[^a-zA-Z0-9_-]/g, '');
}

export function ensureFontLoaded(file) {
  if (typeof document === 'undefined') return;
  if (!file || !file.url) return;
  const id = fontSafeId(file);
  if (document.getElementById(id)) return;
  const st = document.createElement('style');
  st.id = id;
  st.textContent = '@font-face{font-family:"' + id + '";src:url("' + file.url + '");font-display:swap;}' +
                   '.specimen-' + id + '{font-family:"' + id + '",sans-serif !important;}';
  document.head.appendChild(st);
}

export function copyMediaCodeText(text, btn) {
  if (!text) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      if (!btn) return;
      const orig = btn.innerHTML;
      btn.innerHTML = '<span class="text-emerald-400 font-bold">Copiado</span>';
      setTimeout(() => { btn.innerHTML = orig; }, 1500);
    }).catch(() => {});
  }
}

export function renderMediaPool(files) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('media-pool-container');
  const badge = document.getElementById('tab-badge-files');
  if (badge) badge.innerText = files ? files.length : 0;
  if (!container) return;

  if (!files || files.length === 0) {
    container.innerHTML = '<div class="p-8 text-center border border-resolve-border rounded-xl bg-white/[0.02] text-xs text-resolve-dimText font-medium">El Media Pool de esta OT está vacío. Arrastra archivos arriba para cargarlos.</div>';
    return;
  }

  if (mediaPoolViewMode === 'grid') {
    container.innerHTML = '<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">' + files.map((file, idx) => {
      const meta = getMediaMeta(file);
      const thumb = (meta.type === 'image' && file.url && file.url !== '#')
        ? `<img src="${file.url}" alt="${escapeHtml(file.name)}" class="w-full h-full object-cover">`
        : `<div class="flex flex-col items-center text-center p-2"><span class="px-2 py-0.5 rounded-lg font-semibold text-xs" style="${meta.badgeStyle}">${meta.badge}</span><span class="text-[9px] text-resolve-dimText mt-1.5 uppercase font-semibold">${escapeHtml(meta.subLabel)}</span></div>`;
      return `
        <div class="bg-white/[0.03] hover:bg-white/[0.06] border border-resolve-border hover:border-amber-400/50 rounded-xl p-2.5 flex flex-col justify-between group transition-all">
          <div class="h-24 bg-black/40 rounded-lg border border-resolve-border/60 flex items-center justify-center overflow-hidden mb-2 relative">
            ${thumb}
            <button onclick="removeMediaItem(${idx})" title="Eliminar del Media Pool" class="absolute top-1 right-1 p-1 bg-black/70 hover:bg-rose-900 text-white rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
          </div>
          <div class="text-[11px]">
            <div class="font-semibold text-white truncate" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
            <div class="text-resolve-dimText text-[10px] flex justify-between mt-1"><span>${file.size || 'Web'}</span><span>${file.date ? file.date.split(' ')[0] : ''}</span></div>
            ${file.url && file.url !== '#' ? `<a href="${file.url}" target="_blank" download="${escapeHtml(file.name)}" class="mt-2 block text-center py-1 bg-white/[0.05] hover:bg-white/[0.10] text-amber-300 font-semibold text-[10px] rounded-lg border border-resolve-border transition-all">Descargar</a>` : ''}
          </div>
        </div>`;
    }).join('') + '</div>';
  } else {
    container.innerHTML = `
      <div class="border border-resolve-border rounded-xl overflow-hidden bg-resolve-surface">
        <table class="w-full text-left text-xs border-collapse">
          <thead><tr class="bg-resolve-panel/90 border-b border-resolve-border text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
            <th class="p-2">NOMBRE DEL ARCHIVO</th><th class="p-2 w-32">TIPO</th><th class="p-2 w-24">TAMAÑO</th><th class="p-2 w-36">FECHA SUBIDA</th><th class="p-2 w-28 text-center">ACCIONES</th>
          </tr></thead>
          <tbody class="divide-y divide-resolve-border bg-resolve-bg text-stone-200">
            ${files.map((file, idx) => {
              const meta = getMediaMeta(file);
              const isOdd = (idx % 2 === 1);
              const zebraClass = isOdd ? 'bg-white/[0.035]' : 'bg-transparent';
              return `<tr class="${zebraClass} hover:bg-white/[0.08] transition-colors">
                <td class="p-2 font-bold text-white flex items-center gap-2"><span class="px-1.5 py-0.5 rounded text-[10px] font-bold" style="${meta.badgeStyle}">${meta.badge}</span><span class="truncate">${escapeHtml(file.name)}</span></td>
                <td class="p-2 text-resolve-dimText uppercase text-[10px]">${escapeHtml(meta.subLabel)}</td>
                <td class="p-2 text-resolve-dimText">${file.size || 'N/A'}</td>
                <td class="p-2 text-resolve-dimText">${file.date || '--'}</td>
                <td class="p-2 text-center"><div class="flex items-center justify-center gap-2">
                  ${file.url && file.url !== '#' ? `<a href="${file.url}" target="_blank" download="${escapeHtml(file.name)}" class="text-resolve-accent hover:underline text-[11px]">Abrir</a>` : ''}
                  <button onclick="removeMediaItem(${idx})" class="text-resolve-dimText hover:text-red-400">✕</button>
                </div></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }
}

export async function handleMediaPoolUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0 || !state.activeOtId) return;

  const orders = getOrders();
  const ot = orders.find(o => o.id === state.activeOtId);
  if (!ot) return;
  if (!ot.mediaFiles) ot.mediaFiles = [];

  const list = Array.from(files);
  let pending = list.length;

  const finalize = () => {
    pending--;
    if (pending > 0) return;
    try { saveOrders(orders); } catch (err) { console.warn('Almacenamiento lleno, piezas grandes no persistirán:', err); }
    renderMediaPool(ot.mediaFiles);
    state.selectedMediaIndex = Math.max(0, ot.mediaFiles.length - 1);
    renderInlineEnvelopeMedia(ot.mediaFiles);
  };

  list.forEach(file => {
    const meta = getMediaMeta({ name: file.name, type: file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : '') });
    const entry = {
      id: 'm-' + Date.now() + Math.random().toString(36).substring(2, 8),
      name: file.name,
      type: meta.type,
      ext: meta.ext,
      size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
      date: getNowFormatted(),
      url: ''
    };
    const push = () => { ot.mediaFiles.push(entry); finalize(); };
    const readAs = (mode, cb) => {
      const r = new FileReader();
      r.onload = ev => cb(ev.target.result);
      r.onerror = () => { entry.url = URL.createObjectURL(file); push(); };
      if (mode === 'text') r.readAsText(file); else r.readAsDataURL(file);
    };

    if (meta.type === 'image' && file.size < 3 * 1024 * 1024) {
      readAs('data', u => { entry.url = u; push(); });
    } else if (meta.type === 'font' && file.size < 3 * 1024 * 1024) {
      readAs('data', u => { entry.url = u; push(); });
    } else if (meta.type === 'pdf' && file.size < 3 * 1024 * 1024) {
      readAs('data', u => { entry.url = u; push(); });
    } else if ((meta.type === 'code' || meta.type === 'markdown') && file.size < 1024 * 1024) {
      readAs('text', txt => { entry.content = txt; entry.url = URL.createObjectURL(file); push(); });
    } else {
      entry.url = URL.createObjectURL(file);
      push();
    }
  });

  if (e.target && 'value' in e.target) e.target.value = '';
}

export function promptAddMediaLink() {
  if (!state.activeOtId) return;
  const title = typeof window !== 'undefined' ? window.prompt('Nombre o descripción del recurso (ej: Comercial TV MP4 / Figma / Drive):') : null;
  if (!title || !title.trim()) return;
  const url = typeof window !== 'undefined' ? window.prompt('Enlace URL directo:') : null;
  if (!url || !url.trim()) return;

  const orders = getOrders();
  const ot = orders.find(o => o.id === state.activeOtId);
  if (!ot) return;

  const u = url.trim().toLowerCase();
  let type = 'link', ext = '';
  if (u.match(/\.(jpg|jpeg|png|gif|webp|svg)($|\?)/)) { type = 'image'; ext = 'jpg'; }
  else if (u.match(/\.(mp4|webm|mov|ogg)($|\?)/) || u.includes('youtube.com') || u.includes('youtu.be') || u.includes('vimeo.com')) { type = 'video'; ext = 'mp4'; }
  else if (u.match(/\.pdf($|\?)/)) { type = 'pdf'; ext = 'pdf'; }

  if (!ot.mediaFiles) ot.mediaFiles = [];
  ot.mediaFiles.push({ id: 'm-' + Date.now(), name: title.trim(), type, ext, size: 'Enlace', date: getNowFormatted(), url: url.trim() });
  saveOrders(orders);
  renderMediaPool(ot.mediaFiles);
  state.selectedMediaIndex = ot.mediaFiles.length - 1;
  renderInlineEnvelopeMedia(ot.mediaFiles);
}

export function removeMediaItem(index) {
  if (!state.activeOtId) return;
  const orders = getOrders();
  const ot = orders.find(o => o.id === state.activeOtId);
  if (!ot || !ot.mediaFiles) return;
  ot.mediaFiles.splice(index, 1);
  saveOrders(orders);
  renderMediaPool(ot.mediaFiles);
  if (state.selectedMediaIndex >= ot.mediaFiles.length) state.selectedMediaIndex = Math.max(0, ot.mediaFiles.length - 1);
  renderInlineEnvelopeMedia(ot.mediaFiles);
}

export function renderInlineEnvelopeMedia(files) {
  if (typeof document === 'undefined') return;
  const listContainer = document.getElementById('envelope-inline-files-list');
  const countEl = document.getElementById('inline-envelope-files-count');
  if (!listContainer) return;
  if (countEl) countEl.innerText = `${files ? files.length : 0} pieza${(files && files.length === 1) ? '' : 's'}`;

  if (!files || files.length === 0) {
    listContainer.innerHTML = `
      <div class="p-6 text-center text-resolve-dimText text-xs border border-dashed border-resolve-border rounded-xl font-medium">
        <span class="font-semibold text-zinc-300">Sobre sin archivos adjuntos</span>
        <p class="text-[10px] text-zinc-500 mt-1">Arrastra archivos a la zona superior para importarlos.</p>
      </div>`;
    renderInlineViewer();
    return;
  }
  if (state.selectedMediaIndex >= files.length) state.selectedMediaIndex = Math.max(0, files.length - 1);

  listContainer.innerHTML = files.map((file, idx) => {
    const sel = idx === state.selectedMediaIndex;
    const meta = getMediaMeta(file);
    const icon = (meta.type === 'image' && file.url && file.url !== '#')
      ? `<img src="${file.url}" class="w-8 h-8 rounded object-cover border border-resolve-border shrink-0">`
      : `<div class="w-8 h-8 rounded flex items-center justify-center text-[9px] font-bold shrink-0" style="${meta.badgeStyle}">${meta.badge}</div>`;
    return `
      <div onclick="selectInlinePreviewMedia(${idx})" class="p-2 rounded border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${sel ? 'bg-resolve-card border-amber-500 text-white' : 'bg-resolve-panel border-resolve-border hover:bg-resolve-card/70 text-stone-300'}">
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          ${icon}
          <div class="min-w-0 flex-1">
            <div class="font-bold text-[11px] truncate ${sel ? 'text-amber-400' : 'text-white'}" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
            <div class="text-[10px] text-resolve-dimText flex items-center gap-2 mt-0.5"><span class="uppercase font-bold">${escapeHtml(meta.subLabel)}</span><span>•</span><span>${file.size || 'Web'}</span></div>
          </div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button type="button" onclick="event.stopPropagation(); openMediaPreviewModal(${idx})" title="Ampliar" class="p-1 hover:bg-resolve-surface rounded text-resolve-dimText hover:text-white">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
          </button>
          <button type="button" onclick="event.stopPropagation(); removeMediaItem(${idx})" title="Quitar del sobre" class="p-1 hover:text-red-400 text-resolve-dimText">✕</button>
        </div>
      </div>`;
  }).join('');
  renderInlineViewer();
}

export function selectInlinePreviewMedia(index) {
  state.selectedMediaIndex = index;
  const ot = getOrders().find(o => o.id === state.activeOtId);
  if (ot && ot.mediaFiles) renderInlineEnvelopeMedia(ot.mediaFiles);
}

export function setInlineCodeTab(mode) {
  state.inlineCodeViewMode = mode;
  renderInlineViewer();
  const previewModal = document.getElementById('media-preview-modal');
  if (previewModal && !previewModal.classList.contains('hidden')) {
    renderMediaPreviewModalBody();
  }
}

export function setInlineMarkdownTab(mode) {
  state.inlineMarkdownViewMode = mode;
  renderInlineViewer();
  const previewModal = document.getElementById('media-preview-modal');
  if (previewModal && !previewModal.classList.contains('hidden')) {
    renderMediaPreviewModalBody();
  }
}

export function setInlineFontSize(size) {
  state.inlineFontSize = parseInt(size, 10) || 26;
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-font-sandbox]').forEach(el => { el.style.fontSize = state.inlineFontSize + 'px'; });
  document.querySelectorAll('[data-font-counter]').forEach(el => { el.innerText = state.inlineFontSize + 'px'; });
}

export function setInteractiveFontPreset(text) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-font-sandbox]').forEach(el => { el.innerText = text; });
}

export function buildMediaViewerHtml(file) {
  if (!file) {
    return `<div class="h-full flex flex-col items-center justify-center p-8 text-center text-resolve-dimText">
      <span class="text-xs font-semibold text-zinc-300">Monitor de Previsualización</span>
      <span class="text-[10px] text-zinc-500 mt-1">Selecciona una pieza a la izquierda para previsualizarla</span></div>`;
  }
  const meta = getMediaMeta(file);
  const url = file.url && file.url !== '#' ? file.url : '';
  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
  const isVimeo = url.includes('vimeo.com');
  const tabBtn = (active, fn, label) => `<button type="button" onclick="${fn}" class="px-2 py-0.5 rounded-md text-[10px] ${active ? 'bg-white/[0.12] text-white font-semibold' : 'text-resolve-dimText hover:text-white'}">${label}</button>`;

  // Imagen
  if (meta.type === 'image' && url) {
    return `<div class="w-full h-full flex items-center justify-center bg-black/60 p-3 overflow-hidden"><img src="${url}" alt="${escapeHtml(file.name)}" class="max-h-full max-w-full object-contain rounded-xl shadow-lg"></div>`;
  }
  // Video
  if (isYouTube || isVimeo) {
    let embed = url;
    if (isYouTube) { const m = url.match(/(?:youtu\.be\/|watch\?v=)([\w\-]+)/); if (m) embed = 'https://www.youtube.com/embed/' + m[1]; }
    return `<div class="w-full h-full bg-black"><iframe src="${embed}" class="w-full h-full border-0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  if (meta.type === 'video' && url) {
    return `<div class="w-full h-full flex items-center justify-center bg-black p-2"><video controls playsinline class="max-h-full max-w-full rounded-xl"><source src="${url}"></video></div>`;
  }
  // PDF
  if (meta.type === 'pdf') {
    if (!url) return `<div class="p-6 text-xs text-zinc-500 font-medium">PDF sin enlace activo</div>`;
    return `<div class="w-full h-full flex flex-col bg-stone-950">
      <div class="h-8 px-3 bg-resolve-panel border-b border-resolve-border flex items-center justify-between shrink-0">
        <span class="text-[10px] text-zinc-400">Si el PDF no se muestra, ábrelo en el visor nativo</span>
        <a href="${url}" target="_blank" rel="noopener" class="px-2.5 py-0.5 bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 font-semibold rounded-md text-[10px]">Abrir PDF ↗</a>
      </div>
      <object data="${url}" type="application/pdf" class="w-full flex-1" style="min-height:260px">
        <embed src="${url}" type="application/pdf" class="w-full h-full">
        <div class="p-6 text-center text-xs text-zinc-300 font-medium">Tu navegador no puede incrustar este PDF. <a href="${url}" target="_blank" class="text-amber-400 underline">Abrir en pestaña nueva</a></div>
      </object>
    </div>`;
  }
  // Markdown
  if (meta.type === 'markdown') {
    const raw = file.content != null ? file.content : '*(Sin contenido de texto disponible. Vuelve a importar el archivo.)*';
    return `<div class="w-full h-full flex flex-col bg-resolve-bg">
      <div class="h-8 px-3 bg-resolve-panel border-b border-resolve-border flex items-center justify-between shrink-0">
        <div class="flex items-center gap-1">${tabBtn(state.inlineMarkdownViewMode === 'rendered', "setInlineMarkdownTab('rendered')", 'Renderizado')}${tabBtn(state.inlineMarkdownViewMode === 'raw', "setInlineMarkdownTab('raw')", 'Raw')}</div>
        <button type="button" onclick="copyMediaCodeText(this.dataset.code, this)" data-code="${escapeHtml(raw)}" class="px-2 py-0.5 bg-white/[0.05] border border-resolve-border text-zinc-300 rounded text-[10px]">Copiar</button>
      </div>
      <div class="flex-1 overflow-y-auto p-4 select-text">${state.inlineMarkdownViewMode === 'rendered' ? formatMarkdown(raw) : '<pre class="text-[11px] text-zinc-300 font-mono whitespace-pre-wrap">' + escapeHtml(raw) + '</pre>'}</div>
    </div>`;
  }
  // Código
  if (meta.type === 'code') {
    const raw = file.content != null ? file.content : '// Sin contenido de texto disponible.\n// Vuelve a importar el archivo para previsualizarlo.';
    const lines = raw.split('\n');
    const isHtml = ['html', 'htm'].includes(meta.ext);
    return `<div class="w-full h-full flex flex-col bg-resolve-bg">
      <div class="h-8 px-3 bg-resolve-panel border-b border-resolve-border flex items-center justify-between shrink-0">
        <div class="flex items-center gap-1.5">
          <span class="px-1.5 py-0.5 rounded text-[10px] font-bold" style="${meta.badgeStyle}">${meta.badge}</span>
          <span class="text-[10px] text-resolve-dimText">${lines.length} líneas</span>
          ${isHtml ? tabBtn(state.inlineCodeViewMode === 'code', "setInlineCodeTab('code')", 'Código') + tabBtn(state.inlineCodeViewMode === 'render', "setInlineCodeTab('render')", 'Vista Web') : ''}
        </div>
        <button type="button" onclick="copyMediaCodeText(this.dataset.code, this)" data-code="${escapeHtml(raw)}" class="px-2 py-0.5 bg-white/[0.05] border border-resolve-border text-zinc-300 rounded text-[10px]">Copiar</button>
      </div>
      <div class="flex-1 overflow-hidden">
        ${isHtml && state.inlineCodeViewMode === 'render'
          ? `<iframe sandbox="allow-scripts" srcdoc="${escapeHtml(raw)}" class="w-full h-full bg-white border-0"></iframe>`
          : `<div class="w-full h-full overflow-auto flex bg-black/80 text-xs select-text font-mono">
              <div class="py-2.5 px-2 bg-resolve-panel/60 border-r border-resolve-border text-zinc-600 text-right select-none text-[10px] leading-5 shrink-0 min-w-[34px]">${lines.map((_, i) => '<div>' + (i + 1) + '</div>').join('')}</div>
              <pre class="p-2.5 flex-1 text-[11px] text-emerald-400 leading-5 whitespace-pre"><code>${escapeHtml(raw)}</code></pre>
            </div>`}
      </div>
    </div>`;
  }
  // Fuente
  if (meta.type === 'font') {
    ensureFontLoaded(file);
    const id = fontSafeId(file);
    const preset = (t, l) => `<button type="button" onclick="setInteractiveFontPreset(this.dataset.t)" data-t="${escapeHtml(t)}" class="px-2 py-0.5 rounded-md bg-white/[0.05] hover:bg-white/[0.10] border border-resolve-border text-[10px] text-zinc-300 whitespace-nowrap transition-colors">${l}</button>`;
    return `<div class="w-full h-full flex flex-col bg-resolve-bg">
      <div class="h-9 px-3 bg-resolve-panel border-b border-resolve-border flex items-center justify-between shrink-0">
        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold" style="${meta.badgeStyle}">${meta.badge}</span>
        <div class="flex items-center gap-2">
          <span class="text-[10px] text-resolve-dimText font-medium">Tamaño</span>
          <input type="range" min="12" max="72" value="${state.inlineFontSize}" oninput="setInlineFontSize(this.value)" class="w-24 accent-amber-500">
          <span data-font-counter class="text-[10px] text-amber-400 font-mono font-bold w-9 text-right">${state.inlineFontSize}px</span>
        </div>
      </div>
      <div class="h-8 px-3 bg-resolve-surface/70 border-b border-resolve-border flex items-center gap-1.5 overflow-x-auto shrink-0">
        ${preset('El veloz murciélago hindú comía feliz cardillo y kiwi. 1234567890', 'Pangrama ES')}
        ${preset('The quick brown fox jumps over the lazy dog. 1234567890', 'Pangram EN')}
        ${preset('ABCDEFGHIJKLMNÑOPQRSTUVWXYZ abcdefghijklmnñopqrstuvwxyz', 'Aa–Zz')}
        ${preset('0123456789 !?@#$%&*()_+-=[]{};:,.<>/~', '0–9 y símbolos')}
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <div data-font-sandbox contenteditable="true" class="specimen-${id} p-3.5 bg-black/60 border border-resolve-border rounded-xl text-white focus:outline-none focus:border-amber-400 leading-snug" style="font-size:${state.inlineFontSize}px">El veloz murciélago hindú comía feliz cardillo y kiwi. 1234567890</div>
        <div class="border border-resolve-border rounded-xl p-3 bg-resolve-surface/40 space-y-2">
          <div class="specimen-${id} text-2xl text-white truncate">Titular de campaña — 24</div>
          <div class="specimen-${id} text-lg text-amber-200/90 truncate">Subtitular descriptivo — 18</div>
          <div class="specimen-${id} text-sm text-zinc-300">Cuerpo de texto en 14px para evaluar legibilidad en impresos y pantallas.</div>
          <div class="specimen-${id} text-xs text-zinc-500 tracking-wider">ABCDEFGHIJKLMNÑOPQRSTUVWXYZ 0123456789</div>
        </div>
      </div>
    </div>`;
  }
  // Suites: Adobe, Affinity, Pages, Word
  if (meta.isSuite) {
    return `<div class="w-full h-full flex items-center justify-center p-5 overflow-y-auto">
      <div class="w-full max-w-sm bg-resolve-panel border border-resolve-border rounded-2xl p-5 flex flex-col items-center text-center shadow-lg">
        <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-black mb-3 shadow-md" style="${meta.badgeStyle}">${meta.badge}</div>
        <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider mb-1" style="${meta.badgeStyle}">${meta.suiteBrand}</span>
        <div class="font-semibold text-white text-sm mt-1 max-w-full truncate" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
        <div class="text-[11px] text-resolve-dimText mb-3">${escapeHtml(meta.subLabel)} • ${file.size || ''}</div>
        <div class="w-full bg-black/30 border border-resolve-border rounded-xl p-3 text-left text-[10px] mb-4 space-y-1">
          <div class="flex justify-between text-resolve-dimText"><span>Formato</span><span class="text-white font-mono font-bold">.${meta.ext.toUpperCase()}</span></div>
          <div class="flex justify-between text-resolve-dimText"><span>Importado</span><span class="text-zinc-300 font-mono">${file.date || '--'}</span></div>
          <p class="text-[9px] text-zinc-400 pt-1">Formato propietario: el navegador no puede renderizarlo. Ábrelo en su aplicación nativa; la pieza queda adjunta al sobre.</p>
        </div>
        ${url ? `<a href="${url}" download="${escapeHtml(file.name)}" class="w-full py-2 bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-stone-950 font-semibold text-xs rounded-lg shadow-sm border border-amber-300/40 transition-all active:scale-[0.98]">Descargar / Abrir en app nativa</a>` : ''}
      </div>
    </div>`;
  }
  // Genérico / enlace
  return `<div class="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-white/[0.02]">
    <div class="font-semibold text-white text-xs mb-1 max-w-xs truncate">${escapeHtml(file.name)}</div>
    <p class="text-[10px] text-resolve-dimText mb-3">Enlace web o archivo vinculado al sobre.</p>
    ${url ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-stone-950 font-semibold text-xs rounded-lg shadow-sm border border-amber-300/40 transition-all active:scale-[0.98]">Abrir Recurso ↗</a>` : ''}
  </div>`;
}

export function renderInlineViewer() {
  if (typeof document === 'undefined') return;
  const viewer = document.getElementById('envelope-inline-viewer');
  if (!viewer) return;
  const ot = getOrders().find(o => o.id === state.activeOtId);
  const files = (ot && ot.mediaFiles) ? ot.mediaFiles : [];
  const file = files[state.selectedMediaIndex];
  if (!file) { viewer.innerHTML = buildMediaViewerHtml(null); return; }

  const meta = getMediaMeta(file);
  viewer.innerHTML = `
    <div class="h-9 px-3 bg-resolve-panel/90 border-b border-resolve-border flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2 truncate min-w-0">
        <span class="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
        <span class="font-semibold text-white text-[11px] truncate">${escapeHtml(file.name)}</span>
        <span class="text-[10px] text-resolve-dimText uppercase shrink-0 font-medium">(${escapeHtml(meta.subLabel)})</span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button type="button" onclick="openMediaPreviewModal(${state.selectedMediaIndex})" class="px-2 py-0.5 rounded-md bg-white/[0.05] hover:bg-white/[0.10] border border-resolve-border text-amber-300 text-[10px] font-semibold cursor-pointer transition-colors" title="Pantalla completa">Ampliar</button>
        ${file.url && file.url !== '#' ? `<a href="${file.url}" target="_blank" download="${escapeHtml(file.name)}" class="px-2 py-0.5 rounded-md bg-white/[0.05] hover:bg-white/[0.10] border border-resolve-border text-zinc-300 hover:text-white text-[10px] font-semibold transition-colors">Descargar ↓</a>` : ''}
      </div>
    </div>
    <div class="flex-1 overflow-hidden relative bg-black/40">${buildMediaViewerHtml(file)}</div>`;
}

export function openMediaPreviewModal(index) {
  if (typeof document === 'undefined') return;
  const ot = getOrders().find(o => o.id === state.activeOtId);
  if (!ot || !ot.mediaFiles || ot.mediaFiles.length === 0) return;
  state.modalPreviewIndex = Math.max(0, Math.min(ot.mediaFiles.length - 1, index || 0));
  renderMediaPreviewModalBody();
  const modal = document.getElementById('media-preview-modal');
  if (modal) modal.classList.remove('hidden');
}

export function closeMediaPreviewModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('media-preview-modal');
  if (modal) modal.classList.add('hidden');
  const body = document.getElementById('media-preview-modal-body');
  if (body) body.innerHTML = '';
}

export function stepSelectedMediaItem(delta) {
  const ot = getOrders().find(o => o.id === state.activeOtId);
  if (!ot || !ot.mediaFiles || ot.mediaFiles.length === 0) return;
  const total = ot.mediaFiles.length;
  state.modalPreviewIndex = (state.modalPreviewIndex + delta + total) % total;
  renderMediaPreviewModalBody();
}

export function renderMediaPreviewModalBody() {
  if (typeof document === 'undefined') return;
  const ot = getOrders().find(o => o.id === state.activeOtId);
  if (!ot || !ot.mediaFiles) return;
  const file = ot.mediaFiles[state.modalPreviewIndex];
  if (!file) return;
  const meta = getMediaMeta(file);

  const titleEl = document.getElementById('media-preview-modal-title');
  if (titleEl) titleEl.innerText = file.name;

  const metaEl = document.getElementById('media-preview-modal-meta');
  if (metaEl) metaEl.innerText = `${state.modalPreviewIndex + 1} de ${ot.mediaFiles.length} • ${meta.subLabel} • ${file.size || ''}`;

  const bodyEl = document.getElementById('media-preview-modal-body');
  if (bodyEl) bodyEl.innerHTML = buildMediaViewerHtml(file);
}

// ============================================================================
// 4. MODAL NUEVA OT & GENERADOR DE ID
// ============================================================================

export function openNewOtModal() {
  if (typeof document === 'undefined') return;
  const orders = getOrders();
  let maxNum = 0;
  orders.forEach(o => {
    const parts = (o.id || '').split('-');
    if (parts.length === 3) {
      const num = parseInt(parts[2], 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  const nextId = `OT-26-${String(maxNum + 1).padStart(3, '0')}`;

  const idInput = document.getElementById('new-id-input');
  if (idInput) idInput.value = nextId;

  const refInput = document.getElementById('new-ref-input');
  if (refInput) refInput.value = '';

  const clientInput = document.getElementById('new-client-input');
  if (clientInput) clientInput.value = (state.selectedTreeFilter && state.selectedTreeFilter.client) || '';

  const brandInput = document.getElementById('new-brand-input');
  if (brandInput) brandInput.value = (state.selectedTreeFilter && state.selectedTreeFilter.brand) || '';

  const mediaInput = document.getElementById('new-media-input');
  if (mediaInput) mediaInput.value = '';

  const titleInput = document.getElementById('new-title-input');
  if (titleInput) titleInput.value = '';

  const firstTaskInput = document.getElementById('new-first-task-input');
  if (firstTaskInput) firstTaskInput.value = '';

  const urgentInput = document.getElementById('new-urgent-input');
  if (urgentInput) urgentInput.checked = false;

  renderStatusSelects();
  renderResponsibleSelects();

  const newStatus = document.getElementById('new-ot-status');
  if (newStatus) newStatus.value = 'Tráfico';

  const newResp = document.getElementById('new-ot-responsible');
  if (newResp) newResp.value = 'Andrés J.';

  updateClientsDatalist();
  syncNewOtBrandSuggestions();

  const modal = document.getElementById('new-ot-modal');
  if (modal) modal.classList.remove('hidden');
}

export function closeNewOtModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('new-ot-modal');
  if (modal) modal.classList.add('hidden');
}

export function syncNewOtBrandSuggestions() {
  if (typeof document === 'undefined') return;
  const clientName = (document.getElementById('new-client-input')?.value || '').trim();
  const brandDatalist = document.getElementById('brands-datalist');
  if (!brandDatalist) return;

  const clients = getClients();
  const client = clients.find(c => c.name.toLowerCase() === clientName.toLowerCase());

  if (client && client.brands) {
    brandDatalist.innerHTML = client.brands.map(b => `<option value="${escapeHtml(b)}"></option>`).join('');
  } else {
    const allBrands = new Set();
    clients.forEach(c => (c.brands || []).forEach(b => allBrands.add(b)));
    brandDatalist.innerHTML = Array.from(allBrands).map(b => `<option value="${escapeHtml(b)}"></option>`).join('');
  }
}

export function handleCreateOt(e) {
  if (e) e.preventDefault();
  if (typeof document === 'undefined') return;

  const orders = getOrders();
  const clients = getClients();

  const newId = document.getElementById('new-id-input')?.value || `OT-26-${Date.now()}`;
  const ref = (document.getElementById('new-ref-input')?.value || '').trim();
  const client = (document.getElementById('new-client-input')?.value || '').trim();
  const brand = (document.getElementById('new-brand-input')?.value || '').trim();
  const product = (document.getElementById('new-product-input')?.value || '').trim();
  const responsible = (document.getElementById('new-ot-responsible')?.value) || 'Andrés J.';
  const status = (document.getElementById('new-ot-status')?.value) || 'Tráfico';
  const media = (document.getElementById('new-media-input')?.value || '').trim();
  const title = (document.getElementById('new-title-input')?.value || '').trim();
  const firstTask = (document.getElementById('new-first-task-input')?.value || '').trim();
  const urgent = !!document.getElementById('new-urgent-input')?.checked;

  let existingClient = clients.find(c => c.name.toLowerCase() === client.toLowerCase());
  if (!existingClient) {
    existingClient = { id: 'c-' + Date.now(), name: client, brands: brand ? [brand] : [] };
    clients.push(existingClient);
    saveClients(clients);
  } else {
    if (!existingClient.brands) existingClient.brands = [];
    if (brand && !existingClient.brands.some(b => b.toLowerCase() === brand.toLowerCase())) {
      existingClient.brands.push(brand);
      saveClients(clients);
    }
  }

  if (responsible && responsible !== '__NEW_RESPONSIBLE__') {
    addResponsible(responsible);
  }

  const initialRoutes = [];
  const respVal = (responsible && responsible !== '__NEW_RESPONSIBLE__') ? responsible : 'Andrés J.';
  initialRoutes.push({
    from: "Tráfico",
    to: "Creativos",
    task: firstTask || title || "",
    entryDate: getNowFormatted(),
    deliveryDate: "",
    sign: respVal,
    notes: "",
    stamp: firstTask ? "RECIBIDO" : null,
    completed: false
  });

  const newOt = {
    id: newId,
    ref: ref,
    createdAt: getNowFormatted(),
    client: client,
    brand: brand,
    product: product || brand,
    title: title,
    media: media,
    urgent: urgent,
    status: status !== '__NEW__' ? status : 'Tráfico',
    responsible: responsible !== '__NEW_RESPONSIBLE__' ? responsible : 'Andrés J.',
    brief: "",
    legalText: "",
    mediaFiles: [],
    routes: initialRoutes
  };

  orders.unshift(newOt);
  saveOrders(orders);
  closeNewOtModal();
  openEnvelopeModal(newOt.id);
}

export function updateClientsDatalist() {
  if (typeof document === 'undefined') return;
  const dl = document.getElementById('clients-datalist');
  if (!dl) return;
  const clients = getClients();
  dl.innerHTML = clients.map(c => `<option value="${escapeHtml(c.name)}"></option>`).join('');
}

// ============================================================================
// 5. GESTIÓN DE CLIENTES Y MARCAS (CRUD UNIFICADO CON COLOR Y MARCAS)
// ============================================================================

let currentModalBrands = [];
let currentModalColor = 'emerald';

export function renderClientModalColors() {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('client-modal-color-container');
  const label = document.getElementById('client-modal-color-label');
  const hiddenInput = document.getElementById('client-modal-color');
  const headerIndicator = document.getElementById('client-modal-header-indicator');
  if (!container) return;

  const activeItem = CLIENT_COLOR_PALETTE.find(p => p.name === currentModalColor) || CLIENT_COLOR_PALETTE[0];
  if (label) {
    label.innerText = activeItem.label || activeItem.name;
    label.className = `text-[10px] font-semibold ${activeItem.text}`;
  }
  if (hiddenInput) hiddenInput.value = activeItem.name;
  if (headerIndicator) {
    headerIndicator.style.backgroundColor = activeItem.hex;
  }

  container.innerHTML = CLIENT_COLOR_PALETTE.map(item => {
    const isSelected = item.name === currentModalColor;
    return `
      <button 
        type="button" 
        onclick="selectClientModalColor('${item.name}')" 
        title="${escapeHtml(item.label || item.name)}"
        class="h-7 rounded-md flex items-center justify-center gap-1.5 px-1.5 transition-all cursor-pointer border ${isSelected ? 'border-white ring-2 ring-amber-400/60 shadow-sm scale-[1.03] ' + item.bg : 'border-white/[0.08] hover:border-white/30 opacity-70 hover:opacity-100 bg-white/[0.02]'}"
      >
        <span class="w-2.5 h-2.5 rounded-full ${item.dot} shrink-0"></span>
        <span class="text-[9px] font-medium truncate ${item.text}">${escapeHtml(item.label || item.name)}</span>
      </button>
    `;
  }).join('');
}

export function selectClientModalColor(colorName) {
  currentModalColor = colorName;
  renderClientModalColors();
}

export function renderClientModalBrandsList() {
  if (typeof document === 'undefined') return;
  const listContainer = document.getElementById('client-modal-brands-list');
  if (!listContainer) return;

  if (currentModalBrands.length === 0) {
    listContainer.innerHTML = `<span class="text-zinc-500 italic text-[11px] py-1 self-center w-full text-center select-none">Sin marcas o productos agregados aún (opcional)</span>`;
    return;
  }

  listContainer.innerHTML = currentModalBrands.map(brand => `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/[0.08] text-zinc-200 border border-white/[0.12] text-xs font-medium group">
      <span>${escapeHtml(brand)}</span>
      <button 
        type="button" 
        onclick="handleRemoveBrandFromModal('${escapeHtml(brand)}')" 
        class="text-zinc-400 hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer"
        title="Eliminar marca"
      >✕</button>
    </span>
  `).join('');
}

export function handleAddBrandToModal() {
  if (typeof document === 'undefined') return;
  const input = document.getElementById('client-modal-brand-input');
  if (!input) return;
  const brandVal = (input.value || '').trim();
  if (!brandVal) return;

  if (currentModalBrands.some(b => b.toLowerCase() === brandVal.toLowerCase())) {
    if (typeof window !== 'undefined') window.alert('Esta marca o producto ya fue agregada.');
    return;
  }

  currentModalBrands.push(brandVal);
  input.value = '';
  renderClientModalBrandsList();
  input.focus();
}

export function handleRemoveBrandFromModal(brandName) {
  currentModalBrands = currentModalBrands.filter(b => b.toLowerCase() !== (brandName || '').toLowerCase());
  renderClientModalBrandsList();
}

export function openClientModal(clientId = null) {
  if (typeof document === 'undefined') return;
  const title = document.getElementById('client-modal-title');
  const inputId = document.getElementById('edit-client-id');
  const inputName = document.getElementById('client-modal-name');
  const brandInput = document.getElementById('client-modal-brand-input');

  if (clientId) {
    const client = getClients().find(c => c.id === clientId);
    if (!client) return;
    if (title) title.innerText = "Editar Cliente";
    if (inputId) inputId.value = client.id;
    if (inputName) inputName.value = client.name;
    currentModalColor = client.color || 'emerald';
    currentModalBrands = Array.isArray(client.brands) ? [...client.brands] : [];
  } else {
    if (title) title.innerText = "Nuevo Cliente";
    if (inputId) inputId.value = "";
    if (inputName) inputName.value = "";
    currentModalColor = 'emerald';
    currentModalBrands = [];
  }

  if (brandInput) brandInput.value = "";

  renderClientModalColors();
  renderClientModalBrandsList();

  const modal = document.getElementById('client-modal');
  if (modal) modal.classList.remove('hidden');
  if (inputName) inputName.focus();
}

export function closeClientModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('client-modal');
  if (modal) modal.classList.add('hidden');
}

export function handleSaveClient(e) {
  if (e) e.preventDefault();
  if (typeof document === 'undefined') return;

  const inputId = document.getElementById('edit-client-id')?.value;
  const name = (document.getElementById('client-modal-name')?.value || '').trim();
  if (!name) return;

  // Si quedó texto escrito en el input de marca sin pulsar "+", agregarlo automáticamente
  const pendingBrandInput = document.getElementById('client-modal-brand-input');
  if (pendingBrandInput) {
    const pendingVal = (pendingBrandInput.value || '').trim();
    if (pendingVal && !currentModalBrands.some(b => b.toLowerCase() === pendingVal.toLowerCase())) {
      currentModalBrands.push(pendingVal);
    }
  }

  const clients = getClients();
  const orders = getOrders();

  if (inputId) {
    const client = clients.find(c => c.id === inputId);
    if (client) {
      const oldName = client.name;
      client.name = name;
      client.color = currentModalColor;
      client.brands = [...currentModalBrands];

      if (oldName.toLowerCase() !== name.toLowerCase()) {
        orders.forEach(ot => {
          if ((ot.client || '').toLowerCase() === oldName.toLowerCase()) {
            ot.client = name;
          }
        });
        if (state.selectedTreeFilter && state.selectedTreeFilter.client === oldName) {
          state.selectedTreeFilter.client = name;
        }
        saveOrders(orders);
      }
    }
  } else {
    const exists = clients.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      if (typeof window !== 'undefined') window.alert("Ya existe un cliente con ese nombre.");
      return;
    }
    clients.push({
      id: 'c-' + Date.now(),
      name: name,
      color: currentModalColor,
      brands: [...currentModalBrands]
    });
  }

  saveClients(clients);
  closeClientModal();
  updateClientsDatalist();
  renderBinTree();
  renderTrafficDesk();
}

export function deleteClientAction(clientId) {
  const clients = getClients();
  const client = clients.find(c => c.id === clientId);
  if (!client) return;

  const orders = getOrders();
  const associated = orders.filter(o => (o.client || '').toLowerCase() === client.name.toLowerCase());

  const confirmMsg = associated.length > 0
    ? `ATENCIÓN: El cliente "${client.name}" tiene ${associated.length} OTs vinculadas. ¿Deseas eliminar el cliente y todas sus marcas? (Las OTs se mantendrán pero quedarán sin bin activo)`
    : `¿Eliminar el cliente "${client.name}" y sus marcas?`;

  if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) return;

  bridgeDeleteClient(clientId);
  if (state.selectedTreeFilter && state.selectedTreeFilter.client === client.name) {
    state.selectedTreeFilter = { type: 'all', client: null, brand: null };
  }
  renderBinTree();
  renderTrafficDesk();
}

export function openBrandModal(clientName, oldBrandName = null) {
  if (typeof document === 'undefined') return;
  const title = document.getElementById('brand-modal-title');
  const inputClient = document.getElementById('brand-client-name');
  const displayClient = document.getElementById('brand-client-display');
  const inputOld = document.getElementById('edit-brand-old-name');
  const inputName = document.getElementById('brand-modal-name');

  if (inputClient) inputClient.value = clientName;
  if (displayClient) displayClient.value = clientName;

  if (oldBrandName) {
    if (title) title.innerText = "Editar Marca / Producto";
    if (inputOld) inputOld.value = oldBrandName;
    if (inputName) inputName.value = oldBrandName;
  } else {
    if (title) title.innerText = "Nueva Marca / Producto";
    if (inputOld) inputOld.value = "";
    if (inputName) inputName.value = "";
  }

  const modal = document.getElementById('brand-modal');
  if (modal) modal.classList.remove('hidden');
  if (inputName) inputName.focus();
}

export function closeBrandModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('brand-modal');
  if (modal) modal.classList.add('hidden');
}

export function handleSaveBrand(e) {
  if (e) e.preventDefault();
  if (typeof document === 'undefined') return;

  const clientName = document.getElementById('brand-client-name')?.value || '';
  const oldBrandName = document.getElementById('edit-brand-old-name')?.value || '';
  const newBrandName = (document.getElementById('brand-modal-name')?.value || '').trim();
  if (!newBrandName) return;

  const clients = getClients();
  const client = clients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
  if (!client) return;

  if (!client.brands) client.brands = [];

  if (oldBrandName) {
    const idx = client.brands.findIndex(b => b.toLowerCase() === oldBrandName.toLowerCase());
    if (idx !== -1) {
      client.brands[idx] = newBrandName;
    }
    const orders = getOrders();
    orders.forEach(ot => {
      if ((ot.client || '').toLowerCase() === clientName.toLowerCase() && (ot.product || '').toLowerCase() === oldBrandName.toLowerCase()) {
        ot.product = newBrandName;
      }
    });
    if (state.selectedTreeFilter && state.selectedTreeFilter.brand === oldBrandName) {
      state.selectedTreeFilter.brand = newBrandName;
    }
    saveOrders(orders);
  } else {
    if (client.brands.some(b => b.toLowerCase() === newBrandName.toLowerCase())) {
      if (typeof window !== 'undefined') window.alert("Esa marca ya existe para este cliente.");
      return;
    }
    client.brands.push(newBrandName);
  }

  saveClients(clients);
  closeBrandModal();
  renderBinTree();
  renderTrafficDesk();
}

export function deleteBrandAction(clientName, brandName) {
  if (typeof window !== 'undefined' && !window.confirm(`¿Eliminar la marca "${brandName}" del cliente "${clientName}"?`)) return;

  bridgeDeleteBrand(clientName, brandName);
  if (state.selectedTreeFilter && state.selectedTreeFilter.client === clientName && state.selectedTreeFilter.brand === brandName) {
    state.selectedTreeFilter = { type: 'client', client: clientName, brand: null };
  }
  renderBinTree();
  renderTrafficDesk();
}

// ============================================================================
// 6. GESTOR DE ESTADOS (STATUS-MANAGER-MODAL)
// ============================================================================

export function openStatusManagerModal() {
  if (typeof document === 'undefined') return;
  renderStatusManagerList();
  const nameInput = document.getElementById('new-status-name');
  if (nameInput) nameInput.value = '';
  const modal = document.getElementById('status-manager-modal');
  if (modal) modal.classList.remove('hidden');
  if (nameInput) nameInput.focus();
}

export function closeStatusManagerModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('status-manager-modal');
  if (modal) modal.classList.add('hidden');
}

export function renderStatusManagerList() {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('status-manager-list');
  if (!container) return;

  const statuses = getStatuses();
  const orders = getOrders();

  container.innerHTML = statuses.map(st => {
    const count = orders.filter(o => (o.status || '').toLowerCase() === st.name.toLowerCase()).length;
    return `
      <div class="flex items-center gap-2 p-1.5 bg-resolve-bg border border-resolve-border rounded">
        <select 
          onchange="updateStatusColor('${st.id}', this.value)" 
          class="bg-resolve-panel border border-resolve-border rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none"
        >
          <option value="amber" ${st.color === 'amber' ? 'selected' : ''}>Ámbar</option>
          <option value="blue" ${st.color === 'blue' ? 'selected' : ''}>Azul</option>
          <option value="cyan" ${st.color === 'cyan' ? 'selected' : ''}>Celeste</option>
          <option value="purple" ${st.color === 'purple' ? 'selected' : ''}>Púrpura</option>
          <option value="emerald" ${st.color === 'emerald' ? 'selected' : ''}>Verde</option>
          <option value="red" ${st.color === 'red' ? 'selected' : ''}>Rojo</option>
          <option value="yellow" ${st.color === 'yellow' ? 'selected' : ''}>Amarillo</option>
          <option value="stone" ${st.color === 'stone' ? 'selected' : ''}>Gris</option>
        </select>

        <input 
          type="text" 
          value="${escapeHtml(st.name)}" 
          onchange="renameStatus('${st.id}', this.value)" 
          class="flex-1 bg-transparent border-0 border-b border-transparent hover:border-resolve-border focus:border-resolve-accent focus:ring-0 text-xs text-white font-bold px-1"
        />

        <span class="text-[10px] text-resolve-dimText whitespace-nowrap" title="OTs activas con este estado">
          (${count} OTs)
        </span>

        <button 
          onclick="deleteStatusAction('${st.id}')" 
          title="Eliminar estado" 
          class="p-1 hover:text-red-400 text-resolve-dimText transition-colors"
        >
          ✕
        </button>
      </div>
    `;
  }).join('');
}

export function handleCreateStatus(e) {
  if (e) e.preventDefault();
  if (typeof document === 'undefined') return;

  const nameInput = document.getElementById('new-status-name');
  const colorSelect = document.getElementById('new-status-color');
  const name = (nameInput ? nameInput.value : '').trim();
  const color = colorSelect ? colorSelect.value : 'stone';
  if (!name) return;

  const statuses = getStatuses();
  if (statuses.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    if (typeof window !== 'undefined') window.alert("Ya existe un estado con ese nombre.");
    return;
  }

  statuses.push({
    id: 'st-' + Date.now(),
    name: name,
    color: color
  });

  saveStatuses(statuses);
  if (nameInput) nameInput.value = '';

  if (state.activeOtId) {
    updateActiveOtField('status', name);
    const sel = document.getElementById('modal-ot-status');
    if (sel) sel.value = name;
  }

  renderStatusManagerList();
  renderStatusSelects();
  refreshAllViews();
}

export function renameStatus(id, newName) {
  newName = (newName || '').trim();
  if (!newName) return;

  const statuses = getStatuses();
  const st = statuses.find(s => s.id === id);
  if (!st || st.name === newName) return;

  const oldName = st.name;
  st.name = newName;

  const orders = getOrders();
  orders.forEach(ot => {
    if ((ot.status || '').toLowerCase() === oldName.toLowerCase()) {
      ot.status = newName;
    }
  });
  saveOrders(orders);
  saveStatuses(statuses);

  renderStatusManagerList();
  renderStatusSelects();
  refreshAllViews();
}

export function updateStatusColor(id, newColor) {
  const statuses = getStatuses();
  const st = statuses.find(s => s.id === id);
  if (!st) return;
  st.color = newColor;
  saveStatuses(statuses);

  renderStatusManagerList();
  renderStatusSelects();
  refreshAllViews();
}

export function deleteStatusAction(id) {
  const statuses = getStatuses();
  if (statuses.length <= 1) {
    if (typeof window !== 'undefined') window.alert("Debe existir al menos un estado de tráfico.");
    return;
  }

  const st = statuses.find(s => s.id === id);
  if (!st) return;

  const orders = getOrders();
  const count = orders.filter(o => (o.status || '').toLowerCase() === st.name.toLowerCase()).length;
  if (count > 0) {
    if (typeof window !== 'undefined' && !window.confirm(`Hay ${count} OTs con el estado "${st.name}". ¿Deseas eliminarlo? Las OTs pasarán al estado "Tráfico".`)) {
      return;
    }
    orders.forEach(o => {
      if ((o.status || '').toLowerCase() === st.name.toLowerCase()) {
        o.status = "Tráfico";
      }
    });
    saveOrders(orders);
  } else {
    if (typeof window !== 'undefined' && !window.confirm(`¿Eliminar el estado "${st.name}"?`)) return;
  }

  const filtered = statuses.filter(s => s.id !== id);
  saveStatuses(filtered);

  renderStatusManagerList();
  renderStatusSelects();
  refreshAllViews();
}

// ============================================================================
// 7. RESPALDOS & RESTAURACIÓN JSON
// ============================================================================

export function exportBackupData() {
  const backup = {
    app: "ElMarcanteTrafficControl",
    version: "2.3",
    date: new Date().toISOString(),
    clients: getClients(),
    orders: getOrders(),
    statuses: getStatuses(),
    responsibles: getResponsibles(),
    stripboard: getAllStripboardStorage()
  };

  if (typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Respaldo_OTs_ElMarcante_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export function importBackupData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.orders && parsed.clients) {
        saveOrders(parsed.orders);
        saveClients(parsed.clients);
        if (parsed.statuses) saveStatuses(parsed.statuses);
        if (parsed.responsibles) localStorage.setItem(RESPONSIBLES_STORAGE_KEY, JSON.stringify(parsed.responsibles));
        if (parsed.stripboard) localStorage.setItem(STRIPBOARD_STORAGE_KEY, JSON.stringify(parsed.stripboard));

        renderStatusSelects();
        renderResponsibleSelects();
        renderBinTree();
        renderTrafficDesk();
        updateClientsDatalist();
        updateDeptOptionsDatalist();
        renderStripboard();
        if (typeof window !== 'undefined') window.alert("Respaldo restaurado con éxito.");
      } else {
        if (typeof window !== 'undefined') window.alert("Archivo de respaldo inválido.");
      }
    } catch (err) {
      if (typeof window !== 'undefined') window.alert("Error al parsear el archivo JSON.");
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ============================================================================
// SUSCRIPCIÓN A EVENTOS DEL EVENTBUS
// ============================================================================
on('modal:open-envelope', e => {
  if (e && e.detail && e.detail.otId) {
    openEnvelopeModal(e.detail.otId);
  }
});

on('modal:open-client', e => {
  openClientModal(e && e.detail ? e.detail.clientId : null);
});

on('modal:open-brand', e => {
  if (e && e.detail) {
    openBrandModal(e.detail.clientName, e.detail.brand || null);
  }
});

on('modal:open-custom-task', e => {
  if (e && e.detail) {
    openCustomTaskModal(e.detail.index, e.detail.dateStr);
  }
});

// ============================================================================
// EXPOSICIÓN GLOBAL EN WINDOW PARA RETROCOMPATIBILIDAD
// ============================================================================
if (typeof window !== 'undefined') {
  window.openEnvelopeModal = openEnvelopeModal;
  window.closeEnvelopeModal = closeEnvelopeModal;
  window.switchOtTab = switchOtTab;
  window.updateActiveOtField = updateActiveOtField;
  window.deleteActiveOt = deleteActiveOt;
  window.renderModalStripboardWitness = renderModalStripboardWitness;
  window.jumpFromModalToStripboardDate = jumpFromModalToStripboardDate;
  window.removeStripFromModalWitness = removeStripFromModalWitness;
  window.scheduleActiveOtFromModal = scheduleActiveOtFromModal;
  window.renderRouteSheetRows = renderRouteSheetRows;
  window.addNewRouteRow = addNewRouteRow;
  window.updateRouteCell = updateRouteCell;
  window.updateRouteDateCell = updateRouteDateCell;
  window.handleRouteDeptChange = handleRouteDeptChange;
  window.handleRouteSignChange = handleRouteSignChange;
  window.stampCurrentTime = stampCurrentTime;
  window.toggleRouteDone = toggleRouteDone;
  window.deleteRouteRow = deleteRouteRow;
  window.openStampModal = openStampModal;
  window.closeStampModal = closeStampModal;
  window.applyStamp = applyStamp;
  window.clearCurrentStamp = clearCurrentStamp;
  window.setMediaPoolView = setMediaPoolView;
  window.renderMediaPool = renderMediaPool;
  window.handleMediaPoolUpload = handleMediaPoolUpload;
  window.promptAddMediaLink = promptAddMediaLink;
  window.removeMediaItem = removeMediaItem;
  window.renderInlineEnvelopeMedia = renderInlineEnvelopeMedia;
  window.selectInlinePreviewMedia = selectInlinePreviewMedia;
  window.setInlineCodeTab = setInlineCodeTab;
  window.setInlineMarkdownTab = setInlineMarkdownTab;
  window.setInlineFontSize = setInlineFontSize;
  window.setInteractiveFontPreset = setInteractiveFontPreset;
  window.openMediaPreviewModal = openMediaPreviewModal;
  window.closeMediaPreviewModal = closeMediaPreviewModal;
  window.stepSelectedMediaItem = stepSelectedMediaItem;
  window.copyMediaCodeText = copyMediaCodeText;
  window.openNewOtModal = openNewOtModal;
  window.closeNewOtModal = closeNewOtModal;
  window.syncNewOtBrandSuggestions = syncNewOtBrandSuggestions;
  window.handleCreateOt = handleCreateOt;
  window.updateClientsDatalist = updateClientsDatalist;
  window.openClientModal = openClientModal;
  window.closeClientModal = closeClientModal;
  window.renderClientModalColors = renderClientModalColors;
  window.selectClientModalColor = selectClientModalColor;
  window.renderClientModalBrandsList = renderClientModalBrandsList;
  window.handleAddBrandToModal = handleAddBrandToModal;
  window.handleRemoveBrandFromModal = handleRemoveBrandFromModal;
  window.handleSaveClient = handleSaveClient;
  window.deleteClient = deleteClientAction;
  window.openBrandModal = openBrandModal;
  window.closeBrandModal = closeBrandModal;
  window.handleSaveBrand = handleSaveBrand;
  window.deleteBrand = deleteBrandAction;
  window.openStatusManagerModal = openStatusManagerModal;
  window.closeStatusManagerModal = closeStatusManagerModal;
  window.renderStatusManagerList = renderStatusManagerList;
  window.handleCreateStatus = handleCreateStatus;
  window.renameStatus = renameStatus;
  window.updateStatusColor = updateStatusColor;
  window.deleteStatus = deleteStatusAction;
  window.deleteStatusAction = deleteStatusAction;
  window.exportBackupData = exportBackupData;
  window.importBackupData = importBackupData;
}

