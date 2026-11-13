/**
 * TRAFIKEITOR // DATA BRIDGE (ADAPTADOR REST SQLITE/HONO + CACHÉ SÍNCRONA + FALLBACK LOCAL)
 * Módulo 2: Única fuente de verdad de datos en el cliente.
 * Regla: Cero referencias al DOM y cero manipulación de elementos HTML.
 */

import {
  STORAGE_KEY,
  CLIENTS_STORAGE_KEY,
  STATUSES_STORAGE_KEY,
  STRIPBOARD_STORAGE_KEY,
  RESPONSIBLES_STORAGE_KEY,
  DEPARTMENTS_STORAGE_KEY,
  USER_PROFILE_STORAGE_KEY,
  CLIENT_COLOR_PALETTE,
  USER_AVATAR_ICONS,
  DEFAULT_USER_PROFILE,
  defaultResponsibles,
  legacyGenericRoles,
  defaultDepartments,
  defaultStatuses,
  statusDescriptions,
  state,
  getScopedStorageKey,
  clearScopedLocalCache,
  emit
} from './core-state.js';

export { clearScopedLocalCache };

// ============================================================================
// DATOS SEMILLA (FALLBACK SI STORAGE Y SERVIDOR ESTÁN VACÍOS)
// ============================================================================
export const defaultClients = [
  {
    id: "c-1",
    name: "Cervecería Nacional",
    brands: ["Club Premium", "Pilsener", "Malta Real"]
  },
  {
    id: "c-2",
    name: "Banco de Comercio",
    brands: ["Crédito Hipotecario", "Tarjetas Black", "Banca Digital"]
  },
  {
    id: "c-3",
    name: "Automotores del Valle",
    brands: ["Línea Camionetas 4x4", "Taller Posventa"]
  }
];

export const defaultOrders = [
  {
    id: "OT-26-001",
    ref: "BOT-26-DIG",
    createdAt: "21/05/2026 09:30",
    client: "Cervecería Nacional",
    brand: "Club Premium",
    product: "Botella Retornable 330ml",
    title: "Comercial TV 20'' Lanzamiento Nueva Botella",
    media: "Televisión Abierta & Digital 20''",
    urgent: true,
    status: "Tráfico",
    responsible: "Andrés J.",
    brief: "Campaña de posicionamiento de la nueva botella retornable. Tono sofisticado, noche entre amigos selectos.",
    legalText: "Prohibida su venta a menores de edad. Tomar bebidas alcohólicas en exceso es perjudicial.",
    mediaFiles: [
      {
        id: "m-1",
        name: "Boceto_Storyboard_Escena_Final.png",
        type: "image",
        size: "1.4 MB",
        date: "21/05/2026 10:20",
        url: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600&auto=format&fit=crop&q=80"
      },
      {
        id: "m-2",
        name: "Manual_de_Marca_Botella_2026.pdf",
        type: "pdf",
        size: "3.2 MB",
        date: "21/05/2026 10:25",
        url: "#"
      }
    ],
    routes: [
      {
        from: "Tráfico",
        to: "Creativos",
        task: "Favor desarrollar los diálogos para el comercial de TV 20\" cerrando siempre con el Product Shot y el slogan de la marca en OFF. Incluir al final la locución legal: 'Prohibida su venta a menores de edad'.",
        entryDate: "21/05/2026 10:15",
        deliveryDate: "23/05/2026 15:00",
        sign: "Andrés J.",
        notes: "Prioridad alta por pauta en TV",
        stamp: "RECIBIDO",
        completed: false
      },
      {
        from: "Creativos",
        to: "Tráfico",
        task: "Se envían 2 guiones dialogados con minutero exacto.",
        entryDate: "23/05/2026 14:00",
        deliveryDate: "24/05/2026 10:00",
        sign: "Andrés J.",
        notes: "Listos para aprobación del cliente",
        stamp: "ENTREGADO",
        completed: true
      }
    ]
  },
  {
    id: "OT-26-002",
    ref: "PREN-HIPO-01",
    createdAt: "18/05/2026 11:00",
    client: "Banco de Comercio",
    brand: "Crédito Hipotecario",
    product: "Vivienda Sostenible",
    title: "Doble Página Prensa Dominical",
    media: "Prensa Nacional 2 Páginas",
    urgent: false,
    status: "Desarrollo",
    responsible: "Andrés J.",
    brief: "Tasa preferencial vivienda sostenible.",
    legalText: "Sujeto a estudio de crédito y políticas de la entidad.",
    mediaFiles: [],
    routes: [
      {
        from: "Tráfico",
        to: "Creativos",
        task: "Desarrollo de titulares y copy largo.",
        entryDate: "18/05/2026 11:30",
        deliveryDate: "19/05/2026 17:00",
        sign: "Andrés J.",
        notes: "Pendiente confirmación de fecha de publicación",
        stamp: "APROBADO",
        completed: true
      }
    ]
  }
];

// ============================================================================
// CACHÉ SÍNCRONA EN MEMORIA
// ============================================================================
let ordersCache = [];
let clientsCache = [];
let statusesCache = [];
let responsiblesCache = [];
let inactiveResponsiblesCache = [];
let departmentsCache = [];
let stripboardCache = {};
let currentUser = null;
let currentOrganization = null;
let syncDebounceTimer = null;
let isBootstrapping = false;

// ============================================================================
// UTILIDADES PURAS DE FORMATEO Y SANITIZACIÓN
// ============================================================================
export function escapeHtml(string) {
  if (!string) return '';
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function translateAuthError(rawMsg, fallback = 'Ocurrió un error inesperado.') {
  const text = typeof rawMsg === 'string' ? rawMsg.trim() : '';
  if (!text) return fallback;
  const lower = text.toLowerCase();
  if (lower.includes('already invited to this organization')) {
    return 'Este usuario ya tiene una invitación pendiente en el estudio. Usa el botón «Reenviar» en la lista.';
  }
  if (lower.includes('already a member of this organization')) {
    return 'Este usuario ya es miembro activo de este estudio.';
  }
  if (lower.includes('membership limit')) {
    return 'Se alcanzó el límite de 6 miembros activos. Desactiva un miembro para liberar un cupo.';
  }
  if (lower.includes('not allowed')) {
    return 'No tienes permisos para realizar esta acción.';
  }
  if (lower.includes('invalid email or password')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (lower.includes('user already exists')) {
    return 'Ya existe una cuenta registrada con este correo.';
  }
  if (lower.includes('invitation not found')) {
    return 'Invitación no encontrada o ya fue utilizada.';
  }
  if (lower.includes('invitation expired')) {
    return 'Esta invitación ha expirado. Solicita un reenvío.';
  }
  return text;
}

export function getNowFormatted() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function toIsoDateTime(str) {
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) {
    return str.substring(0, 16);
  }
  const m = String(str).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = m[2].padStart(2, '0');
    const year = m[3];
    const hour = (m[4] || '00').padStart(2, '0');
    const min = (m[5] || '00').padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${min}`;
  }
  return '';
}

export function fromIsoToDisplay(val) {
  if (!val) return '';
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  }
  return val;
}

export function formatDateKeyLocal(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ============================================================================
// LECTURA / ESCRITURA EN LOCALSTORAGE (RESPALDO Y FALLBACK)
// ============================================================================
function readLocal(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const scopedKey = getScopedStorageKey(key);
    const raw = localStorage.getItem(scopedKey);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeLocal(key, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    const scopedKey = getScopedStorageKey(key);
    localStorage.setItem(scopedKey, JSON.stringify(value));
  } catch (e) {
    console.warn(`[DataBridge] Error escribiendo en localStorage para ${key}:`, e);
  }
}

// ============================================================================
// PERFIL DE USUARIO Y FIRMA OPERATIVA (NATIVO BETTER AUTH)
// ============================================================================
export function deriveShortName(name) {
  if (!name || typeof name !== 'string') return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
}

export function resolveValidShortName(name, shortName) {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanShort = typeof shortName === 'string' ? shortName.trim() : '';
  const isResidual = cleanShort === 'Andrés J.' && cleanName && !cleanName.toLowerCase().includes('andrés');
  if (!cleanShort || isResidual) {
    return deriveShortName(cleanName) || cleanName || 'Usuario';
  }
  return cleanShort;
}

export function getUserProfile() {
  if (currentUser) {
    let depts = DEFAULT_USER_PROFILE.departments;
    if (currentUser.departments) {
      try {
        depts = typeof currentUser.departments === 'string' ? JSON.parse(currentUser.departments) : currentUser.departments;
      } catch (_) {}
    }
    const cleanName = (currentUser.name || '').trim();
    const shortName = resolveValidShortName(cleanName, currentUser.shortName);
    return {
      fullName: cleanName || DEFAULT_USER_PROFILE.fullName,
      shortName: shortName,
      email: currentUser.email || DEFAULT_USER_PROFILE.email,
      color: currentUser.color || DEFAULT_USER_PROFILE.color,
      avatarMode: currentUser.avatarMode || DEFAULT_USER_PROFILE.avatarMode,
      avatarIcon: currentUser.avatarIcon || DEFAULT_USER_PROFILE.avatarIcon,
      avatarImage: currentUser.image || '',
      phone: currentUser.phone || '',
      departments: Array.isArray(depts) && depts.length > 0 ? depts : DEFAULT_USER_PROFILE.departments,
    };
  }

  const profile = readLocal(USER_PROFILE_STORAGE_KEY, DEFAULT_USER_PROFILE);
  const isDefaultAndres = profile.fullName === 'Andrés Jaramillo' && profile.email === 'contacto@marcanter.com';
  if (isDefaultAndres) {
    return { ...DEFAULT_USER_PROFILE };
  }
  const merged = { ...DEFAULT_USER_PROFILE, ...profile };
  if (!Array.isArray(merged.departments) || merged.departments.length === 0) {
    merged.departments = [...DEFAULT_USER_PROFILE.departments];
  }
  return merged;
}

export function getActiveUserShortName() {
  const profile = getUserProfile();
  const shortName = (profile.shortName || deriveShortName(profile.fullName) || 'Usuario').trim();
  if (shortName && shortName !== 'Usuario' && Array.isArray(responsiblesCache) && !responsiblesCache.includes(shortName)) {
    responsiblesCache.unshift(shortName);
    writeLocal(RESPONSIBLES_STORAGE_KEY, responsiblesCache);
  }
  return shortName;
}

export async function saveUserProfile(profileData) {
  if (!profileData || typeof profileData !== 'object') return getUserProfile();
  const oldProfile = getUserProfile();
  const oldShortName = (oldProfile.shortName || '').trim();

  const fullName = (profileData.fullName !== undefined ? profileData.fullName : oldProfile.fullName || '').trim();
  const shortName = (profileData.shortName !== undefined
    ? profileData.shortName
    : (oldProfile.shortName || deriveShortName(fullName) || 'Usuario')
  ).trim();

  const merged = {
    ...oldProfile,
    ...profileData,
    fullName: fullName,
    shortName: shortName || deriveShortName(fullName) || 'Usuario',
    email: (profileData.email !== undefined ? profileData.email : oldProfile.email || '').trim(),
    color: profileData.color || oldProfile.color || 'cyan',
    avatarMode: profileData.avatarMode || oldProfile.avatarMode || 'initials',
    avatarIcon: profileData.avatarIcon || oldProfile.avatarIcon || 'pen',
    avatarImage: typeof profileData.avatarImage === 'string' ? profileData.avatarImage : (oldProfile.avatarImage || ''),
    phone: profileData.phone !== undefined ? String(profileData.phone).trim() : (oldProfile.phone || ''),
    departments: state.memberRole === 'owner'
      ? (Array.isArray(profileData.departments) && profileData.departments.length > 0
          ? profileData.departments
          : (oldProfile.departments || ['Tráfico']))
      : (oldProfile.departments || ['Tráfico'])
  };

  writeLocal(USER_PROFILE_STORAGE_KEY, merged);

  if (currentUser) {
    currentUser.name = merged.fullName;
    currentUser.shortName = merged.shortName;
    currentUser.email = merged.email;
    currentUser.color = merged.color;
    currentUser.avatarMode = merged.avatarMode;
    currentUser.avatarIcon = merged.avatarIcon;
    currentUser.phone = merged.phone;
    currentUser.departments = JSON.stringify(merged.departments);
    currentUser.image = merged.avatarMode === 'image' ? (merged.avatarImage || '') : '';
  }

  // Sincronización oficial con endpoint nativo de Better Auth: /api/auth/update-user
  if (typeof fetch !== 'undefined') {
    try {
      await fetch('/api/auth/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: merged.fullName,
          image: merged.avatarMode === 'image' ? (merged.avatarImage || '') : '',
          shortName: merged.shortName,
          color: merged.color,
          avatarMode: merged.avatarMode,
          avatarIcon: merged.avatarIcon,
          phone: merged.phone,
          ...(state.memberRole === 'owner' ? { departments: JSON.stringify(merged.departments) } : {}),
        })
      });
    } catch (err) {
      console.warn('[DataBridge] Error enviando update-user a Better Auth:', err);
    }
  }

  const newShortName = merged.shortName;

  // Actualización en cascada del shortName / firma operativa si cambió
  if (oldShortName && newShortName && oldShortName !== newShortName) {
    // 1. responsiblesCache
    const rIdx = responsiblesCache.indexOf(oldShortName);
    if (rIdx !== -1) {
      responsiblesCache[rIdx] = newShortName;
    } else if (!responsiblesCache.includes(newShortName)) {
      responsiblesCache.unshift(newShortName);
    }
    writeLocal(RESPONSIBLES_STORAGE_KEY, responsiblesCache);

    // 2. ordersCache (campo responsible y routes[].sign)
    let ordersModified = false;
    ordersCache.forEach(order => {
      if (order.responsible === oldShortName) {
        order.responsible = newShortName;
        ordersModified = true;
      }
      if (Array.isArray(order.routes)) {
        order.routes.forEach(route => {
          if (route.sign === oldShortName) {
            route.sign = newShortName;
            ordersModified = true;
          }
        });
      }
    });
    if (ordersModified) {
      writeLocal(STORAGE_KEY, ordersCache);
    }

    // 3. stripboardCache (campo assignee)
    let stripModified = false;
    Object.keys(stripboardCache).forEach(dateStr => {
      const strips = stripboardCache[dateStr];
      if (Array.isArray(strips)) {
        strips.forEach(strip => {
          if (strip.assignee === oldShortName) {
            strip.assignee = newShortName;
            stripModified = true;
          }
        });
      }
    });
    if (stripModified) {
      writeLocal(STRIPBOARD_STORAGE_KEY, stripboardCache);
    }

    scheduleSync();
  } else {
    // Asegurar que newShortName siempre esté en responsiblesCache
    if (!responsiblesCache.includes(newShortName)) {
      responsiblesCache.unshift(newShortName);
      writeLocal(RESPONSIBLES_STORAGE_KEY, responsiblesCache);
      scheduleSync();
    }
  }

  emit('user:profile-updated', merged);
  return merged;
}

export function renderUserAvatarHtml(sizeClass = 'w-5 h-5 text-[10px]', overrideProfile = null) {
  const profile = overrideProfile || getUserProfile();
  const colorName = profile.color || 'cyan';
  const colorObj = CLIENT_COLOR_PALETTE.find(p => p.name === colorName)
    || CLIENT_COLOR_PALETTE.find(p => p.name === 'cyan')
    || CLIENT_COLOR_PALETTE[0];

  let inner = '';
  if (profile.avatarMode === 'image' && profile.avatarImage) {
    inner = `<img src="${profile.avatarImage}" alt="${escapeHtml(profile.shortName || profile.fullName || 'User')}" class="w-full h-full object-cover rounded-full" />`;
  } else if (profile.avatarMode === 'icon' && profile.avatarIcon && USER_AVATAR_ICONS[profile.avatarIcon]) {
    inner = `<div class="w-3/5 h-3/5 ${colorObj.text} flex items-center justify-center">${USER_AVATAR_ICONS[profile.avatarIcon].svg}</div>`;
  } else {
    // Modo Iniciales
    const sourceName = (profile.shortName || profile.fullName || 'US').trim();
    const parts = sourceName.split(/\s+/).filter(Boolean);
    let initials = 'US';
    if (parts.length >= 2) {
      initials = (parts[0][0] + parts[1][0]).toUpperCase();
    } else if (parts.length === 1) {
      initials = parts[0].slice(0, 2).toUpperCase();
    }
    inner = `<span class="font-bold tracking-tighter ${colorObj.text}">${initials}</span>`;
  }

  return `
    <div class="${sizeClass} rounded-full flex items-center justify-center ${colorObj.bg} border ${colorObj.border} overflow-hidden shrink-0 select-none shadow-sm">
      ${inner}
    </div>
  `;
}

// Hidratación diferida desde localStorage particionado (invocada tras bootstrap)
function initLocalCache() {
  ordersCache = readLocal(STORAGE_KEY, []);
  clientsCache = readLocal(CLIENTS_STORAGE_KEY, []);
  statusesCache = readLocal(STATUSES_STORAGE_KEY, defaultStatuses);
  responsiblesCache = readLocal(RESPONSIBLES_STORAGE_KEY, defaultResponsibles);
  departmentsCache = readLocal(DEPARTMENTS_STORAGE_KEY, defaultDepartments);
  stripboardCache = readLocal(STRIPBOARD_STORAGE_KEY, {});

  // Asegurar que el shortName del perfil activo esté presente si es válido
  const activeShort = getActiveUserShortName();
  if (activeShort && activeShort !== 'Usuario' && !responsiblesCache.includes(activeShort)) {
    responsiblesCache.unshift(activeShort);
  }
  // Depurar residuos de "Andrés J." si el perfil actual no es Andrés
  const profile = getUserProfile();
  if (profile.fullName && !profile.fullName.toLowerCase().includes('andrés')) {
    responsiblesCache = responsiblesCache.filter(r => r !== 'Andrés J.');
  }
  // Depurar roles genéricos legados
  responsiblesCache = responsiblesCache.filter(
    r => typeof r === 'string' && !legacyGenericRoles.includes(r.trim()) && r.trim().length > 0
  );
  if (responsiblesCache.length === 0 && activeShort && activeShort !== 'Usuario') {
    responsiblesCache = [activeShort];
  }
}

export async function handleUserSignOut() {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
  clearScopedLocalCache();
  currentUser = null;
  currentOrganization = null;
  state.currentUser = null;
  state.organizationId = null;
  state.memberRole = 'owner';
  state.allowedClientId = '*';
  state.isSuperAdmin = false;
  ordersCache = [];
  clientsCache = [];
  stripboardCache = {};
  try {
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({})
    });
  } catch (_) {}
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

// ============================================================================
// SINCRONIZACIÓN ASÍNCRONA HACIA HONO / SQLITE (CON DEBOUNCE)
// ============================================================================
export function scheduleSync() {
  // Persistencia local inmediata de resguardo
  writeLocal(STORAGE_KEY, ordersCache);
  writeLocal(CLIENTS_STORAGE_KEY, clientsCache);
  writeLocal(STATUSES_STORAGE_KEY, statusesCache);
  writeLocal(RESPONSIBLES_STORAGE_KEY, responsiblesCache);
  writeLocal(DEPARTMENTS_STORAGE_KEY, departmentsCache);
  writeLocal(STRIPBOARD_STORAGE_KEY, stripboardCache);

  emit('sync:status', { isSaving: true, text: 'Guardando en SQLite...' });

  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(async () => {
    try {
      if (typeof fetch === 'undefined') {
        emit('sync:status', { isSaving: false, text: 'Modo Offline (Local)' });
        return;
      }

      const stripboardWithUser = {};
      const activeUserId = state.currentUser?.id || null;
      for (const [dateStr, strips] of Object.entries(stripboardCache || {})) {
        if (Array.isArray(strips)) {
          stripboardWithUser[dateStr] = strips.map((st) => ({
            ...st,
            userId: st.userId || activeUserId
          }));
        }
      }

      const payload = state.memberRole === 'owner'
        ? {
            clients: clientsCache,
            statuses: statusesCache,
            orders: ordersCache,
            stripboard: stripboardWithUser
          }
        : {
            orders: ordersCache,
            stripboard: stripboardWithUser
          };

      const res = await fetch('/api/studio/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        emit('sync:status', { isSaving: false, text: 'SQLite Sincronizado' });
      } else if (res.status === 402) {
        const errJson = await res.json().catch(() => ({}));
        emit('billing:trial-expired', errJson);
        emit('sync:status', { isSaving: false, text: 'Prueba finalizada' });
      } else if (res.status === 403) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson && errJson.error === 'license_suspended') {
          emit('license:suspended', errJson);
          emit('sync:status', { isSaving: false, text: 'Suscripción suspendida' });
          return;
        }
        if (errJson && errJson.error === 'account_deactivated') {
          emit('auth:account-deactivated', errJson);
          emit('sync:status', { isSaving: false, text: 'Cuenta desactivada' });
          return;
        }
        emit('sync:status', { isSaving: false, text: 'Sin permisos (Local)' });
      } else {
        emit('sync:status', { isSaving: false, text: 'Sin conexión (Local)' });
      }
    } catch (err) {
      emit('sync:status', { isSaving: false, text: 'Sin conexión (Local)' });
    } finally {
      emit('data:changed', { timestamp: Date.now() });
    }
  }, 250);
}

// ============================================================================
// BOOTSTRAP: INICIALIZACIÓN Y CONEXIÓN CON EL SERVIDOR
// ============================================================================
export async function bootstrap() {
  isBootstrapping = true;
  emit('sync:status', { isSaving: true, text: 'Conectando con SQLite...' });

  try {
    if (typeof fetch === 'undefined') {
      emit('data:ready', { source: 'local', user: null });
      return { ok: true, source: 'local', user: null };
    }

    const res = await fetch('/api/studio/bootstrap', { credentials: 'include' });

    if (res.status === 401) {
      clearScopedLocalCache();
      const statusRes = await fetch('/api/status', { credentials: 'include' }).catch(() => null);
      const statusData = statusRes && statusRes.ok ? await statusRes.json() : { hasUsers: true };
      emit('auth:required', { hasUsers: statusData.hasUsers });
      emit('sync:status', { isSaving: false, text: 'Acceso no autenticado' });
      emit('data:ready', { source: 'local', authRequired: true });
      return { ok: false, status: 401, authRequired: true };
    }

    if (res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      if (errData && errData.error === 'license_suspended') {
        clearScopedLocalCache();
        emit('license:suspended', errData);
        emit('sync:status', { isSaving: false, text: 'Suscripción suspendida' });
        return { ok: false, status: 403, error: 'license_suspended' };
      }
      if (errData && errData.error === 'account_deactivated') {
        clearScopedLocalCache();
        emit('auth:account-deactivated', errData);
        emit('sync:status', { isSaving: false, text: 'Cuenta desactivada' });
        return { ok: false, status: 403, error: 'account_deactivated' };
      }
      if (errData && errData.error === 'no_organization') {
        currentUser = errData.user || null;
        state.currentUser = currentUser;
        state.organizationId = null;
        emit('auth:no-organization', { user: currentUser });
        emit('sync:status', { isSaving: false, text: 'Estudio requerido' });
        return { ok: false, status: 403, error: 'no_organization', user: currentUser };
      }
    }

    if (res.ok) {
      const data = await res.json();
      if (data && data.ok) {
        currentUser = data.user || null;
        currentOrganization = data.organization || null;

        state.currentUser = currentUser;
        state.organizationId = currentOrganization?.id || null;
        state.memberRole = data.memberRole || 'owner';
        state.allowedClientId = data.allowedClientId || '*';
        state.isSuperAdmin = currentUser?.role === 'super_admin';

        initLocalCache();

        // Poblar catálogo de Responsables / Firmas solo con miembros activos de la organización
        if (Array.isArray(data.members) && data.members.length > 0) {
          const activeShorts = [];
          const inactiveShorts = [];
          data.members.forEach((m) => {
            const mUser = m.user;
            if (mUser) {
              const memberShort = (mUser.shortName || mUser.name || '').trim();
              if (!memberShort) return;
              if (m.status === 'deactivated') {
                if (!inactiveShorts.includes(memberShort)) inactiveShorts.push(memberShort);
              } else {
                if (!activeShorts.includes(memberShort)) activeShorts.push(memberShort);
              }
            }
          });
          inactiveResponsiblesCache = inactiveShorts;
          responsiblesCache = responsiblesCache.filter((r) => !inactiveShorts.includes(r));
          activeShorts.forEach((s) => {
            if (!responsiblesCache.includes(s)) responsiblesCache.push(s);
          });
          writeLocal(RESPONSIBLES_STORAGE_KEY, responsiblesCache);
        }

        if (Array.isArray(data.clients)) {
          clientsCache = data.clients;
          writeLocal(CLIENTS_STORAGE_KEY, clientsCache);
        }
        if (Array.isArray(data.statuses)) {
          statusesCache = data.statuses;
          writeLocal(STATUSES_STORAGE_KEY, statusesCache);
        }
        if (Array.isArray(data.orders)) {
          ordersCache = data.orders;
          writeLocal(STORAGE_KEY, ordersCache);
        }
        if (data.stripboard && typeof data.stripboard === 'object') {
          stripboardCache = data.stripboard;
          writeLocal(STRIPBOARD_STORAGE_KEY, stripboardCache);
        }

        emit('sync:status', { isSaving: false, text: 'SQLite Activo', user: currentUser });
        emit('data:ready', { source: 'server', user: currentUser, organization: currentOrganization });
        return { ok: true, source: 'server', user: currentUser, organization: currentOrganization };
      }
    }

    // Si la respuesta no fue ok, operamos con la caché local
    emit('sync:status', { isSaving: false, text: 'Modo Offline (Local)' });
    emit('data:ready', { source: 'local', user: null });
    return { ok: true, source: 'local', user: null };
  } catch (err) {
    emit('sync:status', { isSaving: false, text: 'Modo Offline (Local)' });
    emit('data:ready', { source: 'local', user: null });
    return { ok: true, source: 'local', user: null };
  } finally {
    isBootstrapping = false;
    emit('data:sync');
  }
}

export function getCurrentUser() {
  return currentUser;
}

export function getCurrentOrganization() {
  return currentOrganization;
}

export async function fetchFullOrganization() {
  if (typeof fetch === 'undefined') return currentOrganization;
  try {
    const bootRes = await fetch('/api/studio/bootstrap', { credentials: 'include' });
    if (bootRes.ok) {
      const bootData = await bootRes.json();
      if (bootData && bootData.ok && bootData.organization) {
        currentOrganization = bootData.organization;
        return currentOrganization;
      }
    }
    const res = await fetch('/api/auth/organization/get-full-organization', {
      credentials: 'include'
    });
    if (res.ok) {
      const data = await res.json();
      currentOrganization = data;
      return data;
    }
  } catch (err) {
    console.warn('[DataBridge] Error cargando organización:', err);
  }
  return currentOrganization;
}

// ============================================================================
// SUBIDA FÍSICA DE ARCHIVOS HACIA /api/studio/upload
// ============================================================================
export async function uploadOtFiles(otId, fileList) {
  if (!otId || !fileList || fileList.length === 0) return [];
  const ot = getOrderById(otId);
  if (!ot) return [];

  if (!ot.mediaFiles) ot.mediaFiles = [];
  const uploadedItems = [];

  emit('sync:status', { isSaving: true, text: `Subiendo ${fileList.length} archivo(s)...` });

  for (const file of Array.from(fileList)) {
    try {
      const formData = new FormData();
      formData.append('ot_id', ot.id);
      formData.append('file', file);

      const res = await fetch('/api/studio/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (res.ok) {
        const result = await res.json();
        if (result && result.ok && result.mediaItem) {
          ot.mediaFiles.push(result.mediaItem);
          uploadedItems.push(result.mediaItem);
        }
      }
    } catch (err) {
      console.error('[DataBridge] Error subiendo archivo a SQLite/Uploads:', err);
    }
  }

  saveOrders(ordersCache);
  emit('sync:status', { isSaving: false, text: 'SQLite Sincronizado' });
  return uploadedItems;
}

export async function shareMediaForReview(otId, mediaFileId) {
  if (!otId || !mediaFileId) return null;
  const res = await fetch('/api/studio/reviews/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ otId, mediaFileId }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || 'No se pudo generar el enlace de revisión.');
  }
  const ot = getOrderById(otId);
  if (ot && Array.isArray(ot.mediaFiles)) {
    const target = ot.mediaFiles.find((m) => m.id === mediaFileId);
    if (target && data.mediaFile) {
      target.versionGroupId = data.mediaFile.versionGroupId;
      target.reviewStatus = data.mediaFile.reviewStatus;
    }
  }
  return data;
}

export async function uploadMediaVersion(otId, parentMediaId, file) {
  if (!otId || !parentMediaId || !file) return null;
  const formData = new FormData();
  formData.append('ot_id', otId);
  formData.append('parent_media_id', parentMediaId);
  formData.append('file', file);

  emit('sync:status', { isSaving: true, text: 'Subiendo nueva versión...' });
  const res = await fetch('/api/studio/reviews/version', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok || !data.mediaItem) {
    emit('sync:status', { isSaving: false, text: 'Error al subir versión' });
    throw new Error(data?.error || 'No se pudo subir la nueva versión.');
  }
  const ot = getOrderById(otId);
  if (ot) {
    if (!ot.mediaFiles) ot.mediaFiles = [];
    ot.mediaFiles.push(data.mediaItem);
  }
  emit('sync:status', { isSaving: false, text: 'SQLite Sincronizado' });
  return data.mediaItem;
}

// ============================================================================
// CATÁLOGO: RESPONSABLES
// ============================================================================
export function getResponsibles() {
  return [...responsiblesCache];
}

export function addResponsible(name) {
  if (!name || !name.trim()) return '';
  const clean = name.trim();
  if (legacyGenericRoles.includes(clean)) return clean;
  if (!responsiblesCache.some(r => r.toLowerCase() === clean.toLowerCase())) {
    responsiblesCache.push(clean);
    scheduleSync();
  }
  return clean;
}

export function getResponsibleOptionsHtml(selectedVal = '') {
  const responsibles = getResponsibles();
  let extraInactiveOption = '';
  if (selectedVal && !responsibles.includes(selectedVal)) {
    extraInactiveOption = `<option value="${escapeHtml(selectedVal)}" selected>${escapeHtml(selectedVal)} (Inactivo)</option>`;
  }
  const options = responsibles
    .map(r => `<option value="${escapeHtml(r)}" ${r === selectedVal ? 'selected' : ''}>${escapeHtml(r)}</option>`)
    .join('');
  return `${extraInactiveOption}${options}
    <option disabled>──────────</option>
    <option value="__NEW_RESPONSIBLE__">+ Nuevo</option>
  `;
}

// ============================================================================
// CATÁLOGO: DEPARTAMENTOS (DE / PARA)
// ============================================================================
export function getDepartments() {
  return [...departmentsCache];
}

export function addDepartment(name) {
  if (!name || !name.trim()) return '';
  const clean = name.trim();
  if (!departmentsCache.some(d => d.toLowerCase() === clean.toLowerCase())) {
    departmentsCache.push(clean);
    scheduleSync();
  }
  return clean;
}

export function getDepartmentOptionsHtml(selectedVal = '') {
  const depts = getDepartments();
  const hasSelected = Boolean(selectedVal && depts.some(d => d === selectedVal));
  const extraOption = (selectedVal && !hasSelected && selectedVal !== '__NEW_DEPT__')
    ? `<option value="${escapeHtml(selectedVal)}" selected>${escapeHtml(selectedVal)}</option>`
    : '';
  const options = depts
    .map(d => `<option value="${escapeHtml(d)}" ${d === selectedVal ? 'selected' : ''}>${escapeHtml(d)}</option>`)
    .join('');
  return `${extraOption}${options}
    <option disabled>──────────</option>
    <option value="__NEW_DEPT__">+ Nuevo</option>
  `;
}

// ============================================================================
// CATÁLOGO: ESTADOS DE TRÁFICO
// ============================================================================
export function getStatuses() {
  return [...statusesCache];
}

export function saveStatuses(statuses) {
  statusesCache = [...statuses];
  scheduleSync();
}

export function getStatusBadgeClass(statusName) {
  const statuses = getStatuses();
  const st = statuses.find(s => s.name.toLowerCase() === (statusName || '').toLowerCase());
  const color = st ? st.color : 'stone';
  const colorMap = {
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    blue: "bg-sky-500/10 text-sky-300 border-sky-500/25",
    cyan: "bg-cyan-500/10 text-cyan-300 border-cyan-500/25",
    purple: "bg-purple-500/10 text-purple-300 border-purple-500/25",
    emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
    red: "bg-rose-500/10 text-rose-300 border-rose-500/25",
    yellow: "bg-amber-400/10 text-amber-200 border-amber-400/25",
    stone: "bg-white/[0.05] text-zinc-300 border-white/[0.10]"
  };
  return colorMap[color] || colorMap.stone;
}

export function getStatusOptionsHtml(selectedVal = '') {
  const statuses = getStatuses();
  const hasSelected = Boolean(selectedVal && statuses.some(st => st.name === selectedVal));
  const extraOption = (selectedVal && !hasSelected && selectedVal !== '__NEW__')
    ? `<option value="${escapeHtml(selectedVal)}" selected>${escapeHtml(selectedVal)}</option>`
    : '';
  const options = statuses
    .map(st => `<option value="${escapeHtml(st.name)}" title="${escapeHtml(statusDescriptions[st.name] || '')}" ${st.name === selectedVal ? 'selected' : ''}>${escapeHtml(st.name)}</option>`)
    .join('');
  return `${extraOption}${options}
    <option disabled>──────────</option>
    <option value="__NEW__">+ Nuevo</option>
  `;
}

export function deleteStatus(statusId) {
  statusesCache = statusesCache.filter(s => s.id !== statusId);
  saveStatuses(statusesCache);
}

export function renameStatus(statusId, newName) {
  const st = statusesCache.find(s => s.id === statusId);
  if (st && newName && newName.trim()) {
    const oldName = st.name;
    st.name = newName.trim();
    // Actualizar las órdenes que tenían el estado anterior
    ordersCache.forEach(ot => {
      if (ot.status === oldName) {
        ot.status = st.name;
      }
    });
    saveStatuses(statusesCache);
    saveOrders(ordersCache);
  }
}

export function updateStatusColor(statusId, newColor) {
  const st = statusesCache.find(s => s.id === statusId);
  if (st && newColor) {
    st.color = newColor;
    saveStatuses(statusesCache);
  }
}

// ============================================================================
// CRUD: ÓRDENES DE TRABAJO (OTS)
// ============================================================================
export function getOrders() {
  return [...ordersCache];
}

export function getOrderById(id) {
  return ordersCache.find(o => o.id === id) || null;
}

export function saveOrders(orders) {
  ordersCache = [...orders];
  scheduleSync();
}

export function getActiveRoute(ot) {
  if (!ot) return null;
  if (!ot.routes || ot.routes.length === 0) {
    const fallbackResp = getActiveUserShortName() || 'Usuario';
    ot.routes = [{
      from: 'Tráfico',
      to: ot.responsible || fallbackResp,
      task: ot.title || ot.description || '',
      entryDate: ot.createdAt || getNowFormatted(),
      deliveryDate: '',
      sign: ot.responsible || fallbackResp,
      notes: '',
      stamp: null,
      completed: false
    }];
    return ot.routes[0];
  }
  const pending = ot.routes.find(r => !r.completed);
  return pending || ot.routes[ot.routes.length - 1];
}

export function syncOtStatusAndRoute(otId, newStatus, { syncLatestRouteTo = true } = {}) {
  if (!otId || !newStatus) return null;
  const ot = ordersCache.find(o => o.id === otId);
  if (!ot) return null;

  ot.status = newStatus;
  if (syncLatestRouteTo && Array.isArray(ot.routes) && ot.routes.length > 0) {
    const activeRoute = ot.routes.find(r => !r.completed) || ot.routes[ot.routes.length - 1];
    if (activeRoute) {
      activeRoute.to = newStatus;
    }
  }
  saveOrders(ordersCache);
  return ot;
}

export function updateOtField(otId, field, value) {
  const ot = getOrderById(otId);
  if (!ot) return;
  ot[field] = value;
  saveOrders(ordersCache);
}

export async function deleteOt(otId) {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
  ordersCache = ordersCache.filter(o => o.id !== otId && o.parentOtId !== otId);
  Object.keys(stripboardCache).forEach(dateKey => {
    stripboardCache[dateKey] = (stripboardCache[dateKey] || []).filter(
      s => s.otId !== otId && !(s.otId && String(s.otId).startsWith(`${otId}-`))
    );
  });
  writeLocal(STORAGE_KEY, ordersCache);
  writeLocal(STRIPBOARD_STORAGE_KEY, stripboardCache);
  emit('data:changed', { timestamp: Date.now() });

  if (typeof fetch !== 'undefined') {
    try {
      await fetch(`/api/studio/orders/${encodeURIComponent(otId)}`, {
        method: 'DELETE',
        credentials: 'include'
      });
    } catch (err) {
      console.warn('[DataBridge] Error eliminando OT en servidor:', err);
    }
  }
}

export async function createOt(otData = {}) {
  const profile = getUserProfile();
  const activeShort = getActiveUserShortName();
  const defaultDept = (profile.departments && profile.departments.length > 0) ? profile.departments[0] : 'Tráfico';

  const requestBody = {
    parentOtId: otData.parentOtId || null,
    ref: otData.ref || '',
    discipline: otData.discipline || 'advertising',
    client: otData.client || 'Interno',
    brand: otData.brand || '',
    product: otData.product || '',
    title: otData.title || otData.description || 'Nueva OT',
    media: otData.media || 'Digital',
    urgent: !!otData.urgent,
    status: otData.status || 'Tráfico',
    responsible: otData.responsible || activeShort || 'Usuario',
    brief: otData.brief || '',
    legalText: otData.legalText || '',
    deliveryDate: otData.deliveryDate || '',
    routes: otData.routes && otData.routes.length > 0 ? otData.routes : [
      {
        from: otData.from || defaultDept || 'Cliente',
        to: 'Tráfico',
        task: otData.title || otData.description || 'Recepción inicial de OT',
        entryDate: getNowFormatted(),
        deliveryDate: otData.deliveryDate || '',
        sign: otData.responsible || activeShort || 'Usuario',
        notes: '',
        stamp: 'RECIBIDO',
        completed: false
      }
    ]
  };

  if (typeof fetch !== 'undefined') {
    const res = await fetch('/api/studio/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(requestBody)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.order) {
      throw new Error(data.message || 'No se pudo crear la OT en el servidor.');
    }
    ordersCache.unshift(data.order);
    writeLocal(STORAGE_KEY, ordersCache);
    emit('data:changed', { timestamp: Date.now() });
    return data.order;
  }

  return null;
}

// ============================================================================
// CRUD: CLIENTES Y MARCAS
// ============================================================================
export function getClients() {
  return [...clientsCache];
}

export function saveClients(clients) {
  clientsCache = [...clients];
  scheduleSync();
}

export function addClient(name, brands = [], color = 'emerald') {
  if (!name || !name.trim()) return null;
  const cleanName = name.trim();
  let client = clientsCache.find(c => c.name.toLowerCase() === cleanName.toLowerCase());
  if (!client) {
    client = {
      id: `c-${Date.now()}`,
      name: cleanName,
      color: color || 'emerald',
      brands: Array.isArray(brands) ? brands : []
    };
    clientsCache.push(client);
    saveClients(clientsCache);
  }
  return client;
}

export async function deleteClient(clientId) {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
  clientsCache = clientsCache.filter(c => c.id !== clientId);
  writeLocal(CLIENTS_STORAGE_KEY, clientsCache);
  emit('data:changed', { timestamp: Date.now() });

  if (typeof fetch !== 'undefined') {
    try {
      await fetch(`/api/studio/clients/${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
        credentials: 'include'
      });
    } catch (err) {
      console.warn('[DataBridge] Error eliminando cliente en servidor:', err);
    }
  }
}

export function addBrand(clientName, brandName) {
  if (!clientName || !brandName || !brandName.trim()) return;
  const client = clientsCache.find(c => c.name.toLowerCase() === clientName.toLowerCase());
  if (client) {
    if (!client.brands) client.brands = [];
    const cleanBrand = brandName.trim();
    if (!client.brands.some(b => b.toLowerCase() === cleanBrand.toLowerCase())) {
      client.brands.push(cleanBrand);
      saveClients(clientsCache);
    }
  }
}

export function deleteBrand(clientName, brandName) {
  const client = clientsCache.find(c => c.name.toLowerCase() === clientName.toLowerCase());
  if (client && client.brands) {
    client.brands = client.brands.filter(b => b.toLowerCase() !== brandName.toLowerCase());
    saveClients(clientsCache);
  }
}

// ============================================================================
// CRUD: STRIPBOARD DE PRODUCCIÓN
// ============================================================================
export function getAllStripboardStorage() {
  return { ...stripboardCache };
}

export function getDayStrips(dateStr) {
  if (!dateStr) return [];
  return stripboardCache[dateStr] ? [...stripboardCache[dateStr]] : [];
}

export function saveDayStrips(dateStr, strips) {
  if (!dateStr) return;
  stripboardCache[dateStr] = [...strips];
  emit('stripboard:updated', { dateStr });
  scheduleSync();
}

export function moveStrip(dateStr, index, direction) {
  const strips = getDayStrips(dateStr);
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= strips.length) return;
  const temp = strips[index];
  strips[index] = strips[targetIndex];
  strips[targetIndex] = temp;
  saveDayStrips(dateStr, strips);
}

export async function removeStrip(dateStr, index) {
  const strips = getDayStrips(dateStr);
  if (index >= 0 && index < strips.length) {
    const [removed] = strips.splice(index, 1);
    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = null;
    }
    stripboardCache[dateStr] = [...strips];
    writeLocal(STRIPBOARD_STORAGE_KEY, stripboardCache);
    emit('stripboard:updated', { dateStr });

    if (removed?.id && typeof fetch !== 'undefined') {
      try {
        await fetch(`/api/studio/stripboard/${encodeURIComponent(removed.id)}`, {
          method: 'DELETE',
          credentials: 'include'
        });
      } catch (err) {
        console.warn('[DataBridge] Error eliminando tira en servidor:', err);
      }
    }
  }
}

export function updateStripField(dateStr, index, field, value) {
  const strips = getDayStrips(dateStr);
  if (index >= 0 && index < strips.length) {
    strips[index][field] = value;
    saveDayStrips(dateStr, strips);
  }
}

export function cycleStripStatusOnDate(dateStr, index) {
  const strips = getDayStrips(dateStr);
  if (index >= 0 && index < strips.length) {
    const cycle = ['Por Iniciar', 'En Mesa', 'Entregado', 'Detenido'];
    const current = strips[index].shiftStatus || 'Por Iniciar';
    const nextIdx = (cycle.indexOf(current) + 1) % cycle.length;
    strips[index].shiftStatus = cycle[nextIdx];
    saveDayStrips(dateStr, strips);
  }
}

// ============================================================================
// EXPOSICIÓN GLOBAL EN WINDOW
// ============================================================================
if (typeof window !== 'undefined') {
  window.getUserProfile = getUserProfile;
  window.saveUserProfile = saveUserProfile;
  window.getActiveUserShortName = getActiveUserShortName;
  window.renderUserAvatarHtml = renderUserAvatarHtml;
}


