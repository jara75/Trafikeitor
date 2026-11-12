/**
 * TRAFIKEITOR // MÓDULO DE VISTAS: MESA DE TRÁFICO Y TABLA UNIFICADA
 * Módulo 3: Renderizado de Master Bin Tree, Vista Cuadrícula/Lista, Componente Fila Unificada (11 columnas),
 * Ordenamiento, Agrupación Apple Numbers y Drag & Drop de OTs.
 */

import {
  state,
  resetDragState,
  clearStripDropIndicators,
  pauseRowDrag,
  resumeRowDrag,
  emit,
  on,
  CLIENT_COLOR_PALETTE
} from './core-state.js';

export { CLIENT_COLOR_PALETTE };

import {
  getOrders,
  saveOrders,
  getOrderById,
  getClients,
  saveClients,
  deleteClient,
  deleteBrand,
  getStatuses,
  saveStatuses,
  getStatusBadgeClass,
  getStatusOptionsHtml,
  getResponsibles,
  addResponsible,
  getResponsibleOptionsHtml,
  getDepartments,
  getActiveRoute,
  getDayStrips,
  saveDayStrips,
  escapeHtml,
  toIsoDateTime,
  fromIsoToDisplay,
  getUserProfile,
  getActiveUserShortName
} from './data-bridge.js';

// ============================================================================
// COLORES DISTINTIVOS: CLIENTES Y RESPONSABLES
// ============================================================================

export function getResponsibleColorClasses(responsibleName) {
  const profile = getUserProfile();
  const cleanResp = (responsibleName || '').trim().toLowerCase();
  const userShort = (profile.shortName || '').trim().toLowerCase();
  const userFull = (profile.fullName || '').trim().toLowerCase();

  if (cleanResp && (cleanResp === userShort || cleanResp === userFull)) {
    const userColor = CLIENT_COLOR_PALETTE.find(p => p.name === profile.color);
    if (userColor) return userColor;
  }

  // Cyan por defecto para otros responsables
  return CLIENT_COLOR_PALETTE.find(p => p.name === 'cyan') || CLIENT_COLOR_PALETTE[0];
}

export function getClientColorClasses(clientName) {
  if (!clientName || clientName === '--' || clientName === 'Interno') {
    return CLIENT_COLOR_PALETTE[3]; // Ámbar por defecto
  }
  const found = getClients().find(c => (c.name || '').toLowerCase() === String(clientName).trim().toLowerCase());
  if (found && found.color) {
    const matched = CLIENT_COLOR_PALETTE.find(p => p.name === found.color);
    if (matched) return matched;
  }
  let hash = 0;
  const str = String(clientName).trim().toLowerCase();
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
  }
  const index = Math.abs(hash) % CLIENT_COLOR_PALETTE.length;
  return CLIENT_COLOR_PALETTE[index];
}


// ============================================================================
// GESTIÓN DE ORDENAMIENTO Y AGRUPACIÓN (ESTILO APPLE NUMBERS)
// ============================================================================

export function setTableSort(field) {
  if (state.currentTableSort.field === field) {
    state.currentTableSort.dir = state.currentTableSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.currentTableSort.field = field;
    state.currentTableSort.dir = 'asc';
  }
  syncSortAndGroupControls();
  refreshAllViews();
}

export function toggleTableSortDirection() {
  state.currentTableSort.dir = state.currentTableSort.dir === 'asc' ? 'desc' : 'asc';
  syncSortAndGroupControls();
  refreshAllViews();
}

export function setTableGroup(groupField) {
  state.currentTableGroup = groupField;
  state.collapsedGroupKeys.clear();
  syncSortAndGroupControls();
  refreshAllViews();
}

export function toggleGroupCollapse(groupKey) {
  if (state.collapsedGroupKeys.has(groupKey)) {
    state.collapsedGroupKeys.delete(groupKey);
  } else {
    state.collapsedGroupKeys.add(groupKey);
  }
  refreshAllViews();
}

export function expandAllTableGroups() {
  if (!state.collapsedGroupKeys) state.collapsedGroupKeys = new Set();
  state.collapsedGroupKeys.clear();
  refreshAllViews();
}

export function collapseAllTableGroups() {
  if (state.currentTableGroup === 'none') return;
  if (!state.collapsedGroupKeys) state.collapsedGroupKeys = new Set();
  const orders = getOrders();
  orders.forEach(ot => {
    const route = getActiveRoute(ot);
    let key = '';
    if (state.currentTableGroup === 'client') {
      key = ot.client || 'Sin Cliente';
    } else if (state.currentTableGroup === 'status') {
      key = ot.status || 'Tráfico';
    } else if (state.currentTableGroup === 'responsible') {
      key = ot.responsible || 'Andrés J.';
    } else if (state.currentTableGroup === 'department') {
      key = (route && route.to) ? route.to : 'Sin Departamento';
    }
    if (key) state.collapsedGroupKeys.add(key);
  });
  refreshAllViews();
}

export function toggleUrgentFilter() {
  state.filterUrgentOnly = !state.filterUrgentOnly;
  refreshAllViews();
}

export function syncSortAndGroupControls() {
  if (typeof document === 'undefined') return;

  const traficoGroup = document.getElementById('trafico-group-select');
  const stripboardGroup = document.getElementById('stripboard-group-select');
  if (traficoGroup) traficoGroup.value = state.currentTableGroup;
  if (stripboardGroup) stripboardGroup.value = state.currentTableGroup;

  const traficoSort = document.getElementById('trafico-sort-select');
  const stripboardSort = document.getElementById('stripboard-sort-select');
  if (traficoSort) traficoSort.value = state.currentTableSort.field;
  if (stripboardSort) stripboardSort.value = state.currentTableSort.field;

  const dirLabel = state.currentTableSort.dir === 'asc' ? '▲ Asc' : '▼ Desc';
  const traficoDir = document.getElementById('trafico-sort-dir-label');
  const stripboardDir = document.getElementById('stripboard-sort-dir-label');
  if (traficoDir) traficoDir.innerText = dirLabel;
  if (stripboardDir) stripboardDir.innerText = dirLabel;
}

export function sortOrdersList(list) {
  if (!list || list.length === 0) return [];
  if (state.currentTableSort.field === 'none') return [...list];

  const statuses = getStatuses();
  const statusOrder = {};
  statuses.forEach((s, idx) => {
    statusOrder[s.name.toLowerCase()] = idx;
  });

  const sorted = [...list].sort((a, b) => {
    const routeA = getActiveRoute(a);
    const routeB = getActiveRoute(b);
    let valA = '';
    let valB = '';

    if (state.currentTableSort.field === 'entryDate' || state.currentTableSort.field === 'inDate') {
      const timeA = new Date(toIsoDateTime(routeA.entryDate)).getTime() || 0;
      const timeB = new Date(toIsoDateTime(routeB.entryDate)).getTime() || 0;
      return state.currentTableSort.dir === 'asc' ? timeA - timeB : timeB - timeA;
    } else if (state.currentTableSort.field === 'deliveryDate' || state.currentTableSort.field === 'outDate') {
      const timeA = new Date(toIsoDateTime(routeA.deliveryDate)).getTime() || 0;
      const timeB = new Date(toIsoDateTime(routeB.deliveryDate)).getTime() || 0;
      return state.currentTableSort.dir === 'asc' ? timeA - timeB : timeB - timeA;
    } else if (state.currentTableSort.field === 'responsible') {
      valA = (a.responsible || '').toLowerCase();
      valB = (b.responsible || '').toLowerCase();
    } else if (state.currentTableSort.field === 'status') {
      const idxA = statusOrder[(a.status || '').toLowerCase()] ?? 999;
      const idxB = statusOrder[(b.status || '').toLowerCase()] ?? 999;
      return state.currentTableSort.dir === 'asc' ? idxA - idxB : idxB - idxA;
    } else if (state.currentTableSort.field === 'department') {
      valA = (routeA.to || '').toLowerCase();
      valB = (routeB.to || '').toLowerCase();
    } else if (state.currentTableSort.field === 'client') {
      valA = (a.client || '').toLowerCase();
      valB = (b.client || '').toLowerCase();
    } else if (state.currentTableSort.field === 'brand') {
      valA = (a.brand || a.product || '').toLowerCase();
      valB = (b.brand || b.product || '').toLowerCase();
    } else if (state.currentTableSort.field === 'otNumber') {
      valA = (a.id || '').toLowerCase();
      valB = (b.id || '').toLowerCase();
    }

    const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
    return state.currentTableSort.dir === 'asc' ? cmp : -cmp;
  });

  return sorted;
}

// ============================================================================
// MANEJADORES DE EVENTOS DE FILA Y NAVEGACIÓN
// ============================================================================

export function handleTableRowClick(event, otId) {
  if (state.dragState && state.dragState.isDragging) return;
  if (event && event.target && event.target.closest && event.target.closest('input, select, textarea, button, a, [data-no-open]')) {
    return;
  }
  emit('modal:open-envelope', { otId });
}

export function handleUnifiedRowDragStart(e, otId, viewContext) {
  if (e.target && e.target.closest && e.target.closest('button, input, select, textarea, a, [data-no-drag]')) {
    e.preventDefault();
    return;
  }
  state.dragState.isDragging = true;
  state.dragState.sourceType = 'table-row';
  state.dragState.otId = otId;
  state.dragState.sourceContext = viewContext;
  state.dragState.sourceDate = state.currentStripboardDate;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', otId);
  }
  const row = e.currentTarget;
  setTimeout(() => {
    if (row && row.classList) row.classList.add('dragging');
  }, 0);
}

export function handleUnifiedRowDragOver(e, targetOtId, viewContext) {
  e.preventDefault();
  e.stopPropagation();
  const row = e.currentTarget;
  if (!row) return;

  const rect = row.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const pos = e.clientY < midY ? 'before' : 'after';

  if (typeof document !== 'undefined') {
    document.querySelectorAll('tr.stripboard-row').forEach(r => {
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

  state.dragState.dropTargetOtId = targetOtId;
  state.dragState.dropPosition = pos;
}

export function handleUnifiedRowDragLeave(e) {
  const row = e.currentTarget;
  if (row && row.classList && (!e.relatedTarget || !row.contains(e.relatedTarget))) {
    row.classList.remove('drop-before', 'drop-after');
  }
}

export function handleUnifiedRowDragEnd(e) {
  clearStripDropIndicators();
  resetDragState();
}

export function handleCategoryRowDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const row = e.currentTarget;
  if (row && row.classList) {
    row.classList.add('bg-white/[0.12]', 'ring-1', 'ring-amber-500/50');
  }
}

export function handleCategoryRowDragLeave(e) {
  const row = e.currentTarget;
  if (row && row.classList) {
    row.classList.remove('bg-white/[0.12]', 'ring-1', 'ring-amber-500/50');
  }
}

export function handleCategoryRowDrop(e, groupKey, viewContext) {
  e.preventDefault();
  e.stopPropagation();
  if (e.currentTarget && e.currentTarget.classList) {
    e.currentTarget.classList.remove('bg-white/[0.12]', 'ring-1', 'ring-amber-500/50');
  }
  clearStripDropIndicators();

  const sourceOtId = state.dragState.otId;
  if (!sourceOtId) {
    resetDragState();
    return;
  }

  const orders = getOrders();
  const srcOt = orders.find(o => o.id === sourceOtId);
  if (!srcOt) {
    resetDragState();
    return;
  }

  // Asignar el nuevo valor según la categoría activa de Apple Numbers
  if (state.currentTableGroup === 'client') {
    srcOt.client = groupKey;
  } else if (state.currentTableGroup === 'status') {
    srcOt.status = groupKey;
  } else if (state.currentTableGroup === 'responsible') {
    srcOt.responsible = groupKey;
  } else if (state.currentTableGroup === 'department') {
    const route = getActiveRoute(srcOt);
    route.to = groupKey;
  }

  saveOrders(orders);

  if (state.currentTableSort.field !== 'none') {
    state.currentTableSort = { field: 'none', dir: 'asc' };
    syncSortAndGroupControls();
  }

  resetDragState();
  refreshAllViews();
}

export function handleUnifiedRowDrop(e, targetOtId, viewContext) {
  e.preventDefault();
  e.stopPropagation();
  clearStripDropIndicators();

  const sourceOtId = state.dragState.otId;
  const pos = state.dragState.dropPosition || 'after';

  if (!sourceOtId || sourceOtId === targetOtId) {
    resetDragState();
    return;
  }

  const orders = getOrders();
  const srcIndex = orders.findIndex(o => o.id === sourceOtId);
  const targetIndex = orders.findIndex(o => o.id === targetOtId);

  if (srcIndex === -1 || targetIndex === -1) {
    resetDragState();
    return;
  }

  const srcOt = orders[srcIndex];
  const targetOt = orders[targetIndex];

  // Si está agrupado por categorías de Apple Numbers, sincronizar la categoría si se movió a otro grupo
  if (state.currentTableGroup === 'client') {
    if (srcOt.client !== targetOt.client) {
      srcOt.client = targetOt.client;
    }
  } else if (state.currentTableGroup === 'status') {
    if (srcOt.status !== targetOt.status) {
      srcOt.status = targetOt.status;
    }
  } else if (state.currentTableGroup === 'responsible') {
    if (srcOt.responsible !== targetOt.responsible) {
      srcOt.responsible = targetOt.responsible;
    }
  } else if (state.currentTableGroup === 'department') {
    const srcRoute = getActiveRoute(srcOt);
    const targetRoute = getActiveRoute(targetOt);
    if (srcRoute.to !== targetRoute.to) {
      srcRoute.to = targetRoute.to || 'Tráfico';
    }
  }

  // Reordenar en el array global de OTs
  const [movedOt] = orders.splice(srcIndex, 1);
  const newTargetIndex = orders.findIndex(o => o.id === targetOtId);
  let insertIndex = pos === 'before' ? newTargetIndex : newTargetIndex + 1;
  insertIndex = Math.max(0, Math.min(orders.length, insertIndex));
  orders.splice(insertIndex, 0, movedOt);
  saveOrders(orders);

  // Si estamos en Stripboard Día, sincronizar también el orden de tiras del día
  const currentDate = state.currentStripboardDate || new Date().toISOString().split('T')[0];
  if (viewContext === 'stripboard' || state.currentMainView === 'stripboard') {
    let strips = getDayStrips(currentDate);
    if (!strips || strips.length === 0) {
      strips = orders.filter(o => o.status !== 'Cerrado' && o.status !== 'Cancelado' && o.status !== 'Archivada').map(o => ({
        type: 'ot',
        otId: o.id,
        shiftStatus: 'En Mesa',
        timeSlot: '08:30 - 10:00'
      }));
    }
    const sIdx = strips.findIndex(s => s.otId === sourceOtId);
    const tIdx = strips.findIndex(s => s.otId === targetOtId);
    if (sIdx !== -1 && tIdx !== -1) {
      const [movedStrip] = strips.splice(sIdx, 1);
      const newTIdx = strips.findIndex(s => s.otId === targetOtId);
      let insIdx = pos === 'before' ? newTIdx : newTIdx + 1;
      insIdx = Math.max(0, Math.min(strips.length, insIdx));
      strips.splice(insIdx, 0, movedStrip);
      saveDayStrips(currentDate, strips);
    } else if (tIdx !== -1 && sIdx === -1) {
      let insIdx = pos === 'before' ? tIdx : tIdx + 1;
      insIdx = Math.max(0, Math.min(strips.length, insIdx));
      strips.splice(insIdx, 0, {
        type: 'ot',
        otId: sourceOtId,
        shiftStatus: 'En Mesa',
        timeSlot: '08:30 - 10:00'
      });
      saveDayStrips(currentDate, strips);
    }
  }

  // Desactivar ordenamiento automático para respetar el orden manual establecido
  if (state.currentTableSort.field !== 'none') {
    state.currentTableSort = { field: 'none', dir: 'asc' };
    syncSortAndGroupControls();
  }

  resetDragState();
  refreshAllViews();
}

export function handleTableContainerDragOver(e) {
  e.preventDefault();
}

export function handleTableContainerDrop(e, viewContext) {
  e.preventDefault();
  clearStripDropIndicators();

  const sourceOtId = state.dragState.otId;
  if (!sourceOtId) {
    resetDragState();
    return;
  }

  const orders = getOrders();
  const srcIndex = orders.findIndex(o => o.id === sourceOtId);
  if (srcIndex !== -1) {
    const [movedOt] = orders.splice(srcIndex, 1);
    orders.push(movedOt);
    saveOrders(orders);
  }

  const currentDate = state.currentStripboardDate || new Date().toISOString().split('T')[0];
  if (viewContext === 'stripboard' || state.currentMainView === 'stripboard') {
    let strips = getDayStrips(currentDate);
    if (!strips || strips.length === 0) {
      strips = orders.filter(o => o.status !== 'Cerrado' && o.status !== 'Cancelado' && o.status !== 'Archivada').map(o => ({
        type: 'ot',
        otId: o.id,
        shiftStatus: 'En Mesa',
        timeSlot: '08:30 - 10:00'
      }));
    }
    const sIdx = strips.findIndex(s => s.otId === sourceOtId);
    if (sIdx !== -1) {
      const [movedStrip] = strips.splice(sIdx, 1);
      strips.push(movedStrip);
      saveDayStrips(currentDate, strips);
    } else {
      strips.push({
        type: 'ot',
        otId: sourceOtId,
        shiftStatus: 'En Mesa',
        timeSlot: '08:30 - 10:00'
      });
      saveDayStrips(currentDate, strips);
    }
  }

  if (state.currentTableSort.field !== 'none') {
    state.currentTableSort = { field: 'none', dir: 'asc' };
    syncSortAndGroupControls();
  }

  resetDragState();
  refreshAllViews();
}

// ============================================================================
// MANEJADORES DE EDICIÓN INLINE EN TABLA
// ============================================================================

export function handleTableOtDateChange(otId, field, isoValue) {
  const displayVal = fromIsoToDisplay(isoValue);
  const orders = getOrders();
  const ot = orders.find(o => o.id === otId);
  if (ot) {
    const activeRoute = getActiveRoute(ot);
    activeRoute[field] = displayVal;
    saveOrders(orders);
    refreshAllViews();
    emit('route:change', { otId, routes: ot.routes });
  }
}

export function handleTableOtStatusChange(otId, val) {
  handleGlobalStatusChange(val, otId);
}

export function handleTableOtResponsibleChange(otId, val) {
  handleGlobalResponsibleChange(val, otId);
}

export function handleTableOtNotesChange(otId, val) {
  const orders = getOrders();
  const ot = orders.find(o => o.id === otId);
  if (ot) {
    const activeRoute = getActiveRoute(ot);
    activeRoute.notes = val;
    saveOrders(orders);
    refreshAllViews();
    emit('route:change', { otId, routes: ot.routes });
  }
}

export function handleGlobalStatusChange(val, otId = null, targetSelectId = 'modal-ot-status') {
  const targetId = otId || state.activeOtId;

  if (val === '__NEW__') {
    const newName = typeof window !== 'undefined' ? window.prompt("Nombre del nuevo estado personalizado:") : null;
    if (newName && newName.trim()) {
      const clean = newName.trim();
      const statuses = getStatuses();
      let existing = statuses.find(s => s.name.toLowerCase() === clean.toLowerCase());
      if (!existing) {
        existing = { id: 'st-' + Date.now(), name: clean, color: 'stone' };
        statuses.push(existing);
        saveStatuses(statuses);
      }
      if (targetId) {
        applyOtStatusUpdate(targetId, existing.name);
      }
      if (typeof document !== 'undefined') {
        const sel = document.getElementById(targetSelectId);
        if (sel) sel.value = existing.name;
      }
    } else {
      renderStatusSelects();
      if (targetId) {
        const ot = getOrders().find(o => o.id === targetId);
        if (typeof document !== 'undefined') {
          const sel = document.getElementById(targetSelectId);
          if (sel) sel.value = (ot && ot.status) || 'Tráfico';
        }
      }
    }
    return;
  }

  if (targetId) {
    applyOtStatusUpdate(targetId, val);
  }
}

function applyOtStatusUpdate(otId, statusName) {
  const orders = getOrders();
  const ot = orders.find(o => o.id === otId);
  if (ot) {
    ot.status = statusName;
    saveOrders(orders);
    renderStatusSelects();
    if (typeof document !== 'undefined') {
      const sel = document.getElementById('modal-ot-status');
      if (sel && state.activeOtId === otId) sel.value = statusName;
    }
    refreshAllViews();
  }
}

export function handleGlobalResponsibleChange(val, otId = null, targetSelectId = 'modal-ot-responsible') {
  const targetId = otId || state.activeOtId;

  if (val === '__NEW_RESPONSIBLE__') {
    const newName = typeof window !== 'undefined' ? window.prompt("Nombre propio del nuevo responsable:") : null;
    if (newName && newName.trim()) {
      const clean = addResponsible(newName.trim());
      if (targetId) {
        applyOtResponsibleUpdate(targetId, clean);
      }
      if (typeof document !== 'undefined') {
        const sel = document.getElementById(targetSelectId);
        if (sel) sel.value = clean;
      }
    } else {
      renderResponsibleSelects();
      if (targetId) {
        const ot = getOrders().find(o => o.id === targetId);
        if (typeof document !== 'undefined') {
          const sel = document.getElementById(targetSelectId);
          if (sel) sel.value = (ot && ot.responsible) || 'Andrés J.';
        }
      }
    }
    return;
  }

  if (targetId) {
    applyOtResponsibleUpdate(targetId, val);
  }
}

function applyOtResponsibleUpdate(otId, responsibleName) {
  const orders = getOrders();
  const ot = orders.find(o => o.id === otId);
  if (ot) {
    ot.responsible = responsibleName;
    const activeRoute = getActiveRoute(ot);
    if (!activeRoute.to || activeRoute.to === 'Andrés J.') {
      activeRoute.to = responsibleName;
    }
    saveOrders(orders);
    renderResponsibleSelects();
    if (typeof document !== 'undefined') {
      const sel = document.getElementById('modal-ot-responsible');
      if (sel && state.activeOtId === otId) sel.value = responsibleName;
    }
    refreshAllViews();
  }
}

export function renderStatusSelects() {
  if (typeof document === 'undefined') return;
  const statuses = getStatuses();

  // 1. Selector de Filtro en Barra Principal
  const filterSelect = document.getElementById('status-filter');
  if (filterSelect) {
    const prevFilter = filterSelect.value || 'all';
    filterSelect.innerHTML = `
      <option value="all">Todos los estados</option>
      ${statuses.map(st => `<option value="${escapeHtml(st.name)}">${escapeHtml(st.name)}</option>`).join('')}
    `;
    filterSelect.value = prevFilter;
  }

  // 2. Selector en Modal de Sobre OT
  const modalSelect = document.getElementById('modal-ot-status');
  if (modalSelect) {
    const prevVal = modalSelect.value;
    modalSelect.innerHTML = getStatusOptionsHtml(prevVal || 'Tráfico');
    if (prevVal && prevVal !== '__NEW__') {
      modalSelect.value = prevVal;
    }
  }

  // 3. Selector en Modal de Nueva OT
  const newOtStatus = document.getElementById('new-ot-status');
  if (newOtStatus) {
    const prevVal = newOtStatus.value || 'Tráfico';
    newOtStatus.innerHTML = getStatusOptionsHtml(prevVal !== '__NEW__' ? prevVal : 'Tráfico');
    newOtStatus.value = prevVal !== '__NEW__' ? prevVal : 'Tráfico';
  }
}

export function renderResponsibleSelects() {
  if (typeof document === 'undefined') return;

  // 1. Selector en Modal de Sobre OT
  const modalSelect = document.getElementById('modal-ot-responsible');
  if (modalSelect) {
    const prevVal = modalSelect.value;
    modalSelect.innerHTML = getResponsibleOptionsHtml(prevVal || 'Andrés J.');
    if (prevVal && prevVal !== '__NEW_RESPONSIBLE__') {
      modalSelect.value = prevVal;
    }
  }

  // 2. Selector en Modal de Nueva OT
  const newSelect = document.getElementById('new-ot-responsible');
  if (newSelect) {
    const prevVal = newSelect.value || 'Andrés J.';
    newSelect.innerHTML = getResponsibleOptionsHtml(prevVal !== '__NEW_RESPONSIBLE__' ? prevVal : 'Andrés J.');
    newSelect.value = prevVal !== '__NEW_RESPONSIBLE__' ? prevVal : 'Andrés J.';
  }
}

// ============================================================================
// COMPONENTE DE FILA ÚNICO COMPARTIDO (11 COLUMNAS EXACTAS CON DRAG & DROP)
// ============================================================================

export function renderUnifiedOtRow(ot, activeRoute, viewContext = 'trafico', rowIndex = 0) {
  const isStripboard = viewContext === 'stripboard';
  const clientColor = getClientColorClasses(ot.client);
  const respColor = getResponsibleColorClasses(ot.responsible);
  const safeDesc = ot.title || ot.description || '';
  const safeBrand = ot.brand || ot.product || '--';
  const safeMedia = ot.media || '--';
  const safeRef = ot.ref || '--';
  const safeClient = ot.client || '--';
  const routeNotes = activeRoute ? (activeRoute.notes || '') : '';
  const routeEntry = activeRoute ? activeRoute.entryDate : '';
  const routeDelivery = activeRoute ? activeRoute.deliveryDate : '';

  const dragAttrs = isStripboard ? `
    draggable="true"
    ondragstart="handleUnifiedRowDragStart(event, '${ot.id}', '${viewContext}')"
    ondragover="handleUnifiedRowDragOver(event, '${ot.id}', '${viewContext}')"
    ondragleave="handleUnifiedRowDragLeave(event)"
    ondrop="handleUnifiedRowDrop(event, '${ot.id}', '${viewContext}')"
    ondragend="handleUnifiedRowDragEnd(event)"
  ` : '';

  const gripHtml = isStripboard ? `
    <span class="cursor-grab active:cursor-grabbing text-zinc-500 hover:text-amber-400 transition-colors select-none p-0.5 shrink-0" title="Arrastrar para reorganizar">
      <svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M7 4a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6-12a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
      </svg>
    </span>
  ` : '';

  const rowCursorClass = isStripboard ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer';
  const isOdd = (rowIndex % 2 === 1);
  const zebraClass = isOdd ? 'bg-white/[0.025] stripboard-row-odd' : 'bg-transparent stripboard-row-even';

  return `
    <tr 
      ${dragAttrs}
      class="stripboard-row ${zebraClass} hover:bg-white/[0.08] transition-colors ${rowCursorClass} group text-[11px]" 
      onclick="handleTableRowClick(event, '${ot.id}')"
    >
      <!-- 1. No. OT -->
      <td class="p-2 border-r border-resolve-border align-middle text-[11px]">
        <div class="flex items-center gap-1.5">
          ${gripHtml}
          <span class="font-mono font-bold text-white px-2 py-0.5 bg-black/50 rounded-md border border-resolve-border group-hover:border-amber-400/60 text-[11px] whitespace-nowrap">
            ${ot.id}
          </span>
          ${ot.urgent ? `<span class="w-2 h-2 rounded-full bg-rose-500 shrink-0" title="Urgente"></span>` : ''}
        </div>
      </td>

      <!-- 2. Cliente -->
      <td class="p-2 border-r border-resolve-border align-middle font-medium truncate max-w-[150px] text-[11px]" title="${escapeHtml(safeClient)}">
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${clientColor.badge} font-semibold text-[11px] truncate border max-w-full">
          <span class="w-1.5 h-1.5 rounded-full ${clientColor.dot} shrink-0"></span>
          <span class="truncate">${escapeHtml(safeClient)}</span>
        </span>
      </td>

      <!-- 3. Marca/Producto -->
      <td class="p-2 border-r border-resolve-border align-middle text-[11px] truncate max-w-[160px]" title="${escapeHtml(ot.brand || '')}${ot.product && ot.product !== ot.brand ? ' • ' + escapeHtml(ot.product) : ''}">
        ${ot.brand ? `<span class="text-resolve-dimText font-medium">${escapeHtml(ot.brand)}</span>` : ''}
        ${ot.product && ot.product !== ot.brand ? `${ot.brand ? '<span class="text-zinc-500 font-normal"> • </span>' : ''}<span class="text-zinc-300 font-normal">${escapeHtml(ot.product)}</span>` : (!ot.brand ? `<span class="text-zinc-300">${escapeHtml(safeBrand)}</span>` : '')}
      </td>

      <!-- 4. Medio -->
      <td class="p-2 border-r border-resolve-border align-middle text-[11px] text-zinc-300 truncate max-w-[130px]" title="${escapeHtml(safeMedia)}">
        ${escapeHtml(safeMedia)}
      </td>

      <!-- 5. Referencia -->
      <td class="p-2 border-r border-resolve-border align-middle text-[11px]">
        <span class="font-mono font-semibold text-amber-300 text-[11px] px-1.5 py-0.5 bg-amber-500/10 rounded border border-amber-500/20 truncate block max-w-[120px]" title="Referencia: ${escapeHtml(safeRef)}">
          ${escapeHtml(safeRef)}
        </span>
      </td>

      <!-- 6. Descripción -->
      <td class="p-2 border-r border-resolve-border align-middle text-[11px] font-normal text-zinc-100 group-hover:text-amber-300 transition-colors truncate max-w-[220px]" title="${escapeHtml(safeDesc)}">
        ${escapeHtml(safeDesc)}
      </td>

      <!-- 7. Entrada -->
      <td class="p-2 border-r border-resolve-border align-middle" onclick="event.stopPropagation()">
        <input 
          type="datetime-local" 
          value="${toIsoDateTime(routeEntry)}" 
          onchange="handleTableOtDateChange('${ot.id}', 'entryDate', this.value)" 
          onclick="try { this.showPicker(); } catch(e) {}"
          style="color-scheme: dark;"
          class="w-full bg-black/40 hover:bg-black/60 border border-resolve-border hover:border-amber-400/50 rounded px-1.5 py-0.5 text-[11px] text-zinc-200 font-mono focus:border-amber-500/60 focus:outline-none cursor-pointer"
        />
      </td>

      <!-- 8. Entrega -->
      <td class="p-2 border-r border-resolve-border align-middle" onclick="event.stopPropagation()">
        <input 
          type="datetime-local" 
          value="${toIsoDateTime(routeDelivery)}" 
          onchange="handleTableOtDateChange('${ot.id}', 'deliveryDate', this.value)" 
          onclick="try { this.showPicker(); } catch(e) {}"
          style="color-scheme: dark;"
          class="w-full bg-black/40 hover:bg-black/60 border border-resolve-border hover:border-amber-400/50 rounded px-1.5 py-0.5 text-[11px] text-zinc-200 font-mono focus:border-amber-500/60 focus:outline-none cursor-pointer"
        />
      </td>

      <!-- 9. Estado -->
      <td class="p-2 border-r border-resolve-border align-middle" onclick="event.stopPropagation()">
        <select 
          onchange="handleTableOtStatusChange('${ot.id}', this.value)" 
          class="w-full bg-black/50 border border-resolve-border hover:border-amber-400/50 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-300 focus:border-amber-500/60 focus:outline-none cursor-pointer"
        >
          ${getStatusOptionsHtml(ot.status || 'Tráfico')}
        </select>
      </td>

      <!-- 10. Responsable -->
      <td class="p-2 border-r border-resolve-border align-middle" onclick="event.stopPropagation()">
        <select 
          onchange="handleTableOtResponsibleChange('${ot.id}', this.value)" 
          class="w-full bg-black/50 border border-resolve-border hover:${respColor.border} rounded px-1.5 py-0.5 text-[11px] font-semibold ${respColor.text} focus:border-current focus:outline-none cursor-pointer"
        >
          ${getResponsibleOptionsHtml(ot.responsible || 'Andrés J.')}
        </select>
      </td>

      <!-- 11. Notas -->
      <td class="p-2 align-middle" onclick="event.stopPropagation()">
        <input 
          type="text" 
          value="${escapeHtml(routeNotes)}" 
          onchange="handleTableOtNotesChange('${ot.id}', this.value)" 
          placeholder="Notas..." 
          class="w-full bg-transparent border-0 border-b border-transparent hover:border-resolve-border focus:border-amber-500 focus:ring-0 text-[11px] text-zinc-300 px-1 py-0.5 leading-tight"
        />
      </td>
    </tr>
  `;
}

// ============================================================================
// RENDERIZADOR GENERAL DE TABLA (ORDENAMIENTO + CATEGORÍAS APPLE NUMBERS)
// ============================================================================

export function renderUnifiedTableRows(ordersList, viewContext = 'trafico') {
  if (!ordersList || ordersList.length === 0) {
    return `
      <tr>
        <td colspan="11" class="p-8 text-center text-zinc-400 italic font-medium">
          No hay órdenes de trabajo disponibles en esta vista.
        </td>
      </tr>
    `;
  }

  const sorted = sortOrdersList(ordersList);

  if (state.currentTableGroup === 'none') {
    return sorted.map((ot, idx) => renderUnifiedOtRow(ot, getActiveRoute(ot), viewContext, idx)).join('');
  }

  const groups = new Map();
  const groupFieldLabels = {
    client: 'Cliente',
    status: 'Estado',
    responsible: 'Responsable',
    department: 'Departamento'
  };
  const label = groupFieldLabels[state.currentTableGroup] || 'Grupo';

  sorted.forEach(ot => {
    const route = getActiveRoute(ot);
    let key = '';
    if (state.currentTableGroup === 'client') {
      key = ot.client || 'Sin Cliente';
    } else if (state.currentTableGroup === 'status') {
      key = ot.status || 'Tráfico';
    } else if (state.currentTableGroup === 'responsible') {
      key = ot.responsible || 'Andrés J.';
    } else if (state.currentTableGroup === 'department') {
      key = (route && route.to) ? route.to : 'Sin Departamento';
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ot);
  });

  let globalRowIndex = 0;
  let html = '';
  groups.forEach((items, groupKey) => {
    const isCollapsed = state.collapsedGroupKeys.has(groupKey);
    const isStripboard = viewContext === 'stripboard';
    const dragAttrs = isStripboard ? `
        ondragover="handleCategoryRowDragOver(event)"
        ondragleave="handleCategoryRowDragLeave(event)"
        ondrop="handleCategoryRowDrop(event, '${escapeHtml(groupKey)}', '${viewContext}')"
    ` : '';

    let groupTitleHtml = `<span class="text-amber-300 font-semibold">${escapeHtml(groupKey)}</span>`;
    if (state.currentTableGroup === 'client') {
      const clientColor = getClientColorClasses(groupKey);
      groupTitleHtml = `
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${clientColor.badge} font-bold text-[11px] border">
          <span class="w-1.5 h-1.5 rounded-full ${clientColor.dot}"></span>
          ${escapeHtml(groupKey)}
        </span>
      `;
    }

    html += `
      <tr 
        class="apple-category-row bg-resolve-panel/90 hover:bg-resolve-card transition-colors border-y border-resolve-border cursor-pointer select-none"
        ${dragAttrs}
      >
        <td colspan="11" class="px-3 py-1.5 font-bold text-[11px] text-white" onclick="toggleGroupCollapse('${escapeHtml(groupKey)}')">
          <div class="flex items-center gap-2">
            <span class="text-amber-400 font-mono text-[11px] inline-block transition-transform duration-150 ${isCollapsed ? '' : 'rotate-90'}">▶</span>
            <span class="text-zinc-400 text-[10px] uppercase tracking-wider">${label}:</span>
            ${groupTitleHtml}
            <span class="text-[10px] font-mono text-zinc-400 font-normal ml-1">(${items.length} ${items.length === 1 ? 'OT' : 'OTs'})</span>
          </div>
        </td>
      </tr>
    `;
    if (!isCollapsed) {
      html += items.map(ot => {
        const rowHtml = renderUnifiedOtRow(ot, getActiveRoute(ot), viewContext, globalRowIndex);
        globalRowIndex++;
        return rowHtml;
      }).join('');
    }
  });

  return html;
}

// ============================================================================
// RENDER: ÁRBOL DE BINS (Estilo DaVinci Resolve)
// ============================================================================

export function toggleClientTreeCollapse(clientId) {
  if (!state.collapsedTreeClients) state.collapsedTreeClients = new Set();
  if (state.collapsedTreeClients.has(clientId)) {
    state.collapsedTreeClients.delete(clientId);
  } else {
    state.collapsedTreeClients.add(clientId);
  }
  renderBinTree();
}

/**
 * Expande todos los árboles de clientes mostrando todas sus marcas / carpetas
 */
export function expandAllClientTrees() {
  if (!state.collapsedTreeClients) state.collapsedTreeClients = new Set();
  state.collapsedTreeClients.clear();
  renderBinTree();
}

/**
 * Colapsa todos los árboles de clientes ocultando sus marcas / carpetas
 */
export function collapseAllClientTrees() {
  const clients = getClients();
  state.collapsedTreeClients = new Set(clients.map(c => c.id));
  renderBinTree();
}

/**
 * Conmuta la visualización de badges numéricos en el árbol de clientes
 */
export function toggleTreeBadges() {
  state.hideTreeBadges = !state.hideTreeBadges;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('resolve_hide_tree_badges', state.hideTreeBadges ? 'true' : 'false');
  }
  renderBinTree();
}

export function renderBinTree() {
  if (typeof document === 'undefined') return;

  const sidebar = document.getElementById('sidebar-bin-tree');
  if (sidebar) {
    if (state.hideTreeBadges) sidebar.classList.add('hide-badges');
    else sidebar.classList.remove('hide-badges');
  }

  const badgesLabel = document.getElementById('tree-menu-badges-label');
  if (badgesLabel) {
    badgesLabel.innerText = state.hideTreeBadges ? 'Mostrar badges' : 'Ocultar badges';
  }

  const clients = getClients();
  const orders = getOrders();
  const container = document.getElementById('bin-tree-container');
  if (!container) return;

  // Actualizar contadores generales
  let totalBrands = 0;
  clients.forEach(c => totalBrands += (c.brands ? c.brands.length : 0));
  
  const allCount = document.getElementById('badge-count-all');
  if (allCount) allCount.innerText = orders.length;

  const summaryClients = document.getElementById('tree-summary-clients');
  if (summaryClients) summaryClients.innerText = `${clients.length} Clientes`;

  const summaryBrands = document.getElementById('tree-summary-brands');
  if (summaryBrands) summaryBrands.innerText = `${totalBrands} Marcas`;

  container.innerHTML = clients.map(client => {
    const clientColor = getClientColorClasses(client.name);
    const clientOrders = orders.filter(o => (o.client || '').toLowerCase() === client.name.toLowerCase());
    const isClientActive = (state.selectedTreeFilter.type === 'client' && state.selectedTreeFilter.client === client.name);
    const hasBrands = client.brands && client.brands.length > 0;
    const isCollapsed = state.collapsedTreeClients ? state.collapsedTreeClients.has(client.id) : false;

    return `
      <div class="bin-client-group select-none">
        <div 
          class="flex items-center group rounded-lg hover:bg-white/[0.06] py-1 px-1.5 cursor-pointer transition-colors ${isClientActive ? 'bin-active' : ''}"
          onclick="selectTreeFilter('client', '${escapeHtml(client.name)}', null)"
          ondblclick="toggleClientTreeCollapse('${client.id}')"
          title="Clic para seleccionar / Doble clic para desplegar marcas"
        >
          <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
            <!-- Triángulo / Chevron de despliegue estilo DaVinci Resolve -->
            ${hasBrands ? `
              <button 
                type="button" 
                onclick="event.stopPropagation(); toggleClientTreeCollapse('${client.id}')" 
                title="${isCollapsed ? 'Desplegar marcas' : 'Colapsar marcas'}"
                class="w-4 h-4 flex items-center justify-center text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer shrink-0"
              >
                <svg class="w-2.5 h-2.5 transition-transform duration-150 ${isCollapsed ? '' : 'rotate-90 text-amber-400'}" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 4l8 6-8 6V4z"/>
                </svg>
              </button>
            ` : `
              <span class="w-4 h-4 shrink-0"></span>
            `}

            <!-- Ícono de Carpeta / Bin en el color distintivo del cliente -->
            <svg class="w-3.5 h-3.5 ${clientColor.text} shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
            </svg>

            <!-- Nombre del Cliente: 11px y en Negrita con color atenuado -->
            <span class="font-bold truncate text-resolve-dimText group-hover:text-zinc-200 text-[11px] leading-tight transition-colors ${isClientActive ? 'text-white' : ''}">${escapeHtml(client.name)}</span>

            <!-- Badge numérico inmediatamente al lado del nombre -->
            <span class="bin-tree-badge text-[10px] font-semibold ${clientColor.text} bg-white/[0.06] px-1.5 py-0.2 rounded-full border border-white/[0.05] shrink-0">${clientOrders.length}</span>
          </div>
        </div>

        <!-- Sub-marcas / Sub-bins (Oculto cuando el cliente está colapsado) -->
        ${hasBrands ? `
          <div class="pl-3.5 ml-2.5 border-l border-resolve-border/60 space-y-0.5 mt-0.5 ${isCollapsed ? 'hidden' : ''}">
            ${client.brands.map(brand => {
              const brandOrders = clientOrders.filter(o => ((o.brand || o.product || '').toLowerCase() === brand.toLowerCase()));
              const isBrandActive = (state.selectedTreeFilter.type === 'brand' && state.selectedTreeFilter.client === client.name && state.selectedTreeFilter.brand === brand);

              return `
                <div 
                  onclick="selectTreeFilter('brand', '${escapeHtml(client.name)}', '${escapeHtml(brand)}')" 
                  class="flex items-center px-1.5 py-0.5 rounded-md cursor-pointer group hover:bg-white/[0.05] transition-colors text-[11px] ${isBrandActive ? 'bin-active text-amber-300' : 'text-resolve-dimText'}"
                  title="Clic para filtrar por esta marca"
                >
                  <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
                    <svg class="w-3 h-3 text-zinc-500 group-hover:text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                    <span class="truncate font-medium text-[11px] text-resolve-dimText group-hover:text-zinc-300">${escapeHtml(brand)}</span>
                    <!-- Badge numérico inmediatamente al lado de la marca -->
                    <span class="bin-tree-badge text-[10px] font-medium text-zinc-400 bg-white/[0.04] px-1.5 py-0.2 rounded-full shrink-0">${brandOrders.length}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  updateTreeToolbarState();
}

// ============================================================================
// BARRA DE HERRAMIENTAS CONTEXTUAL DEL ÁRBOL (MENÚ DESPLEGABLE CON HAMBURGUESA)
// ============================================================================

export function toggleTreeActionMenu(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('tree-action-dropdown');
  if (!dropdown) return;
  dropdown.classList.toggle('hidden');
}

export function closeTreeActionMenu() {
  const dropdown = document.getElementById('tree-action-dropdown');
  if (dropdown) dropdown.classList.add('hidden');
}

export function updateTreeToolbarState() {
  if (typeof document === 'undefined') return;
  const label = document.getElementById('tree-action-label');
  const addBtn = document.getElementById('tree-btn-add');
  const addLabel = document.getElementById('tree-menu-add-label');
  const editBtn = document.getElementById('tree-btn-edit');
  const editLabel = document.getElementById('tree-menu-edit-label');
  const dupBtn = document.getElementById('tree-btn-duplicate');
  const dupLabel = document.getElementById('tree-menu-duplicate-label');
  const delBtn = document.getElementById('tree-btn-delete');
  const delLabel = document.getElementById('tree-menu-delete-label');
  if (!addBtn || !editBtn || !dupBtn || !delBtn) return;

  const filter = state.selectedTreeFilter || { type: 'all' };

  if (filter.type === 'client' && filter.client) {
    if (label) {
      label.innerText = filter.client;
      label.title = `Cliente seleccionado: ${filter.client}`;
    }
    if (addLabel) addLabel.innerText = `Añadir Marca a ${filter.client}`;
    addBtn.title = `Añadir Marca a ${filter.client}`;
    if (editLabel) editLabel.innerText = `Editar Cliente`;
    editBtn.title = `Editar Cliente ${filter.client}`;
    if (dupLabel) dupLabel.innerText = `Duplicar Cliente`;
    dupBtn.title = `Duplicar Cliente ${filter.client}`;
    if (delLabel) delLabel.innerText = `Eliminar Cliente`;
    delBtn.title = `Eliminar Cliente ${filter.client}`;

    [editBtn, dupBtn, delBtn].forEach(btn => {
      btn.disabled = false;
      btn.classList.remove('opacity-25', 'cursor-not-allowed', 'pointer-events-none');
    });
  } else if (filter.type === 'brand' && filter.brand) {
    if (label) {
      label.innerText = `${filter.brand}`;
      label.title = `Marca: ${filter.brand} (${filter.client || ''})`;
    }
    if (addLabel) addLabel.innerText = `Añadir Marca a ${filter.client || 'Cliente'}`;
    addBtn.title = `Añadir Marca a ${filter.client || 'Cliente'}`;
    if (editLabel) editLabel.innerText = `Editar Marca`;
    editBtn.title = `Editar Marca ${filter.brand}`;
    if (dupLabel) dupLabel.innerText = `Duplicar Marca`;
    dupBtn.title = `Duplicar Marca ${filter.brand}`;
    if (delLabel) delLabel.innerText = `Eliminar Marca`;
    delBtn.title = `Eliminar Marca ${filter.brand}`;

    [editBtn, dupBtn, delBtn].forEach(btn => {
      btn.disabled = false;
      btn.classList.remove('opacity-25', 'cursor-not-allowed', 'pointer-events-none');
    });
  } else {
    // Master Bin (Todas)
    if (label) {
      label.innerText = 'Clientes';
      label.title = 'Todos los Clientes';
    }
    if (addLabel) addLabel.innerText = 'Nuevo Cliente';
    addBtn.title = 'Crear Nuevo Cliente';
    if (editLabel) editLabel.innerText = 'Editar (Selecciona)';
    editBtn.title = 'Selecciona un cliente o marca para editar';
    if (dupLabel) dupLabel.innerText = 'Duplicar (Selecciona)';
    dupBtn.title = 'Selecciona un cliente o marca para duplicar';
    if (delLabel) delLabel.innerText = 'Eliminar (Selecciona)';
    delBtn.title = 'Selecciona un cliente o marca para eliminar';

    [editBtn, dupBtn, delBtn].forEach(btn => {
      btn.disabled = true;
      btn.classList.add('opacity-25', 'cursor-not-allowed', 'pointer-events-none');
    });
  }
}

export function handleTreeToolbarAdd() {
  const filter = state.selectedTreeFilter || { type: 'all' };
  if (filter.type === 'client' && filter.client) {
    emit('modal:open-brand', { clientName: filter.client });
  } else if (filter.type === 'brand' && filter.client) {
    emit('modal:open-brand', { clientName: filter.client });
  } else {
    emit('modal:open-client', { clientId: null });
  }
}

export function handleTreeToolbarEdit() {
  const filter = state.selectedTreeFilter || { type: 'all' };
  if (filter.type === 'client' && filter.client) {
    const client = getClients().find(c => c.name.toLowerCase() === filter.client.toLowerCase());
    if (client) {
      emit('modal:open-client', { clientId: client.id });
    }
  } else if (filter.type === 'brand' && filter.brand && filter.client) {
    emit('modal:open-brand', { clientName: filter.client, brand: filter.brand });
  }
}

export function handleTreeToolbarDuplicate() {
  const filter = state.selectedTreeFilter || { type: 'all' };
  if (filter.type === 'client' && filter.client) {
    const client = getClients().find(c => c.name.toLowerCase() === filter.client.toLowerCase());
    if (client) duplicateClient(client.id);
  } else if (filter.type === 'brand' && filter.brand && filter.client) {
    duplicateBrand(filter.client, filter.brand);
  }
}

export function handleTreeToolbarDelete() {
  const filter = state.selectedTreeFilter || { type: 'all' };
  if (filter.type === 'client' && filter.client) {
    const client = getClients().find(c => c.name.toLowerCase() === filter.client.toLowerCase());
    if (client && confirm(`¿Eliminar cliente "${client.name}" y todas sus marcas?`)) {
      deleteClient(client.id);
      selectTreeFilter('all', null, null);
    }
  } else if (filter.type === 'brand' && filter.brand && filter.client) {
    if (confirm(`¿Eliminar marca "${filter.brand}" de ${filter.client}?`)) {
      deleteBrand(filter.client, filter.brand);
      selectTreeFilter('client', filter.client, null);
    }
  }
}

export function duplicateClient(clientId) {
  const clients = getClients();
  const source = clients.find(c => c.id === clientId);
  if (!source) return;

  let copyName = `${source.name} (Copia)`;
  let counter = 2;
  while (clients.some(c => c.name.toLowerCase() === copyName.toLowerCase())) {
    copyName = `${source.name} (Copia ${counter++})`;
  }

  const newClient = {
    id: `c-${Date.now()}`,
    name: copyName,
    color: source.color || 'emerald',
    brands: Array.isArray(source.brands) ? [...source.brands] : []
  };
  clients.push(newClient);
  saveClients(clients);
  renderBinTree();
  selectTreeFilter('client', newClient.name, null);
}

export function duplicateBrand(clientName, brandName) {
  const clients = getClients();
  const client = clients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
  if (!client) return;
  if (!client.brands) client.brands = [];

  let copyName = `${brandName} (Copia)`;
  let counter = 2;
  while (client.brands.some(b => b.toLowerCase() === copyName.toLowerCase())) {
    copyName = `${brandName} (Copia ${counter++})`;
  }

  client.brands.push(copyName);
  saveClients(clients);
  renderBinTree();
  selectTreeFilter('brand', client.name, copyName);
}

export function selectTreeFilter(type, client, brand) {
  state.selectedTreeFilter = { type, client, brand };
  closeTreeActionMenu();

  // Si se selecciona un cliente y estaba colapsado, desplegarlo automáticamente
  if (type === 'client' && client && state.collapsedTreeClients) {
    const clients = getClients();
    const found = clients.find(c => (c.name || '').toLowerCase() === client.toLowerCase());
    if (found && state.collapsedTreeClients.has(found.id)) {
      state.collapsedTreeClients.delete(found.id);
    }
  }

  // Resaltar Master Bin si corresponde
  if (typeof document !== 'undefined') {
    const allBinBtn = document.getElementById('bin-all');
    if (allBinBtn) {
      if (type === 'all') {
        allBinBtn.classList.add('bin-active');
      } else {
        allBinBtn.classList.remove('bin-active');
      }
    }
  }

  updateTreeToolbarState();
  renderBinTree();
  renderTrafficDesk();
}

// ============================================================================
// RENDER: MESA DE OTs (Tarjetas de Trabajo y Lista de Tráfico)
// ============================================================================

export function renderTrafficDesk() {
  if (typeof document === 'undefined') return;

  const orders = getOrders();
  const searchQuery = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('status-filter')?.value || 'all';

  // Actualizar Breadcrumb
  const breadcrumb = document.getElementById('current-bin-breadcrumb');
  if (breadcrumb) {
    if (state.selectedTreeFilter.type === 'all') breadcrumb.innerText = "Master Bin (Todas las OTs)";
    else if (state.selectedTreeFilter.type === 'client') breadcrumb.innerText = `${state.selectedTreeFilter.client}`;
    else if (state.selectedTreeFilter.type === 'brand') breadcrumb.innerText = `${state.selectedTreeFilter.client} > ${state.selectedTreeFilter.brand}`;
  }

  // Filtrado base (por Bin Tree, Estado y Búsqueda)
  const baseFiltered = orders.filter(ot => {
    if (state.selectedTreeFilter.type === 'client') {
      if ((ot.client || '').toLowerCase() !== (state.selectedTreeFilter.client || '').toLowerCase()) return false;
    } else if (state.selectedTreeFilter.type === 'brand') {
      const matchClient = (ot.client || '').toLowerCase() === (state.selectedTreeFilter.client || '').toLowerCase();
      const matchBrand = (ot.brand || ot.product || '').toLowerCase() === (state.selectedTreeFilter.brand || '').toLowerCase();
      if (!matchClient || !matchBrand) return false;
    }

    // Filtro por Estado
    if (statusFilter !== 'all' && ot.status !== statusFilter) return false;

    // Búsqueda libre
    if (searchQuery) {
      const inId = ot.id.toLowerCase().includes(searchQuery);
      const inRef = (ot.ref || '').toLowerCase().includes(searchQuery);
      const inTitle = (ot.title || '').toLowerCase().includes(searchQuery);
      const inClient = (ot.client || '').toLowerCase().includes(searchQuery);
      const inProduct = (ot.product || '').toLowerCase().includes(searchQuery);
      const inBrief = (ot.brief || '').toLowerCase().includes(searchQuery);
      return inId || inRef || inTitle || inClient || inProduct || inBrief;
    }

    return true;
  });

  // Conteo de OTs urgentes en el contexto actual
  const urgentCount = baseFiltered.filter(o => o.urgent).length;

  // Si no hay urgentes en esta vista, desactivar el filtro automáticamente
  if (urgentCount === 0 && state.filterUrgentOnly) {
    state.filterUrgentOnly = false;
  }

  // Filtrado final (aplica filtro de solo urgentes si el usuario lo activó)
  let filtered = state.filterUrgentOnly ? baseFiltered.filter(o => o.urgent) : baseFiltered;

  const countBadge = document.getElementById('current-bin-count');
  if (countBadge) {
    countBadge.innerText = `${filtered.length} OTs encontradas${state.filterUrgentOnly ? ' (Solo Urgentes)' : ''}`;
  }
  
  const footerCount = document.getElementById('footer-active-count');
  if (footerCount) {
    footerCount.innerText = `${orders.filter(o => o.status !== 'Cerrado' && o.status !== 'Cancelado' && o.status !== 'Archivada').length} Activas en Tráfico`;
  }

  // Control de visibilidad de acciones de grupo (Abrir todo / Cerrar todo)
  const groupActions = document.getElementById('trafico-group-actions');
  if (groupActions) {
    if (state.currentTableGroup !== 'none') {
      groupActions.classList.remove('hidden');
      groupActions.classList.add('flex');
    } else {
      groupActions.classList.add('hidden');
      groupActions.classList.remove('flex');
    }
  }

  // Indicador interactivo de Urgentes (Filtro toggle On/Off al hacer clic)
  const urgentIndicator = document.getElementById('trafico-urgent-indicator');
  if (urgentIndicator) {
    if (urgentCount > 0) {
      if (state.filterUrgentOnly) {
        urgentIndicator.className = "flex items-center gap-1.5 text-[11px] font-mono text-rose-200 bg-rose-500/20 border border-rose-500/50 px-2 py-0.5 rounded shadow-xs cursor-pointer transition-all";
        urgentIndicator.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
          <span class="font-bold">${urgentCount} ${urgentCount === 1 ? 'Urgente' : 'Urgentes'}</span>
          <span class="text-[9px] bg-rose-500/30 px-1 rounded text-rose-300 font-sans ml-0.5">✕ Solo Urgentes</span>
        `;
        urgentIndicator.title = "Filtro activo: mostrando solo OTs urgentes. Clic para ver todas.";
      } else {
        urgentIndicator.className = "flex items-center gap-1.5 text-[11px] font-mono text-rose-300 hover:text-white hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] px-1.5 py-0.5 rounded cursor-pointer transition-all font-semibold";
        urgentIndicator.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-rose-500 shadow-xs shadow-rose-500/50 shrink-0"></span>
          <span>${urgentCount} ${urgentCount === 1 ? 'Urgente' : 'Urgentes'}</span>
        `;
        urgentIndicator.title = `Clic para filtrar y mostrar solo las ${urgentCount} OTs urgentes`;
      }
    } else {
      urgentIndicator.className = "flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 px-1.5 py-0.5 rounded cursor-default border border-transparent";
      urgentIndicator.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-zinc-600 shrink-0"></span>
        <span>0 Urgentes</span>
      `;
      urgentIndicator.title = "Sin OTs urgentes en esta vista";
    }
  }

  const grid = document.getElementById('envelopes-grid');
  const listContainer = document.getElementById('envelopes-list-container');
  const listBody = document.getElementById('envelopes-list-body');
  const emptyState = document.getElementById('empty-state');

  if (filtered.length === 0) {
    if (grid) grid.innerHTML = '';
    if (listBody) listBody.innerHTML = '';
    if (emptyState) {
      emptyState.classList.remove('hidden');
      emptyState.classList.add('flex');
    }
    return;
  }

  if (emptyState) {
    emptyState.classList.add('hidden');
    emptyState.classList.remove('flex');
  }

  // 1. RENDER VISTA EN TARJETAS (CUADRÍCULA)
  if (grid) {
    grid.innerHTML = filtered.map(ot => {
      const clientColor = getClientColorClasses(ot.client);
      const lastRoute = ot.routes && ot.routes.length > 0 ? ot.routes[ot.routes.length - 1] : null;
      const totalFiles = ot.mediaFiles ? ot.mediaFiles.length : 0;
      let statusClass = getStatusBadgeClass(ot.status);

      return `
      <div class="bg-white/[0.025] hover:bg-white/[0.05] border ${ot.urgent ? 'border-rose-500/60 shadow-lg shadow-rose-950/20' : 'border-resolve-border hover:border-amber-400/50 hover:shadow-xl hover:shadow-black/60'} rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 group">
        <div>
          <!-- Cabecera de la Tarjeta OT -->
          <div class="flex items-center justify-between pb-2.5 border-b border-resolve-border/60">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-bold text-white px-2 py-0.5 bg-black/40 rounded-md border border-resolve-border">
                ${ot.id}
              </span>
              ${ot.ref ? `
                <span class="font-mono text-[11px] font-semibold text-amber-300 px-2 py-0.5 bg-amber-500/10 rounded-full border border-amber-500/25 truncate max-w-[120px]" title="Referencia: ${escapeHtml(ot.ref)}">
                  ${escapeHtml(ot.ref)}
                </span>
              ` : ''}
              ${ot.urgent ? `
                <span class="text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full tracking-wider uppercase">
                  URGENTE
                </span>
              ` : ''}
            </div>
            <span class="text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${statusClass}">
              ${escapeHtml(ot.status || 'Tráfico')}
            </span>
          </div>

          <!-- Contenido y Metadatos -->
          <div class="mt-3 cursor-pointer" onclick="handleTableRowClick(event, '${ot.id}')">
            <div class="flex items-center gap-1.5 truncate mb-1">
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${clientColor.badge} font-bold text-[10px] tracking-wide uppercase border shrink-0">
                <span class="w-1.5 h-1.5 rounded-full ${clientColor.dot}"></span>
                ${escapeHtml(ot.client || '')}
              </span>
              ${ot.brand ? `<span class="text-[11px] font-medium text-resolve-dimText uppercase tracking-wide truncate">• ${escapeHtml(ot.brand)}</span>` : ''}
              ${ot.product && ot.product !== ot.brand ? `<span class="text-[11px] font-medium text-zinc-500 uppercase tracking-wide truncate">• ${escapeHtml(ot.product)}</span>` : ''}
            </div>
            <h3 class="font-semibold text-sm text-zinc-100 mt-1 group-hover:text-amber-400 transition-colors leading-snug tracking-tight">
              ${escapeHtml(ot.title || ot.description || '')}
            </h3>
            <div class="text-[11px] text-zinc-400 mt-1 flex items-center justify-between gap-1.5">
              <span class="truncate"><span class="text-zinc-500 font-medium">Medio:</span> <span class="text-zinc-300">${escapeHtml(ot.media || 'No especificado')}</span></span>
              <span class="shrink-0"><span class="text-zinc-500 font-medium">Resp:</span> <span class="${getResponsibleColorClasses(ot.responsible || (lastRoute ? lastRoute.to : 'Andrés J.')).text} font-semibold">${escapeHtml(ot.responsible || (lastRoute ? lastRoute.to : 'Andrés J.'))}</span></span>
            </div>

            <!-- Último Relevo -->
            <div class="mt-3 bg-black/25 p-3 rounded-xl border border-white/[0.06] text-xs">
              <div class="flex items-center justify-between text-[10px] text-resolve-dimText mb-1">
                <span class="font-semibold text-amber-400 tracking-wider">ÚLTIMO RELEVO</span>
                <span class="font-mono text-zinc-500 text-[10px]">${lastRoute ? (lastRoute.deliveryDate || lastRoute.entryDate || '--') : '--'}</span>
              </div>
              ${lastRoute ? `
                <div class="font-semibold text-white text-[11px] flex items-center gap-1.5">
                  <span class="text-amber-300">${escapeHtml(lastRoute.from || 'Tráfico')}</span>
                  <span class="text-zinc-600">→</span>
                  <span class="text-sky-300">${escapeHtml(lastRoute.to || 'Andrés J.')}</span>
                </div>
                <p class="text-[11px] text-zinc-300 line-clamp-2 mt-0.5">
                  "${escapeHtml(lastRoute.task || '')}"
                </p>
              ` : `
                <span class="text-zinc-500 italic text-[11px]">Sin movimientos registrados.</span>
              `}
            </div>
          </div>
        </div>

        <!-- Footer Tarjeta (Media Pool Preview & Abrir) -->
        <div class="mt-4 pt-2.5 border-t border-resolve-border/60 flex items-center justify-between text-xs">
          <div class="flex items-center gap-1.5 text-zinc-400 text-[11px] font-medium">
            <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
            <span>${totalFiles} items en Media Pool</span>
          </div>
          <button onclick="handleTableRowClick(event, '${ot.id}')" class="px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.10] text-zinc-200 hover:text-white rounded-lg border border-resolve-border font-medium text-xs flex items-center gap-1.5 transition-all active:scale-[0.98]">
            <span>Inspeccionar</span>
            <span class="text-amber-400">→</span>
          </button>
        </div>
      </div>
      `;
    }).join('');
  }

  // 2. RENDER VISTA EN LISTA (TABLA UNIFICADA DE 11 COLUMNAS CON APPLE NUMBERS CATEGORIES)
  if (listBody) {
    listBody.innerHTML = renderUnifiedTableRows(filtered, 'trafico');
    syncSortAndGroupControls();
  }
}

// ============================================================================
// CONMUTADOR DE VISTA PRINCIPAL (TARJETAS vs LISTA)
// ============================================================================

export function setMainDeskView(mode) {
  state.currentDeskMode = mode;
  if (typeof document === 'undefined') return;

  const btnGrid = document.getElementById('view-toggle-grid');
  const btnList = document.getElementById('view-toggle-list');
  const gridContainer = document.getElementById('envelopes-grid');
  const listContainer = document.getElementById('envelopes-list-container');

  if (mode === 'grid') {
    if (btnGrid) btnGrid.className = "h-5 px-2 rounded text-[11px] font-medium flex items-center gap-1 transition-all bg-white/[0.12] text-white border border-white/[0.08] shadow-xs cursor-pointer";
    if (btnList) btnList.className = "h-5 px-2 rounded text-[11px] font-medium flex items-center gap-1 transition-all text-resolve-dimText hover:text-white cursor-pointer";
    if (gridContainer) gridContainer.classList.remove('hidden');
    if (listContainer) listContainer.classList.add('hidden');
  } else {
    if (btnList) btnList.className = "h-5 px-2 rounded text-[11px] font-medium flex items-center gap-1 transition-all bg-white/[0.12] text-white border border-white/[0.08] shadow-xs cursor-pointer";
    if (btnGrid) btnGrid.className = "h-5 px-2 rounded text-[11px] font-medium flex items-center gap-1 transition-all text-resolve-dimText hover:text-white cursor-pointer";
    if (gridContainer) gridContainer.classList.add('hidden');
    if (listContainer) listContainer.classList.remove('hidden');
  }

  renderTrafficDesk();
}

// ============================================================================
// CONTROL DE BARRA LATERAL COLAPSABLE (BIN TREE)
// ============================================================================

export function toggleSidebar() {
  if (typeof document === 'undefined') return;
  const sidebar = document.getElementById('sidebar-bin-tree');
  const rail = document.getElementById('sidebar-collapsed-rail');
  if (!sidebar || !rail) return;

  state.isSidebarCollapsed = !state.isSidebarCollapsed;

  if (state.isSidebarCollapsed) {
    sidebar.classList.add('hidden');
    rail.classList.remove('hidden');
  } else {
    sidebar.classList.remove('hidden');
    rail.classList.add('hidden');
  }
}

/**
 * Inicializador del redimensionador interactivo del panel izquierdo (Bin Tree)
 * Permite ajustar el ancho entre 180px y 480px y persiste la preferencia en localStorage.
 */
export function initSidebarResizer() {
  if (typeof document === 'undefined') return;
  const resizer = document.getElementById('sidebar-resizer');
  const sidebar = document.getElementById('sidebar-bin-tree');
  if (!resizer || !sidebar) return;

  // Restaurar ancho previo si existe
  try {
    const savedWidth = localStorage.getItem('trafikeitor_sidebar_width');
    if (savedWidth) {
      const num = parseInt(savedWidth, 10);
      if (!isNaN(num) && num >= 150 && num <= 380) {
        if (num >= 210 || num === 185 || num === 195) {
          sidebar.style.width = '200px';
          localStorage.setItem('trafikeitor_sidebar_width', '200');
        } else {
          sidebar.style.width = `${num}px`;
        }
      }
    }
  } catch (_) {}

  let isResizing = false;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent) => {
      if (!isResizing) return;
      const sidebarRect = sidebar.getBoundingClientRect();
      const newWidth = moveEvent.clientX - sidebarRect.left;
      const clampedWidth = Math.min(Math.max(newWidth, 150), 380);
      sidebar.style.width = `${clampedWidth}px`;
    };

    const onMouseUp = () => {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      try {
        const widthVal = parseInt(sidebar.style.width, 10);
        if (!isNaN(widthVal)) {
          localStorage.setItem('trafikeitor_sidebar_width', String(widthVal));
        }
      } catch (_) {}
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

// ============================================================================
// REFRESCO COORDINADO DE TODAS LAS VISTAS
// ============================================================================

export function refreshAllViews() {
  renderTrafficDesk();
  emit('views:refresh');
}

// Escuchar eventos globales de sincronización y mutación
on('data:sync', () => {
  renderBinTree();
  renderTrafficDesk();
});

on('data:ready', () => {
  renderBinTree();
  renderTrafficDesk();
});

on('views:refresh', () => {
  renderTrafficDesk();
});

// ============================================================================
// EXPOSICIÓN GLOBAL EN WINDOW (PARA MANEJADORES INLINE DURANTE LA TRANSICIÓN)
// ============================================================================
if (typeof window !== 'undefined') {
  window.setTableSort = setTableSort;
  window.toggleTableSortDirection = toggleTableSortDirection;
  window.setTableGroup = setTableGroup;
  window.toggleGroupCollapse = toggleGroupCollapse;
  window.expandAllTableGroups = expandAllTableGroups;
  window.collapseAllTableGroups = collapseAllTableGroups;
  window.toggleUrgentFilter = toggleUrgentFilter;
  window.syncSortAndGroupControls = syncSortAndGroupControls;
  window.handleTableRowClick = handleTableRowClick;
  window.handleUnifiedRowDragStart = handleUnifiedRowDragStart;
  window.handleUnifiedRowDragOver = handleUnifiedRowDragOver;
  window.handleUnifiedRowDragLeave = handleUnifiedRowDragLeave;
  window.handleUnifiedRowDragEnd = handleUnifiedRowDragEnd;
  window.handleCategoryRowDragOver = handleCategoryRowDragOver;
  window.handleCategoryRowDragLeave = handleCategoryRowDragLeave;
  window.handleCategoryRowDrop = handleCategoryRowDrop;
  window.handleUnifiedRowDrop = handleUnifiedRowDrop;
  window.handleTableContainerDragOver = handleTableContainerDragOver;
  window.handleTableContainerDrop = handleTableContainerDrop;
  window.handleTableOtDateChange = handleTableOtDateChange;
  window.handleTableOtStatusChange = handleTableOtStatusChange;
  window.handleTableOtResponsibleChange = handleTableOtResponsibleChange;
  window.handleTableOtNotesChange = handleTableOtNotesChange;
  window.renderUnifiedOtRow = renderUnifiedOtRow;
  window.renderUnifiedTableRows = renderUnifiedTableRows;
  window.renderBinTree = renderBinTree;
  window.toggleClientTreeCollapse = toggleClientTreeCollapse;
  window.expandAllClientTrees = expandAllClientTrees;
  window.collapseAllClientTrees = collapseAllClientTrees;
  window.toggleTreeBadges = toggleTreeBadges;
  window.toggleTreeActionMenu = toggleTreeActionMenu;
  window.closeTreeActionMenu = closeTreeActionMenu;
  window.selectTreeFilter = selectTreeFilter;
  window.updateTreeToolbarState = updateTreeToolbarState;
  window.handleTreeToolbarAdd = handleTreeToolbarAdd;
  window.handleTreeToolbarEdit = handleTreeToolbarEdit;
  window.handleTreeToolbarDuplicate = handleTreeToolbarDuplicate;
  window.handleTreeToolbarDelete = handleTreeToolbarDelete;
  window.duplicateClient = duplicateClient;
  window.duplicateBrand = duplicateBrand;
  window.renderTrafficDesk = renderTrafficDesk;
  window.setMainDeskView = setMainDeskView;
  window.toggleSidebar = toggleSidebar;
  window.initSidebarResizer = initSidebarResizer;
  window.refreshAllViews = refreshAllViews;
  window.handleGlobalStatusChange = handleGlobalStatusChange;
  window.handleGlobalResponsibleChange = handleGlobalResponsibleChange;
  window.getClientColorClasses = getClientColorClasses;
  window.getResponsibleColorClasses = getResponsibleColorClasses;
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('tree-action-dropdown');
    const menuBtn = document.getElementById('tree-menu-btn');
    if (dropdown && !dropdown.classList.contains('hidden')) {
      if (!dropdown.contains(e.target) && !menuBtn?.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    }
  });
}

