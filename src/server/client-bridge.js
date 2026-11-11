/**
 * EL MARCANTE // PUENTE DE PERSISTENCIA SQLITE + BETTER AUTH + SUBIDA DE ARCHIVOS
 */
(function () {
  const STORAGE_KEY = 'resolve_traffic_orders_v2';
  const CLIENTS_STORAGE_KEY = 'resolve_traffic_clients_v2';
  const STATUSES_STORAGE_KEY = 'resolve_traffic_statuses_v2';
  const STRIPBOARD_STORAGE_KEY = 'resolve_traffic_stripboard_v2';

  let isSyncingFromServer = false;
  let syncTimeout = null;

  // Obtener el ID de la OT abierta leyendo el encabezado del modal (porque let activeOtId no vive en window)
  function getCurrentOpenOtId() {
    const modal = document.getElementById('envelope-modal');
    if (modal && !modal.classList.contains('hidden')) {
      const idEl = document.getElementById('modal-ot-id');
      if (idEl && idEl.innerText.trim()) {
        return idEl.innerText.trim();
      }
    }
    return null;
  }

  // 1. Controles en la barra superior (Testigo SQLite + Botón Salir)
  function injectTopbarControls(user) {
    const headerRight = document.querySelector('header > div:last-child');
    if (!headerRight) return;

    const oldBadge = document.getElementById('sqlite-sync-badge');
    if (oldBadge) oldBadge.remove();
    const oldLogout = document.getElementById('elmarcante-logout-btn');
    if (oldLogout) oldLogout.remove();

    const badge = document.createElement('div');
    badge.id = 'sqlite-sync-badge';
    badge.className = 'hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-700/60 text-[10px] font-mono text-emerald-300';
    badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span><span>SQLite Activo</span>';
    headerRight.prepend(badge);

    if (user) {
      const userBtn = document.createElement('button');
      userBtn.id = 'elmarcante-logout-btn';
      userBtn.type = 'button';
      userBtn.className = 'px-2.5 py-1 text-xs font-mono bg-resolve-card hover:bg-red-950/80 text-stone-300 hover:text-red-300 rounded border border-resolve-border hover:border-red-700 transition-colors cursor-pointer';
      userBtn.title = 'Sesión activa: ' + (user.email || user.name) + ' (Clic para cerrar sesión)';
      userBtn.innerText = 'Salir (' + (user.name || 'Director').split(' ')[0] + ')';
      userBtn.onclick = async () => {
        if (!confirm('¿Cerrar sesión en El Marcante?')) return;
        try {
          await fetch('/api/auth/sign-out', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({}),
          });
        } catch (e) {}
        await fetch('/api/logout-force', { method: 'POST', credentials: 'include' }).catch(() => {});
        window.location.reload();
      };
      headerRight.appendChild(userBtn);
    }
  }

  function updateSyncBadge(stateText, isSaving) {
    const b = document.getElementById('sqlite-sync-badge');
    if (!b) return;
    if (isSaving) {
      b.className = 'hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/60 border border-amber-700/60 text-[10px] font-mono text-amber-300';
      b.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span><span>' + (stateText || 'Guardando en SQLite...') + '</span>';
    } else {
      b.className = 'hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-700/60 text-[10px] font-mono text-emerald-300';
      b.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span>' + (stateText || 'SQLite Sincronizado') + '</span>';
    }
  }

  // 2. Pantalla de acceso Better Auth
  function showAuthGate(hasAnyUsers) {
    let gate = document.getElementById('elmarcante-auth-gate');
    if (gate) gate.remove();

    gate = document.createElement('div');
    gate.id = 'elmarcante-auth-gate';
    gate.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-[#0e0f12]/95 backdrop-blur-md p-4 select-none';

    let isRegisterMode = !hasAnyUsers;

    const renderGateForm = () => {
      gate.innerHTML = `
        <div class="w-full max-w-md bg-[#1c1d21] border border-[#383b42] rounded-lg shadow-2xl p-6 font-mono text-xs text-stone-200">
          <div class="flex items-center justify-between border-b border-[#383b42] pb-4 mb-5">
            <div class="flex items-center gap-2.5">
              <img src="/assets/favicon-32x32.png" alt="Trafikeitor" class="w-6 h-6 rounded object-cover shadow-[0_0_8px_rgba(217,119,6,0.6)]">
              <div>
                <h1 class="font-black text-sm tracking-widest text-white uppercase">TRAFIKEITOR</h1>
                <p class="text-[10px] text-[#8e929b]">CONTROL DE TRÁFICO • EL MARCANTE</p>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded bg-[#23252a] border border-[#383b42] text-[10px] text-amber-400 font-bold">
              ${isRegisterMode ? 'ACTIVAR CUENTA' : 'BETTER AUTH'}
            </span>
          </div>

          <p class="text-[11px] text-[#8e929b] mb-4 leading-relaxed">
            ${isRegisterMode
              ? 'Bienvenido, Director. Crea tu cuenta maestra para proteger tus Órdenes de Trabajo, el Media Pool y tu Stripboard en SQLite.'
              : 'Ingresa tus credenciales para abrir la Mesa de Tráfico y sincronizar con la base de datos.'}
          </p>

          <form id="elmarcante-auth-form" class="space-y-3.5">
            ${isRegisterMode ? `
              <div>
                <label class="block text-[10px] uppercase text-[#8e929b] font-bold mb-1">Nombre del Director *</label>
                <input type="text" id="auth-name" required value="Andrés Jaramillo" class="w-full bg-[#141416] border border-[#383b42] rounded px-3 py-2 text-white font-bold focus:border-[#d97706] focus:outline-none">
              </div>
            ` : ''}

            <div>
              <label class="block text-[10px] uppercase text-[#8e929b] font-bold mb-1">Correo Electrónico *</label>
              <input type="email" id="auth-email" required placeholder="contacto@marcanter.com" value="contacto@marcanter.com" class="w-full bg-[#141416] border border-[#383b42] rounded px-3 py-2 text-white font-bold focus:border-[#d97706] focus:outline-none">
            </div>

            <div>
              <label class="block text-[10px] uppercase text-[#8e929b] font-bold mb-1">Contraseña (mín. 8 caracteres) *</label>
              <input type="password" id="auth-password" required minlength="8" placeholder="••••••••" class="w-full bg-[#141416] border border-[#383b42] rounded px-3 py-2 text-white font-bold focus:border-[#d97706] focus:outline-none">
            </div>

            <div id="auth-error-msg" class="hidden p-2.5 rounded bg-red-950/70 border border-red-800 text-red-300 text-[11px]"></div>

            <button type="submit" id="auth-submit-btn" class="w-full py-2.5 bg-[#d97706] hover:bg-[#b45309] text-stone-950 font-black uppercase tracking-wider rounded transition-colors cursor-pointer">
              ${isRegisterMode ? 'Crear Cuenta Maestra y Entrar' : 'Entrar al Estudio'}
            </button>
          </form>

          <div class="mt-4 pt-3 border-t border-[#383b42] flex items-center justify-between text-[11px] text-[#8e929b]">
            <span>${isRegisterMode ? '¿Ya tienes cuenta creada?' : '¿Necesitas registrar un usuario?'}</span>
            <button type="button" id="auth-toggle-mode" class="text-amber-400 hover:underline font-bold cursor-pointer">
              ${isRegisterMode ? 'Iniciar Sesión' : 'Crear Cuenta'}
            </button>
          </div>
        </div>
      `;

      gate.querySelector('#auth-toggle-mode').onclick = () => {
        isRegisterMode = !isRegisterMode;
        renderGateForm();
      };

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
        const name = nameInput ? nameInput.value.trim() : 'Director';

        try {
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
            throw new Error(data.message || data.error?.message || 'Credenciales inválidas o error de acceso.');
          }

          gate.remove();
          await bootFromSqlite();
        } catch (err) {
          errEl.innerText = err.message || 'Error al autenticar';
          errEl.classList.remove('hidden');
          btnEl.disabled = false;
          btnEl.innerText = isRegisterMode ? 'Crear Cuenta Maestra y Entrar' : 'Entrar al Estudio';
        }
      };
    };

    renderGateForm();
    document.body.appendChild(gate);
  }

  // 3. Guardado automático en SQLite
  function scheduleServerSave() {
    if (isSyncingFromServer) return;
    updateSyncBadge('Guardando...', true);
    if (syncTimeout) clearTimeout(syncTimeout);

    syncTimeout = setTimeout(async () => {
      try {
        const payload = {
          clients: JSON.parse(localStorage.getItem(CLIENTS_STORAGE_KEY) || '[]'),
          statuses: JSON.parse(localStorage.getItem(STATUSES_STORAGE_KEY) || '[]'),
          orders: JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'),
          stripboard: JSON.parse(localStorage.getItem(STRIPBOARD_STORAGE_KEY) || '{}'),
        };

        const res = await fetch('/api/studio/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          updateSyncBadge('SQLite Sincronizado', false);
        } else {
          updateSyncBadge('Error al guardar', false);
        }
      } catch (e) {
        console.error('Error sincronizando con SQLite:', e);
        updateSyncBadge('Sin conexión', false);
      }
    }, 250);
  }

  const origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    origSetItem(key, value);
    if ([STORAGE_KEY, CLIENTS_STORAGE_KEY, STATUSES_STORAGE_KEY, STRIPBOARD_STORAGE_KEY].includes(key)) {
      scheduleServerSave();
    }
  };

  // 4. Subida real de archivos (Drag & Drop + Botón Importar) hacia /uploads + Extractor de Vistas Previas
  async function uploadFilesToActiveOt(fileList) {
    const currentOtId = getCurrentOpenOtId();
    if (!fileList || fileList.length === 0 || !currentOtId) return;

    const orders = window.getOrders();
    const ot = orders.find((o) => o.id === currentOtId);
    if (!ot) return;
    if (!ot.mediaFiles) ot.mediaFiles = [];

    updateSyncBadge('Subiendo ' + fileList.length + ' archivo(s)...', true);

    for (const file of Array.from(fileList)) {
      try {
        const formData = new FormData();
        formData.append('ot_id', ot.id);
        formData.append('file', file);

        const res = await fetch('/api/studio/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        const uploaded = await res.json();
        if (res.ok && uploaded.ok && uploaded.mediaItem) {
          ot.mediaFiles.push(uploaded.mediaItem);
        }
      } catch (err) {
        console.error('Error subiendo archivo al servidor:', err);
      }
    }

    window.saveOrders(orders);
    if (typeof window.renderMediaPool === 'function') {
      window.renderMediaPool(ot.mediaFiles);
    }
    if (typeof window.selectInlinePreviewMedia === 'function') {
      window.selectInlinePreviewMedia(Math.max(0, ot.mediaFiles.length - 1));
    } else if (typeof window.renderInlineEnvelopeMedia === 'function') {
      window.renderInlineEnvelopeMedia(ot.mediaFiles);
    }
    updateSyncBadge('SQLite Sincronizado', false);
  }

  function hookRealMediaUpload() {
    window.handleMediaPoolUpload = async function (e) {
      const files = e && e.target ? e.target.files : null;
      await uploadFilesToActiveOt(files);
      if (e && e.target && 'value' in e.target) {
        e.target.value = '';
      }
    };

    window.handleInlineDropzoneDrop = async function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.handleInlineDropzoneLeave === 'function') {
        window.handleInlineDropzoneLeave(e);
      }
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await uploadFilesToActiveOt(e.dataTransfer.files);
      }
    };

    window.handleFileDrop = async function (e) {
      e.preventDefault();
      e.stopPropagation();
      const dz = document.getElementById('file-dropzone');
      if (dz) dz.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await uploadFilesToActiveOt(e.dataTransfer.files);
      }
    };
  }

  // 5. Inicializar desde SQLite
  async function bootFromSqlite() {
    try {
      const statusRes = await fetch('/api/status', { credentials: 'include' });
      const statusData = await statusRes.json();

      const res = await fetch('/api/studio/bootstrap', { credentials: 'include' });
      if (res.status === 401) {
        showAuthGate(statusData.hasUsers);
        return;
      }

      const data = await res.json();
      if (!data.ok) return;

      isSyncingFromServer = true;
      if (data.clients && data.clients.length > 0) {
        origSetItem(CLIENTS_STORAGE_KEY, JSON.stringify(data.clients));
      }
      if (data.statuses && data.statuses.length > 0) {
        origSetItem(STATUSES_STORAGE_KEY, JSON.stringify(data.statuses));
      }
      if (data.orders && data.orders.length > 0) {
        origSetItem(STORAGE_KEY, JSON.stringify(data.orders));
      }
      if (data.stripboard) {
        origSetItem(STRIPBOARD_STORAGE_KEY, JSON.stringify(data.stripboard));
      }
      isSyncingFromServer = false;

      injectTopbarControls(data.user);
      hookRealMediaUpload();

      if (typeof window.renderStatusSelects === 'function') window.renderStatusSelects();
      if (typeof window.renderBinTree === 'function') window.renderBinTree();
      if (typeof window.renderTrafficDesk === 'function') window.renderTrafficDesk();
      if (typeof window.updateClientsDatalist === 'function') window.updateClientsDatalist();
      if (typeof window.initStripboard === 'function') window.initStripboard();
    } catch (err) {
      console.error('Error iniciando desde SQLite:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootFromSqlite);
  } else {
    bootFromSqlite();
  }
})();
