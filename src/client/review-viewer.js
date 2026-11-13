import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const GUEST_STORAGE_KEY = 'trafikeitor_guest_name';
const PIN_COLOR_STORAGE_KEY = 'trafikeitor_pin_color';

const PIN_COLOR_PALETTE = [
  { id: 'teal', label: 'Turquesa', bg: 'bg-[#0BA2AC] border-white text-white', swatch: '#0BA2AC' },
  { id: 'amber', label: 'Amarillo', bg: 'bg-amber-400 border-white text-stone-950', swatch: '#fbbf24' },
  { id: 'pink', label: 'Magenta', bg: 'bg-pink-500 border-white text-white', swatch: '#ec4899' },
  { id: 'red', label: 'Rojo', bg: 'bg-red-500 border-white text-white', swatch: '#ef4444' },
  { id: 'white', label: 'Blanco', bg: 'bg-white border-zinc-900 text-stone-950', swatch: '#ffffff' },
  { id: 'black', label: 'Negro', bg: 'bg-zinc-900 border-white text-white', swatch: '#18181b' },
];

const state = {
  token: '',
  order: null,
  activeMedia: null,
  versions: [],
  threads: [],
  messages: [],
  viewerSession: { isAgency: false, name: null },
  guestName: localStorage.getItem(GUEST_STORAGE_KEY) || '',
  pinColor: localStorage.getItem(PIN_COLOR_STORAGE_KEY) || 'teal',
  zoom: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  hideResolved: false,
  selectedThreadId: null,
  collapsedThreads: new Set(),
  pendingPin: null,
  pdfDoc: null,
  pdfPage: 1,
  pdfTotalPages: 1,
  eventSource: null,
};

const el = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getReviewTokenFromUrl() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts[0] === 'review' && pathParts[1]) return pathParts[1];
  const qs = new URLSearchParams(window.location.search);
  return qs.get('token') || '';
}

function getActiveAuthorName() {
  if (state.viewerSession?.isAgency && state.viewerSession.name) {
    return state.viewerSession.name;
  }
  return state.guestName.trim();
}

function ensureAuthorName(onReady) {
  const existing = getActiveAuthorName();
  if (existing) {
    onReady(existing);
    return;
  }
  const modal = el('rv-guest-modal');
  const input = el('rv-guest-input');
  modal.classList.remove('hidden');
  input.value = '';
  input.focus();
  state._pendingAuthorCallback = onReady;
}

function updateAuthorPill() {
  const label = el('rv-author-name-label');
  const name = getActiveAuthorName();
  if (label) {
    label.textContent = state.viewerSession?.isAgency
      ? `${name} (Agencia)`
      : (name || 'Invitado');
  }
}

function applyTransform() {
  const stage = el('rv-transform-stage');
  if (!stage) return;
  stage.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  const zoomResetBtn = el('rv-zoom-reset');
  if (zoomResetBtn) zoomResetBtn.textContent = `${Math.round(state.zoom * 100)}%`;

  // Contra-escalado dinámico de pines para mantener tamaño legible
  const pins = document.querySelectorAll('[data-pin-marker="1"]');
  const inv = 1 / state.zoom;
  pins.forEach((pin) => {
    pin.style.transform = `translate(-50%, -50%) scale(${inv})`;
  });
}

function getRenderableSource(media) {
  if (!media) return { kind: 'none', src: '' };
  if (media.previewUrl) return { kind: 'image', src: media.previewUrl };
  if (media.type === 'pdf' || media.ext === 'pdf') return { kind: 'pdf', src: media.url };
  if (media.type === 'video') return { kind: 'video', src: media.url };
  return { kind: 'image', src: media.url };
}

async function renderPdfPage(pageNum) {
  if (!state.pdfDoc) return;
  const canvas = el('rv-base-pdf');
  const ctx = canvas.getContext('2d');
  const page = await state.pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  el('rv-pdf-page-label').textContent = `${state.pdfPage} / ${state.pdfTotalPages}`;
  renderPins();
}

async function renderMediaStage() {
  const stage = el('rv-transform-stage');
  const imgEl = el('rv-base-img');
  const pdfEl = el('rv-base-pdf');
  const videoEl = el('rv-base-video');
  const pager = el('rv-pdf-pager');

  imgEl.classList.add('hidden');
  pdfEl.classList.add('hidden');
  videoEl.classList.add('hidden');
  pager.classList.add('hidden');
  pager.classList.remove('flex');

  const emptyEl = el('rv-empty-state');
  const errMsgEl = el('rv-error-msg');
  if (emptyEl) emptyEl.classList.add('hidden');

  const source = getRenderableSource(state.activeMedia);
  if (source.kind === 'none' || !source.src || source.src === '#') {
    stage.classList.add('hidden');
    if (emptyEl && errMsgEl) {
      emptyEl.classList.remove('hidden');
      errMsgEl.textContent = 'Esta pieza no tiene una vista previa directa disponible.';
    }
    return;
  }

  stage.classList.remove('hidden');

  try {
    if (source.kind === 'pdf') {
      pdfEl.classList.remove('hidden');
      pager.classList.remove('hidden');
      pager.classList.add('flex');
      state.pdfDoc = await pdfjsLib.getDocument(source.src).promise;
      state.pdfTotalPages = state.pdfDoc.numPages || 1;
      state.pdfPage = Math.min(state.pdfPage, state.pdfTotalPages);
      await renderPdfPage(state.pdfPage);
    } else if (source.kind === 'video') {
      videoEl.onerror = () => {
        stage.classList.add('hidden');
        if (emptyEl && errMsgEl) {
          emptyEl.classList.remove('hidden');
          errMsgEl.textContent = 'No se pudo reproducir el video en el navegador.';
        }
      };
      videoEl.src = source.src;
      videoEl.classList.remove('hidden');
    } else {
      imgEl.onload = () => renderPins();
      imgEl.onerror = () => {
        stage.classList.add('hidden');
        if (emptyEl && errMsgEl) {
          emptyEl.classList.remove('hidden');
          errMsgEl.innerHTML = `Vista previa no soportada para este formato. ${state.activeMedia?.url && state.activeMedia.url !== '#' ? `<a href="${escapeHtml(state.activeMedia.url)}" download class="text-[#0BA2AC] underline ml-1">Descargar archivo</a>` : ''}`;
        }
      };
      imgEl.src = source.src;
      imgEl.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Error cargando pieza en visor:', err);
    stage.classList.add('hidden');
    if (emptyEl && errMsgEl) {
      emptyEl.classList.remove('hidden');
      errMsgEl.innerHTML = `No se pudo renderizar la pieza. ${state.activeMedia?.url && state.activeMedia.url !== '#' ? `<a href="${escapeHtml(state.activeMedia.url)}" download class="text-[#0BA2AC] underline ml-1">Descargar archivo</a>` : ''}`;
    }
  }
}

function renderStatusBadge() {
  const badge = el('rv-status-badge');
  const status = state.activeMedia?.reviewStatus || 'in_review';
  const map = {
    draft: { text: 'Borrador', cls: 'border-resolve-border bg-white/[0.04] text-resolve-dimText' },
    in_review: { text: 'En Revisión', cls: 'border-[#0BA2AC]/40 bg-[#0BA2AC]/15 text-[#0BA2AC]' },
    changes_requested: { text: 'Cambios Solicitados', cls: 'border-amber-500/40 bg-amber-500/15 text-amber-300' },
    approved: { text: 'Aprobada', cls: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' },
  };
  const cfg = map[status] || map.in_review;
  badge.textContent = cfg.text;
  badge.className = `text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.cls}`;
}

function renderVersionSelect() {
  const sel = el('rv-version-select');
  if (!state.versions || state.versions.length <= 1) {
    sel.classList.add('hidden');
    return;
  }
  sel.classList.remove('hidden');
  sel.innerHTML = state.versions
    .map(
      (v) =>
        `<option value="${escapeHtml(v.id)}" ${v.id === state.activeMedia?.id ? 'selected' : ''}>v${v.versionNumber || 1} — ${escapeHtml(v.name)}</option>`
    )
    .join('');
}

function renderPins() {
  const overlay = el('rv-overlay');
  if (!overlay) return;

  const isPdf = getRenderableSource(state.activeMedia).kind === 'pdf';
  const visibleThreads = state.threads.filter((t) => {
    if (state.hideResolved && t.isResolved) return false;
    if (isPdf && (t.pageNumber || 1) !== state.pdfPage) return false;
    return true;
  });

  const inv = 1 / state.zoom;
  overlay.innerHTML = visibleThreads
    .map((t) => {
      const active = t.id === state.selectedThreadId;
      const pinPalette = PIN_COLOR_PALETTE.find((c) => c.id === (t.pinColor || 'teal')) || PIN_COLOR_PALETTE[0];
      const bg = t.isResolved
        ? 'bg-emerald-500 border-emerald-200 text-stone-950'
        : pinPalette.bg;
      const ringCls = active
        ? 'ring-2 ring-amber-300 ring-offset-1 ring-offset-black/70'
        : 'ring-2 ring-black/60';
      const firstMsg = state.messages.find((m) => m.threadId === t.id);
      const tooltipAuthor = firstMsg?.authorName || t.authorName || 'Usuario';
      const tooltipBody = firstMsg?.content || 'Sin mensaje';
      const tooltipTitle = `#${t.pinNumber} · ${tooltipAuthor}: ${tooltipBody}`;
      return `<button type="button" data-pin-marker="1" data-thread-id="${escapeHtml(t.id)}"
        title="${escapeHtml(tooltipTitle)}"
        style="left:${t.xPercent * 100}%; top:${t.yPercent * 100}%; transform:translate(-50%,-50%) scale(${inv}); touch-action:none;"
        class="group absolute w-7 h-7 rounded-full border-2 ${bg} ${ringCls} font-mono text-[11px] font-bold flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform hover:scale-110 shadow-lg">
        ${!t.isResolved ? `<span class="pointer-events-none absolute -inset-1 rounded-full animate-ping opacity-40" style="background-color:${pinPalette.swatch}; animation-duration:2.6s;"></span>` : ''}
        <span class="relative z-10">${t.pinNumber}</span>
        <div class="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 max-w-[240px] px-2.5 py-2 rounded-lg bg-[#121318]/95 border border-white/15 shadow-2xl text-left font-sans z-30">
          <div class="flex items-center justify-between gap-1 text-[10px] font-semibold text-amber-300 mb-0.5">
            <span class="truncate">#${t.pinNumber} · ${escapeHtml(tooltipAuthor)}</span>
            ${t.isResolved ? '<span class="text-emerald-400 shrink-0">✓ Resuelto</span>' : ''}
          </div>
          <p class="text-[11px] font-normal text-zinc-200 leading-snug line-clamp-3 break-words">${escapeHtml(tooltipBody)}</p>
        </div>
      </button>`;
    })
    .join('');

  overlay.querySelectorAll('[data-pin-marker="1"]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.altKey) return;
      e.stopPropagation();
      const tid = btn.getAttribute('data-thread-id');
      const thread = state.threads.find((th) => th.id === tid);
      if (!thread) return;

      const startX = e.clientX;
      const startY = e.clientY;
      let moved = false;

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        const rect = overlay.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const nextX = Number(Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)).toFixed(4));
        const nextY = Number(Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)).toFixed(4));
        thread.xPercent = nextX;
        thread.yPercent = nextY;
        btn.style.left = `${nextX * 100}%`;
        btn.style.top = `${nextY * 100}%`;
      };

      const onUp = async () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (!moved) {
          selectThread(tid);
          return;
        }
        state._justDraggedPin = true;
        setTimeout(() => { state._justDraggedPin = false; }, 50);
        try {
          await fetch(`/api/public/review/${encodeURIComponent(state.token)}/threads/${encodeURIComponent(tid)}/position`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ xPercent: thread.xPercent, yPercent: thread.yPercent }),
          });
        } catch (err) {
          console.error('Error reubicando pin:', err);
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
}

function renderThreadsSidebar() {
  const list = el('rv-threads-list');
  const countEl = el('rv-threads-count');
  const visibleThreads = state.hideResolved
    ? state.threads.filter((t) => !t.isResolved)
    : state.threads;

  const generalMessages = state.messages.filter((m) => !m.threadId);
  countEl.textContent = `${visibleThreads.length} pines`;

  const threadsHtml = visibleThreads
    .map((t) => {
      const msgs = state.messages.filter((m) => m.threadId === t.id);
      const isSelected = t.id === state.selectedThreadId;
      const borderCls = isSelected ? 'border-[#0BA2AC] bg-[#0BA2AC]/10' : 'border-resolve-border bg-resolve-surface';

      const pinPalette = PIN_COLOR_PALETTE.find((c) => c.id === (t.pinColor || 'teal')) || PIN_COLOR_PALETTE[0];
      const isCollapsed = state.collapsedThreads.has(t.id);
      const firstMsgPreview = msgs[0]?.content || 'Sin mensaje';

      return `
      <div id="rv-thread-card-${escapeHtml(t.id)}" data-card-thread-id="${escapeHtml(t.id)}" class="rounded-xl border ${borderCls} p-3 space-y-2 cursor-pointer transition-colors">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <button type="button" data-toggle-collapse="${escapeHtml(t.id)}" title="${isCollapsed ? 'Expandir hilo' : 'Contraer hilo'}" class="w-6 h-6 flex items-center justify-center rounded-md bg-white/[0.06] hover:bg-white/[0.14] border border-resolve-border text-zinc-200 hover:text-white shrink-0 cursor-pointer transition-all">
              <svg class="w-3.5 h-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </button>
            <span class="w-5 h-5 rounded-full border ${t.isResolved ? 'bg-emerald-500 border-emerald-200 text-stone-950' : pinPalette.bg} font-mono text-[10px] font-bold flex items-center justify-center shrink-0">${t.pinNumber}</span>
            <span class="text-[11px] font-semibold text-white shrink-0">Pin #${t.pinNumber}</span>
            ${t.pageNumber > 1 ? `<span class="text-[10px] text-resolve-dimText font-mono shrink-0">Pág ${t.pageNumber}</span>` : ''}
            ${isCollapsed ? `<span class="text-[10px] text-resolve-dimText font-mono shrink-0">(${msgs.length})</span>` : ''}
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button type="button" data-resolve-thread="${escapeHtml(t.id)}" class="text-[10px] px-2 py-0.5 rounded border border-resolve-border hover:bg-white/[0.08] ${t.isResolved ? 'text-emerald-300' : 'text-resolve-dimText'} cursor-pointer">
              ${t.isResolved ? '✓ Resuelto' : 'Resolver'}
            </button>
          </div>
        </div>
        ${isCollapsed ? `<p class="text-[11px] text-resolve-dimText truncate pl-5">${escapeHtml(firstMsgPreview)}</p>` : `
        <div class="space-y-1.5">
          ${msgs
            .map(
              (m) => `
            <div class="text-xs">
              <div class="flex items-center gap-1.5">
                <span class="font-semibold ${m.authorRole === 'agency' ? 'text-amber-300' : 'text-[#0BA2AC]'}">${escapeHtml(m.authorName)}</span>
                <span class="text-[10px] text-resolve-dimText">${m.authorRole === 'agency' ? 'Agencia' : 'Cliente'}</span>
              </div>
              <p class="text-stone-200 mt-0.5 whitespace-pre-wrap">${escapeHtml(m.content)}</p>
            </div>`
            )
            .join('')}
        </div>
        <form data-reply-form="${escapeHtml(t.id)}" class="flex gap-1.5 pt-1">
          <input type="text" placeholder="Responder..." class="flex-1 bg-resolve-bg border border-resolve-border rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-[#0BA2AC]">
          <button type="submit" class="px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-[11px] font-semibold text-white cursor-pointer">Enviar</button>
        </form>`}
      </div>`;
    })
    .join('');

  const generalHtml = generalMessages.length
    ? `<div class="pt-2 border-t border-resolve-border space-y-2">
        <div class="text-[10px] uppercase tracking-wider font-semibold text-resolve-dimText">Comentarios Generales</div>
        ${generalMessages
          .map(
            (m) => `
          <div class="rounded-lg border border-resolve-border bg-resolve-bg/70 p-2.5 text-xs">
            <div class="flex items-center gap-1.5">
              <span class="font-semibold ${m.authorRole === 'agency' ? 'text-amber-300' : 'text-[#0BA2AC]'}">${escapeHtml(m.authorName)}</span>
              <span class="text-[10px] text-resolve-dimText">${m.authorRole === 'agency' ? 'Agencia' : 'Cliente'}</span>
            </div>
            <p class="text-stone-200 mt-0.5 whitespace-pre-wrap">${escapeHtml(m.content)}</p>
          </div>`
          )
          .join('')}
      </div>`
    : '';

  list.innerHTML =
    (threadsHtml || '<div class="text-xs text-resolve-dimText text-center py-6">Haz clic sobre cualquier punto de la pieza para crear el primer pin de revisión.</div>') +
    generalHtml;

  list.querySelectorAll('[data-card-thread-id]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('form') || e.target.closest('button')) return;
      const tid = card.getAttribute('data-card-thread-id');
      focusThreadPin(tid);
    });
  });

  list.querySelectorAll('[data-toggle-collapse]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tid = btn.getAttribute('data-toggle-collapse');
      if (!tid) return;
      if (state.collapsedThreads.has(tid)) {
        state.collapsedThreads.delete(tid);
      } else {
        state.collapsedThreads.add(tid);
      }
      renderThreadsSidebar();
    });
  });

  list.querySelectorAll('[data-resolve-thread]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tid = btn.getAttribute('data-resolve-thread');
      await toggleResolveThread(tid);
    });
  });

  list.querySelectorAll('[data-reply-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tid = form.getAttribute('data-reply-form');
      const input = form.querySelector('input');
      const text = input.value.trim();
      if (!text) return;
      ensureAuthorName(async (authorName) => {
        const res = await fetch(`/api/public/review/${encodeURIComponent(state.token)}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaFileId: state.activeMedia?.id,
            threadId: tid,
            content: text,
            authorName,
          }),
        });
        if (res.ok) {
          input.value = '';
          await loadReviewData(state.activeMedia?.id);
        }
      });
    });
  });
  const collapseAllBtn = el('rv-toggle-collapse-all');
  if (collapseAllBtn) {
    const allCollapsed = visibleThreads.length > 0 && visibleThreads.every((t) => state.collapsedThreads.has(t.id));
    collapseAllBtn.textContent = allCollapsed ? 'Expandir todo' : 'Contraer todo';
  }
  const expandCountEl = el('rv-sidebar-expand-count');
  if (expandCountEl) {
    expandCountEl.textContent = String(visibleThreads.length);
  }
}

function setSidebarCollapsed(collapsed) {
  const sidebar = el('rv-sidebar');
  const resizer = el('rv-sidebar-resizer');
  const expandBtn = el('rv-sidebar-expand-btn');
  if (!sidebar || !resizer || !expandBtn) return;

  sidebar.classList.toggle('hidden', collapsed);
  resizer.classList.toggle('hidden', collapsed);
  expandBtn.classList.toggle('hidden', !collapsed);
  expandBtn.classList.toggle('inline-flex', collapsed);
  localStorage.setItem('trafikeitor_rv_sidebar_collapsed', collapsed ? '1' : '0');
}

function selectThread(threadId) {
  setSidebarCollapsed(false);
  if (state.selectedThreadId === threadId) {
    if (state.collapsedThreads.has(threadId)) {
      state.collapsedThreads.delete(threadId);
    } else {
      state.collapsedThreads.add(threadId);
    }
  } else {
    state.selectedThreadId = threadId;
    state.collapsedThreads.delete(threadId);
  }
  renderPins();
  renderThreadsSidebar();
  if (!state.collapsedThreads.has(threadId)) {
    const card = el(`rv-thread-card-${threadId}`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

async function focusThreadPin(threadId) {
  state.selectedThreadId = threadId;
  const thread = state.threads.find((t) => t.id === threadId);
  if (thread && getRenderableSource(state.activeMedia).kind === 'pdf' && (thread.pageNumber || 1) !== state.pdfPage) {
    state.pdfPage = thread.pageNumber || 1;
    await renderPdfPage(state.pdfPage);
  }
  renderPins();
  renderThreadsSidebar();
}

async function toggleResolveThread(threadId) {
  ensureAuthorName(async (authorName) => {
    const res = await fetch(`/api/public/review/${encodeURIComponent(state.token)}/threads/${encodeURIComponent(threadId)}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorName }),
    });
    if (res.ok) await loadReviewData(state.activeMedia?.id);
  });
}

async function loadReviewData(requestedMediaId) {
  const qs = requestedMediaId ? `?mediaId=${encodeURIComponent(requestedMediaId)}` : '';
  const res = await fetch(`/api/public/review/${encodeURIComponent(state.token)}${qs}`, {
    credentials: 'include',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    el('rv-empty-state').classList.remove('hidden');
    el('rv-error-msg').textContent = data?.error || 'Enlace inválido o expirado.';
    el('rv-transform-stage').classList.add('hidden');
    return;
  }

  state.order = data.order;
  state.activeMedia = data.activeMedia;
  state.versions = data.versions || [];
  state.threads = data.threads || [];
  state.messages = data.messages || [];
  state.viewerSession = data.viewerSession || { isAgency: false, name: null };

  el('rv-ot-id').textContent = data.order.id;
  el('rv-title').textContent = state.activeMedia ? state.activeMedia.name : data.order.title;
  el('rv-subtitle').textContent = `${data.order.client || 'Cliente'} • ${data.order.title || ''}`;

  const backBtn = el('rv-back-ot-btn');
  if (backBtn) {
    backBtn.href = `/?ot=${encodeURIComponent(data.order.id)}`;
    if (state.viewerSession?.isAgency || window.opener) {
      backBtn.classList.remove('hidden');
      backBtn.classList.add('inline-flex');
    }
  }

  updateAuthorPill();
  renderStatusBadge();
  renderVersionSelect();
  await renderMediaStage();
  renderPins();
  renderThreadsSidebar();
}

function connectSse() {
  if (state.eventSource) state.eventSource.close();
  const es = new EventSource(`/api/public/review/${encodeURIComponent(state.token)}/stream`);
  es.addEventListener('sync', () => {
    loadReviewData(state.activeMedia?.id);
  });
  state.eventSource = es;
}

function setupCanvasInteractions() {
  const viewport = el('rv-canvas-viewport');
  const overlay = el('rv-overlay');
  const popover = el('rv-pin-popover');

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    state.zoom = Math.min(4, Math.max(0.35, Number((state.zoom + delta).toFixed(2))));
    applyTransform();
  }, { passive: false });

  viewport.addEventListener('contextmenu', (e) => e.preventDefault());

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || e.button === 2 || e.altKey) {
      state.isPanning = true;
      state.panStartX = e.clientX - state.panX;
      state.panStartY = e.clientY - state.panY;
      viewport.setPointerCapture(e.pointerId);
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!state.isPanning) return;
    state.panX = e.clientX - state.panStartX;
    state.panY = e.clientY - state.panStartY;
    applyTransform();
  });

  viewport.addEventListener('pointerup', () => {
    state.isPanning = false;
  });

  overlay.addEventListener('click', (e) => {
    if (state.isPanning || state._justDraggedPin || e.altKey) return;
    const rect = overlay.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const xPercent = Number(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)).toFixed(4));
    const yPercent = Number(Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)).toFixed(4));
    const vpRect = viewport.getBoundingClientRect();

    state.pendingPin = {
      xPercent,
      yPercent,
      pageNumber: getRenderableSource(state.activeMedia).kind === 'pdf' ? state.pdfPage : 1,
    };

    popover.style.left = `${Math.min(vpRect.width - 300, Math.max(12, e.clientX - vpRect.left + 12))}px`;
    popover.style.top = `${Math.min(vpRect.height - 170, Math.max(12, e.clientY - vpRect.top + 12))}px`;
    popover.classList.remove('hidden');
    el('rv-pin-input').value = '';
    el('rv-pin-input').focus();
  });

  el('rv-pin-cancel').addEventListener('click', () => {
    state.pendingPin = null;
    popover.classList.add('hidden');
  });

  popover.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = el('rv-pin-input').value.trim();
    if (!content || !state.pendingPin) return;
    ensureAuthorName(async (authorName) => {
      const res = await fetch(`/api/public/review/${encodeURIComponent(state.token)}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaFileId: state.activeMedia?.id,
          ...state.pendingPin,
          pinColor: state.pinColor,
          content,
          authorName,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        state.selectedThreadId = created.thread?.id || null;
        state.pendingPin = null;
        popover.classList.add('hidden');
        await loadReviewData(state.activeMedia?.id);
      }
    });
  });
}

async function updateThreadPinColor(threadId, pinColor) {
  const thread = state.threads.find((t) => t.id === threadId);
  if (thread) {
    thread.pinColor = pinColor;
    renderPins();
    renderThreadsSidebar();
  }
  try {
    await fetch(`/api/public/review/${encodeURIComponent(state.token)}/threads/${encodeURIComponent(threadId)}/color`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinColor }),
    });
  } catch (err) {
    console.error('Error actualizando color del pin:', err);
  }
}

function renderPinColorPicker() {
  const box = el('rv-pin-color-picker');
  if (!box) return;
  box.innerHTML = PIN_COLOR_PALETTE.map((c) => {
    const selected = c.id === state.pinColor;
    return `<button type="button" data-pin-color="${c.id}" title="Color ${c.label} (nuevo pin o pin seleccionado)"
      style="background-color:${c.swatch};"
      class="w-4 h-4 rounded-full border ${selected ? 'border-white ring-2 ring-[#0BA2AC] scale-110' : 'border-white/30 opacity-75 hover:opacity-100'} transition-all cursor-pointer"></button>`;
  }).join('');

  box.querySelectorAll('[data-pin-color]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = btn.getAttribute('data-pin-color');
      if (!next) return;
      state.pinColor = next;
      localStorage.setItem(PIN_COLOR_STORAGE_KEY, next);
      renderPinColorPicker();
      if (state.selectedThreadId) {
        await updateThreadPinColor(state.selectedThreadId, next);
      }
    });
  });
}

function setupSidebarResizer() {
  const resizer = el('rv-sidebar-resizer');
  const sidebar = el('rv-sidebar');
  const collapseBtn = el('rv-sidebar-collapse-btn');
  const expandBtn = el('rv-sidebar-expand-btn');
  if (!resizer || !sidebar) return;

  const WIDTH_KEY = 'trafikeitor_rv_sidebar_width';
  const savedWidth = parseInt(localStorage.getItem(WIDTH_KEY) || '', 10);
  if (Number.isFinite(savedWidth) && savedWidth >= 260 && savedWidth <= 680) {
    sidebar.style.width = `${savedWidth}px`;
  }

  if (localStorage.getItem('trafikeitor_rv_sidebar_collapsed') === '1') {
    setSidebarCollapsed(true);
  }
  if (collapseBtn) collapseBtn.addEventListener('click', () => setSidebarCollapsed(true));
  if (expandBtn) expandBtn.addEventListener('click', () => setSidebarCollapsed(false));

  resizer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resizer.classList.add('bg-amber-400');
    document.body.style.cursor = 'col-resize';

    const onMove = (ev) => {
      const nextWidth = Math.min(680, Math.max(260, Math.round(window.innerWidth - ev.clientX)));
      sidebar.style.width = `${nextWidth}px`;
    };

    const onUp = () => {
      resizer.classList.remove('bg-amber-400');
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const finalWidth = parseInt(sidebar.style.width || '', 10);
      if (Number.isFinite(finalWidth)) {
        localStorage.setItem(WIDTH_KEY, String(finalWidth));
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

function setupControls() {
  setupSidebarResizer();
  renderPinColorPicker();
  const collapseAllBtn = el('rv-toggle-collapse-all');
  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', () => {
      const visibleThreads = state.hideResolved
        ? state.threads.filter((t) => !t.isResolved)
        : state.threads;
      const allCollapsed = visibleThreads.length > 0 && visibleThreads.every((t) => state.collapsedThreads.has(t.id));
      if (allCollapsed) {
        visibleThreads.forEach((t) => state.collapsedThreads.delete(t.id));
      } else {
        visibleThreads.forEach((t) => state.collapsedThreads.add(t.id));
      }
      renderThreadsSidebar();
    });
  }

  el('rv-zoom-in').addEventListener('click', () => {
    state.zoom = Math.min(4, Number((state.zoom + 0.25).toFixed(2)));
    applyTransform();
  });
  el('rv-zoom-out').addEventListener('click', () => {
    state.zoom = Math.max(0.35, Number((state.zoom - 0.25).toFixed(2)));
    applyTransform();
  });
  el('rv-zoom-reset').addEventListener('click', () => {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    applyTransform();
  });

  el('rv-toggle-resolved').addEventListener('click', () => {
    state.hideResolved = !state.hideResolved;
    el('rv-toggle-resolved').textContent = state.hideResolved ? 'Mostrar resueltos' : 'Ocultar resueltos';
    renderPins();
    renderThreadsSidebar();
  });

  el('rv-version-select').addEventListener('change', (e) => {
    state.pdfPage = 1;
    state.selectedThreadId = null;
    loadReviewData(e.target.value);
  });

  el('rv-pdf-prev').addEventListener('click', async () => {
    if (state.pdfPage > 1) {
      state.pdfPage--;
      await renderPdfPage(state.pdfPage);
    }
  });
  el('rv-pdf-next').addEventListener('click', async () => {
    if (state.pdfPage < state.pdfTotalPages) {
      state.pdfPage++;
      await renderPdfPage(state.pdfPage);
    }
  });

  el('rv-general-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = el('rv-general-input');
    const content = input.value.trim();
    if (!content) return;
    ensureAuthorName(async (authorName) => {
      const res = await fetch(`/api/public/review/${encodeURIComponent(state.token)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaFileId: state.activeMedia?.id,
          content,
          authorName,
        }),
      });
      if (res.ok) {
        input.value = '';
        await loadReviewData(state.activeMedia?.id);
      }
    });
  });

  const submitDecision = (decision) => {
    ensureAuthorName(async (authorName) => {
      const res = await fetch(`/api/public/review/${encodeURIComponent(state.token)}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaFileId: state.activeMedia?.id,
          decision,
          authorName,
        }),
      });
      if (res.ok) await loadReviewData(state.activeMedia?.id);
    });
  };

  el('rv-btn-approve').addEventListener('click', () => submitDecision('approved'));
  el('rv-btn-changes').addEventListener('click', () => submitDecision('changes_requested'));

  el('rv-guest-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const val = el('rv-guest-input').value.trim();
    if (!val) return;
    state.guestName = val;
    localStorage.setItem(GUEST_STORAGE_KEY, val);
    el('rv-guest-modal').classList.add('hidden');
    updateAuthorPill();
    if (typeof state._pendingAuthorCallback === 'function') {
      const cb = state._pendingAuthorCallback;
      state._pendingAuthorCallback = null;
      cb(val);
    }
  });

  el('rv-author-pill').addEventListener('click', () => {
    if (state.viewerSession?.isAgency) return;
    const modal = el('rv-guest-modal');
    el('rv-guest-input').value = state.guestName;
    modal.classList.remove('hidden');
  });
}

async function init() {
  state.token = getReviewTokenFromUrl();
  if (!state.token) {
    el('rv-empty-state').classList.remove('hidden');
    el('rv-error-msg').textContent = 'Token de revisión no especificado en la URL.';
    return;
  }
  setupCanvasInteractions();
  setupControls();
  await loadReviewData();
  connectSse();
}

init();

