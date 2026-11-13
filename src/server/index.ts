import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { db, sqlite, initDatabaseAndSeed } from './db';
import {
  users,
  clients,
  statuses,
  workOrders,
  routeEntries,
  mediaFiles,
  stripboardStrips,
  sharedReviews,
} from './db/schema';
import { auth } from './auth';
import { saveUploadedFileForOt, uploadsDir } from './services/upload-helper';
import { studioReviewRoutes, publicReviewRoutes } from './routes/reviews';

initDatabaseAndSeed();

type Variables = {
  user: typeof auth.$Infer.Session.user;
  session: typeof auth.$Infer.Session.session;
  organizationId: string;
  memberRole: 'owner' | 'member' | 'client';
  allowedClientId: string;
};

export const app = new Hono<{ Variables: Variables }>();

app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'https://trafico.elmarcante.com'],
    credentials: true,
  })
);

// Bloqueo RBAC en endpoints de Better Auth de gestión de equipo e invitaciones (solo Dueño)
const OWNER_ONLY_AUTH_PATHS = new Set([
  '/api/auth/organization/invite-member',
  '/api/auth/organization/cancel-invitation',
  '/api/auth/organization/update-member-role',
  '/api/auth/organization/remove-member',
]);

app.use('/api/auth/organization/*', async (c, next) => {
  if (c.req.method === 'POST' && OWNER_ONLY_AUTH_PATHS.has(c.req.path)) {
    const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
    const activeOrgId = (session?.session as any)?.activeOrganizationId;
    if (!session?.user || !activeOrgId) {
      return c.json({ ok: false, error: 'unauthorized', message: 'Sesión no válida.' }, 401);
    }
    const caller = sqlite
      .prepare('SELECT id, role, status FROM members WHERE user_id = ? AND organization_id = ?')
      .get(session.user.id, activeOrgId) as { id: string; role: string; status?: string } | undefined;
    if (!caller || caller.status === 'deactivated' || caller.role !== 'owner') {
      return c.json({ ok: false, error: 'forbidden', message: 'Solo el Dueño del estudio puede gestionar miembros o invitaciones.' }, 403);
    }
  }
  await next();
});

// 1. ENDPOINTS DE AUTENTICACIÓN (BETTER AUTH - REGISTRO ABIERTO PLG)
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw);
});

// 2. ENDPOINT PÚBLICO DE VERIFICACIÓN DE ESTADO DE SERVIDOR Y SESIÓN
app.get('/api/studio/status', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  return c.json({
    ok: true,
    authenticated: Boolean(session),
    user: session?.user || null,
  });
});

// 3. RUTAS PÚBLICAS DE REVISIÓN EXTERNA COMPARTIDA (SIN LOGIN REQUERIDO)
app.route('/api/public/review', publicReviewRoutes);

// 3.0.1 CONSULTA PÚBLICA DE METADATOS DE INVITACIÓN (PARA VALIDAR DESTINATARIO EN ?invite=)
app.get('/api/public/invite/:id', (c) => {
  const id = c.req.param('id');
  const row = sqlite
    .prepare(
      `SELECT i.id, i.email, i.role, i.status, o.name AS organization_name
       FROM invitations i
       LEFT JOIN organizations o ON o.id = i.organization_id
       WHERE i.id = ?`
    )
    .get(id) as any;

  if (!row) {
    return c.json({ ok: false, error: 'Invitación no encontrada.' }, 404);
  }

  return c.json({
    ok: true,
    invite: {
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      organizationName: row.organization_name || 'Estudio',
    },
  });
});

// 3.1 ENDPOINT WEBHOOK DE FACTURACIÓN (BOLD COLOMBIA)
app.post('/api/billing/webhook', async (c) => {
  const expectedSecret = process.env.BOLD_WEBHOOK_SECRET;
  if (expectedSecret) {
    const receivedSecret =
      c.req.header('x-bold-signature') ||
      c.req.header('x-webhook-secret') ||
      c.req.header('authorization')?.replace('Bearer ', '');

    if (receivedSecret !== expectedSecret) {
      console.warn('[Billing Webhook] Intento de webhook no autorizado');
      return c.json({ ok: false, error: 'unauthorized', message: 'Secreto de webhook inválido' }, 401);
    }
  }

  let body: any = null;
  try {
    body = await c.req.json();
  } catch (_) {
    return c.json({ ok: false, error: 'invalid_json', message: 'Cuerpo de petición inválido' }, 400);
  }

  const status = (
    body?.data?.status ||
    body?.status ||
    body?.order_status ||
    body?.event ||
    ''
  ).toUpperCase();

  const orgId =
    body?.data?.reference ||
    body?.reference ||
    body?.order_id ||
    body?.metadata?.organizationId ||
    body?.organizationId ||
    body?.data?.metadata?.organizationId ||
    '';

  const isApproved =
    status === 'APPROVED' ||
    status === 'APPROVED_BY_CARD' ||
    status === 'CHECKOUT.COMPLETED' ||
    status === 'PAID';

  if (isApproved && orgId) {
    const org = sqlite.prepare('SELECT id FROM organizations WHERE id = ? OR slug = ?').get(orgId, orgId) as { id: string } | undefined;
    if (org) {
      sqlite
        .prepare("UPDATE organizations SET subscription_status = 'active', status = 'active' WHERE id = ?")
        .run(org.id);
      console.log(`[Billing Webhook] Organización ${org.id} reactivada exitosamente a 'active'.`);
      return c.json({ ok: true, received: true, activated: true, organizationId: org.id });
    } else {
      console.warn(`[Billing Webhook] Organización con referencia '${orgId}' no encontrada.`);
    }
  }

  return c.json({ ok: true, received: true, status, processed: isApproved });
});

// 4. MIDDLEWARE PROTEGIDO POR ORGANIZACIÓN (BETTER AUTH)
app.use('/api/studio/*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ ok: false, error: 'unauthorized', message: 'No autorizado. Inicia sesión en El Marcante.' }, 401);
  }

  let activeOrgId = (session.session as any).activeOrganizationId as string | null | undefined;

  if (!activeOrgId) {
    // 1. Revisar si el usuario ya es miembro de alguna organización existente (priorizando membresías activas)
    const membership = sqlite
      .prepare(
        `SELECT organization_id FROM members 
         WHERE user_id = ? 
         ORDER BY CASE WHEN status != 'deactivated' THEN 0 ELSE 1 END, created_at ASC 
         LIMIT 1`
      )
      .get(session.user.id) as { organization_id: string } | undefined;

    if (membership && membership.organization_id) {
      activeOrgId = membership.organization_id;
      await auth.api.setActiveOrganization({
        body: { organizationId: activeOrgId },
        headers: c.req.raw.headers,
      }).catch(() => {});
    }
  }

  // Si aún no tiene organización asignada, no auto-crear silenciosamente con slug aleatorio;
  // el cliente detectará esto y lo guiará al onboarding "Bautiza tu Estudio"
  if (!activeOrgId) {
    return c.json(
      {
        ok: false,
        error: 'no_organization',
        user: session.user,
        message: 'Usuario sin espacio de trabajo asignado. Requiere nombrar su estudio.',
      },
      403
    );
  }

  // Verificar que el miembro no esté desactivado en este estudio y obtener su rol/alcance
  const activeMembership = sqlite
    .prepare('SELECT id, role, allowed_client_id, status FROM members WHERE user_id = ? AND organization_id = ?')
    .get(session.user.id, activeOrgId) as
    | { id: string; role?: string; allowed_client_id?: string; status?: string }
    | undefined;

  if (!activeMembership || activeMembership.status === 'deactivated') {
    return c.json(
      {
        ok: false,
        error: 'account_deactivated',
        message: 'Tu cuenta ha sido desactivada en este estudio. Contacta al Director del espacio.',
      },
      403
    );
  }

  const memberRole: 'owner' | 'member' | 'client' =
    activeMembership.role === 'owner'
      ? 'owner'
      : activeMembership.role === 'client'
        ? 'client'
        : 'member';
  const allowedClientId = activeMembership.allowed_client_id || '*';

  // Migración idempotente para asociar registros huérfanos sin organizationId
  const hasOrgData = sqlite.prepare('SELECT COUNT(*) as c FROM work_orders WHERE organization_id IS NOT NULL').get() as { c: number };
  if (hasOrgData.c === 0 && activeOrgId) {
    sqlite.prepare('UPDATE clients SET organization_id = ? WHERE organization_id IS NULL').run(activeOrgId);
    sqlite.prepare('UPDATE statuses SET organization_id = ? WHERE organization_id IS NULL').run(activeOrgId);
    sqlite.prepare('UPDATE work_orders SET organization_id = ? WHERE organization_id IS NULL').run(activeOrgId);
    sqlite.prepare('UPDATE route_entries SET organization_id = ? WHERE organization_id IS NULL').run(activeOrgId);
    sqlite.prepare('UPDATE media_files SET organization_id = ? WHERE organization_id IS NULL').run(activeOrgId);
    sqlite.prepare('UPDATE stripboard_strips SET organization_id = ? WHERE organization_id IS NULL').run(activeOrgId);
  }

  c.set('user', session.user);
  c.set('session', session.session);
  c.set('organizationId', activeOrgId);
  c.set('memberRole', memberRole);
  c.set('allowedClientId', allowedClientId);

  // Validación de licencia suspendida, expiración de prueba gratuita y suscripción activa (PLG)
  const orgCheck = sqlite
    .prepare('SELECT status, subscription_status, trial_ends_at FROM organizations WHERE id = ?')
    .get(activeOrgId) as { status?: string; subscription_status?: string; trial_ends_at?: number } | undefined;

  if (orgCheck?.status === 'suspended') {
    return c.json(
      {
        ok: false,
        error: 'license_suspended',
        message: 'Suscripción suspendida.',
      },
      403
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const trialEndsAt = orgCheck?.trial_ends_at || (nowSec + 14 * 86400);
  const isTrialExpired = (nowSec > trialEndsAt) && (orgCheck?.subscription_status !== 'active');

  // Si la prueba expiró y no es una petición GET (permite bootstrap/lectura para respaldos), rechazar mutaciones con 402
  if (isTrialExpired && c.req.method !== 'GET') {
    return c.json(
      {
        ok: false,
        error: 'trial_expired',
        message: 'Tu período de prueba de 14 días ha finalizado. Activa tu suscripción para continuar editando.',
      },
      402
    );
  }

  await next();
});

function resolveAllowedClientName(organizationId: string, allowedClientId: string): string | null {
  if (!allowedClientId || allowedClientId === '*') return null;
  const row = sqlite
    .prepare('SELECT name FROM clients WHERE organization_id = ? AND (id = ? OR lower(name) = lower(?)) LIMIT 1')
    .get(organizationId, allowedClientId, allowedClientId) as { name: string } | undefined;
  return row?.name || allowedClientId;
}

function parseUserDepartments(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((d) => String(d).trim().toLowerCase()).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((d) => String(d).trim().toLowerCase()).filter(Boolean);
    } catch (_) {
      return raw.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
    }
  }
  return [];
}

function isOrderAuthorizedForUser(params: {
  organizationId: string;
  memberRole: 'owner' | 'member' | 'client';
  allowedClientId: string;
  userDepts: string[];
  userIdentifiers: string[];
  clientName?: string | null;
  responsible?: string | null;
  routes?: Array<{ from?: string; to?: string; fromDept?: string; toDept?: string; sign?: string }>;
}): boolean {
  const { organizationId, memberRole, allowedClientId, userDepts, userIdentifiers, clientName, responsible, routes } = params;
  if (memberRole === 'owner') return true;

  const allowedName = resolveAllowedClientName(organizationId, allowedClientId);
  const otClient = (clientName || '').trim().toLowerCase();

  if (memberRole === 'client') {
    if (!allowedName) return false;
    return otClient === allowedName.trim().toLowerCase();
  }

  // member
  if (allowedClientId === '*') return true;
  if (allowedName && otClient === allowedName.trim().toLowerCase()) return true;

  const respLower = (responsible || '').trim().toLowerCase();
  if (respLower && userIdentifiers.includes(respLower)) return true;

  if (Array.isArray(routes)) {
    for (const r of routes) {
      const fromDept = (r.from || r.fromDept || '').trim().toLowerCase();
      const toDept = (r.to || r.toDept || '').trim().toLowerCase();
      const sign = (r.sign || '').trim().toLowerCase();
      if (fromDept && userDepts.includes(fromDept)) return true;
      if (toDept && userDepts.includes(toDept)) return true;
      if (sign && userIdentifiers.includes(sign)) return true;
    }
  }
  return false;
}

function getDirectorySizeBytes(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) total += getDirectorySizeBytes(full);
    else total += fs.statSync(full).size;
  }
  return total;
}

// 5. CARGA COMPLETA DEL ESTUDIO DESDE SQLITE (BOOTSTRAP)
app.get('/api/studio/bootstrap', async (c) => {
  const organizationId = c.get('organizationId');
  const user = c.get('user');
  const memberRole = c.get('memberRole');
  const allowedClientId = c.get('allowedClientId');

  // Obtener la organización completa (con miembros e invitaciones) usando Better Auth
  let fullOrg: any = null;
  try {
    fullOrg = await auth.api.getFullOrganization({ headers: c.req.raw.headers });
  } catch (err) {
    console.warn('[Bootstrap] Error obteniendo full organization:', err);
  }

  // Enriquecer el usuario de sesión con sus datos operativos actualizados desde SQLite
  const dbSessionUser = user?.id
    ? (sqlite.prepare('SELECT short_name, color, avatar_mode, avatar_icon, departments, phone FROM users WHERE id = ?').get(user.id) as any)
    : null;
  const enrichedUser = user
    ? {
        ...user,
        shortName: dbSessionUser?.short_name || (user as any).shortName || user.name,
        color: dbSessionUser?.color || (user as any).color || 'cyan',
        avatarMode: dbSessionUser?.avatar_mode || (user as any).avatarMode || 'initials',
        avatarIcon: dbSessionUser?.avatar_icon || (user as any).avatarIcon || 'pen',
        departments: dbSessionUser?.departments || (user as any).departments || '[]',
        phone: dbSessionUser?.phone || (user as any).phone || '',
      }
    : null;

  // Enriquecer los miembros con sus campos operativos (status, roleTitle, shortName, color, avatar, departments, phone)
  if (fullOrg && Array.isArray(fullOrg.members)) {
    fullOrg.members = fullOrg.members.map((m: any) => {
      const dbUser = sqlite
        .prepare('SELECT short_name, color, avatar_mode, avatar_icon, departments, phone FROM users WHERE id = ?')
        .get(m.userId) as any;
      const dbMember = sqlite
        .prepare('SELECT status, role_title, allowed_client_id FROM members WHERE id = ?')
        .get(m.id) as { status?: string; role_title?: string; allowed_client_id?: string } | undefined;

      return {
        ...m,
        status: dbMember?.status || m.status || 'active',
        roleTitle: dbMember?.role_title || m.roleTitle || 'Creativo',
        allowedClientId: dbMember?.allowed_client_id || m.allowedClientId || '*',
        user: dbUser
          ? {
              ...m.user,
              shortName: dbUser.short_name || m.user?.name,
              color: dbUser.color || 'cyan',
              avatarMode: dbUser.avatar_mode || 'initials',
              avatarIcon: dbUser.avatar_icon || 'pen',
              departments: dbUser.departments || '[]',
              phone: dbUser.phone || '',
            }
          : m.user,
      };
    });
  }

  // Filtrar todos los datos del estudio por organizationId
  let studioClients = organizationId ? db.select().from(clients).where(eq(clients.organizationId, organizationId)).all() : [];
  let studioStatuses = organizationId ? db.select().from(statuses).where(eq(statuses.organizationId, organizationId)).all() : [];
  let studioOrders = organizationId ? db.select().from(workOrders).where(eq(workOrders.organizationId, organizationId)).all() : [];
  let studioRoutes = organizationId ? db.select().from(routeEntries).where(eq(routeEntries.organizationId, organizationId)).all() : [];
  let studioMedia = organizationId ? db.select().from(mediaFiles).where(eq(mediaFiles.organizationId, organizationId)).all() : [];
  let studioStrips = organizationId ? db.select().from(stripboardStrips).where(eq(stripboardStrips.organizationId, organizationId)).all() : [];

  // Semilla de estados predeterminados si es un espacio nuevo sin estados
  if (studioStatuses.length === 0 && organizationId) {
    const defaultStatusesSeed = [
      { name: 'Redacción', color: 'amber' },
      { name: 'Creativos', color: 'purple' },
      { name: 'Cuentas', color: 'blue' },
      { name: 'Tráfico', color: 'amber' },
      { name: 'Arte Final', color: 'emerald' },
      { name: 'Facturación', color: 'indigo' },
      { name: 'Aprobación Cliente', color: 'emerald' },
      { name: 'Cancelada', color: 'rose' },
    ];
    defaultStatusesSeed.forEach((st, idx) => {
      sqlite.prepare('INSERT INTO statuses (id, organization_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)').run(
        'st-' + Math.random().toString(36).substring(2, 8),
        organizationId,
        st.name,
        st.color,
        idx
      );
    });
    studioStatuses = db.select().from(statuses).where(eq(statuses.organizationId, organizationId)).all();
  }

  // Datos comerciales de suscripción y prueba gratuita (PLG)
  const orgRow = sqlite
    .prepare('SELECT status, subscription_status, trial_ends_at FROM organizations WHERE id = ?')
    .get(organizationId) as { status?: string; subscription_status?: string; trial_ends_at?: number } | undefined;

  const nowSec = Math.floor(Date.now() / 1000);
  let trialEndsAt = orgRow?.trial_ends_at;
  if (!trialEndsAt && organizationId) {
    trialEndsAt = nowSec + 14 * 86400;
    try {
      sqlite
        .prepare('UPDATE organizations SET trial_ends_at = ?, subscription_status = COALESCE(subscription_status, "trialing") WHERE id = ?')
        .run(trialEndsAt, organizationId);
    } catch (_) {}
  }
  const trialDaysLeft = Math.max(0, Math.ceil(((trialEndsAt || (nowSec + 14 * 86400)) - nowSec) / 86400));
  const subscriptionStatus = orgRow?.subscription_status || 'trialing';

  const userDepts = parseUserDepartments(enrichedUser?.departments);
  const userIdentifiers = [
    enrichedUser?.shortName,
    enrichedUser?.name,
    enrichedUser?.email,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim().toLowerCase());

  if (memberRole !== 'owner' && allowedClientId !== '*') {
    const allowedName = resolveAllowedClientName(organizationId, allowedClientId);
    studioClients = studioClients.filter(
      (cl) => cl.id === allowedClientId || (allowedName && cl.name.toLowerCase() === allowedName.toLowerCase())
    );
  }

  const ordersHydratedAll = studioOrders.map((ot) => ({
    ...ot,
    responsible: (ot as any).responsible || '',
    urgent: Boolean(ot.urgent),
    routes: studioRoutes
      .filter((r) => r.otId === ot.id)
      .sort((a, b) => a.lineNumber - b.lineNumber)
      .map((r) => ({
        id: r.id,
        from: r.fromDept,
        to: r.toDept,
        task: r.task,
        entryDate: r.entryDate,
        deliveryDate: r.deliveryDate,
        sign: (r as any).sign || '',
        notes: (r as any).notes || '',
        stamp: r.stamp,
        completed: Boolean(r.completed),
      })),
    mediaFiles: studioMedia.filter((m) => m.otId === ot.id),
  }));

  const ordersHydrated = ordersHydratedAll.filter((ot) =>
    isOrderAuthorizedForUser({
      organizationId,
      memberRole,
      allowedClientId,
      userDepts,
      userIdentifiers,
      clientName: ot.client,
      responsible: ot.responsible,
      routes: ot.routes,
    })
  );

  const stripboardByDate: Record<string, any[]> = {};
  studioStrips
    .filter((st) => {
      if (memberRole === 'owner') return !st.userId || st.userId === user.id;
      return st.userId === user.id;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .forEach((st) => {
      if (!stripboardByDate[st.dateStr]) stripboardByDate[st.dateStr] = [];
      stripboardByDate[st.dateStr].push({
        id: st.id,
        userId: st.userId || user.id,
        type: st.type,
        otId: st.otId,
        title: st.title,
        client: st.client,
        brand: st.brand,
        product: st.product,
        timeSlot: st.timeSlot,
        task: st.task,
        assignee: st.assignee,
        shiftStatus: st.shiftStatus,
      });
    });

  return c.json({
    ok: true,
    memberRole,
    allowedClientId,
    user: enrichedUser,
    organization: {
      ...fullOrg,
      subscriptionStatus,
      trialEndsAt,
      trialDaysLeft,
    },
    members: fullOrg && Array.isArray(fullOrg.members) ? fullOrg.members : [],
    clients: studioClients.map((cl) => ({
      id: cl.id,
      name: cl.name,
      color: cl.color || 'emerald',
      brands: JSON.parse(cl.brandsJson || '[]'),
    })),
    statuses: studioStatuses,
    orders: ordersHydrated,
    stripboard: stripboardByDate,
  });
});

// 5.1 CREACIÓN SÍNCRONA ATÓMICA DE OTs Y SUB-OTs
app.post('/api/studio/orders', async (c) => {
  const organizationId = c.get('organizationId');
  const memberRole = c.get('memberRole');
  const allowedClientId = c.get('allowedClientId');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();

  const dbUser = user?.id
    ? (sqlite.prepare('SELECT short_name, departments FROM users WHERE id = ?').get(user.id) as any)
    : null;
  const userDepts = parseUserDepartments(dbUser?.departments);
  const userIdentifiers = [dbUser?.short_name, user?.name, user?.email]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim().toLowerCase());

  const createTx = sqlite.transaction(() => {
    const parentOtId = typeof body.parentOtId === 'string' ? body.parentOtId.trim() : '';
    let newId = '';
    let resolvedClient = typeof body.client === 'string' ? body.client.trim() : '';
    let resolvedBrand = typeof body.brand === 'string' ? body.brand.trim() : '';
    let resolvedProduct = typeof body.product === 'string' ? body.product.trim() : '';
    let resolvedRef = typeof body.ref === 'string' ? body.ref.trim() : '';

    if (parentOtId) {
      const parentOt = sqlite
        .prepare('SELECT * FROM work_orders WHERE id = ? AND organization_id = ?')
        .get(parentOtId, organizationId) as any;

      if (!parentOt) {
        return { errorStatus: 404 as const, error: 'ot_not_found', message: 'OT madre no encontrada.' };
      }

      const parentRoutes = sqlite
        .prepare('SELECT from_dept, to_dept, sign FROM route_entries WHERE ot_id = ? AND organization_id = ?')
        .all(parentOtId, organizationId) as Array<{ from_dept: string; to_dept: string; sign: string }>;

      const authorized = isOrderAuthorizedForUser({
        organizationId,
        memberRole,
        allowedClientId,
        userDepts,
        userIdentifiers,
        clientName: parentOt.client,
        responsible: parentOt.responsible,
        routes: parentRoutes.map((r) => ({ fromDept: r.from_dept, toDept: r.to_dept, sign: r.sign })),
      });
      if (!authorized) {
        return { errorStatus: 403 as const, error: 'forbidden', message: 'No autorizado para crear sub-OT en esta orden.' };
      }

      const childRows = sqlite
        .prepare('SELECT id FROM work_orders WHERE organization_id = ? AND (parent_ot_id = ? OR id LIKE ?)')
        .all(organizationId, parentOtId, `${parentOtId}-%`) as Array<{ id: string }>;

      let maxSuffix = 0;
      const prefix = `${parentOtId}-`;
      for (const row of childRows) {
        if (row.id.startsWith(prefix)) {
          const rest = row.id.slice(prefix.length);
          if (/^\d+$/.test(rest)) {
            const num = parseInt(rest, 10);
            if (num > maxSuffix) maxSuffix = num;
          }
        }
      }
      newId = `${parentOtId}-${maxSuffix + 1}`;
      resolvedClient = parentOt.client;
      resolvedBrand = parentOt.brand;
      resolvedProduct = parentOt.product || '';
      resolvedRef = parentOt.ref || '';
    } else {
      const yy = String(new Date().getFullYear()).slice(-2);
      const prefix = `OT-${yy}-`;
      const existingIds = sqlite
        .prepare('SELECT id FROM work_orders WHERE organization_id = ? AND id LIKE ?')
        .all(organizationId, `${prefix}%`) as Array<{ id: string }>;

      let maxSeq = 0;
      const re = new RegExp(`^OT-${yy}-(\\d+)(?:-\\d+)?$`);
      for (const row of existingIds) {
        const m = row.id.match(re);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > maxSeq) maxSeq = n;
        }
      }
      newId = `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;

      if (memberRole === 'client') {
        const forcedClient = resolveAllowedClientName(organizationId, allowedClientId);
        if (!forcedClient) {
          return { errorStatus: 403 as const, error: 'forbidden', message: 'Cliente asignado inválido.' };
        }
        resolvedClient = forcedClient;
      }
    }

    const discipline = typeof body.discipline === 'string' && body.discipline.trim() ? body.discipline.trim() : 'advertising';
    const title = typeof body.title === 'string' ? body.title.trim() : 'Nueva Orden de Trabajo';
    const media = typeof body.media === 'string' ? body.media.trim() : '';
    const status = typeof body.status === 'string' && body.status.trim() ? body.status.trim() : 'Tráfico';
    const responsible = typeof body.responsible === 'string' ? body.responsible.trim() : (dbUser?.short_name || user?.name || '');
    const urgent = body.urgent ? 1 : 0;
    const brief = typeof body.brief === 'string' ? body.brief : '';
    const legalText = typeof body.legalText === 'string' ? body.legalText : '';

    sqlite
      .prepare(
        `INSERT INTO work_orders (id, organization_id, parent_ot_id, ref, discipline, client, brand, product, title, media, status, responsible, urgent, brief, legal_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newId,
        organizationId,
        parentOtId || null,
        resolvedRef,
        discipline,
        resolvedClient || 'Sin Cliente',
        resolvedBrand || 'Sin Marca',
        resolvedProduct,
        title,
        media,
        status,
        responsible,
        urgent,
        brief,
        legalText,
        now,
        now
      );

    const rawRoutes = Array.isArray(body.routes) && body.routes.length > 0
      ? body.routes
      : [
          {
            from: 'Cuentas',
            to: 'Creativos',
            task: title,
            entryDate: now,
            deliveryDate: typeof body.deliveryDate === 'string' ? body.deliveryDate : '',
            sign: '',
            notes: '',
            completed: false,
          },
        ];

    const insRoute = sqlite.prepare(
      `INSERT INTO route_entries (organization_id, ot_id, line_number, from_dept, to_dept, task, entry_date, delivery_date, sign, notes, stamp, completed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const createdRoutes = rawRoutes.map((r: any, idx: number) => {
      const info = insRoute.run(
        organizationId,
        newId,
        idx + 1,
        r.from || 'Cuentas',
        r.to || 'Creativos',
        r.task || '',
        r.entryDate || now,
        r.deliveryDate || '',
        r.sign || '',
        r.notes || '',
        r.stamp || null,
        r.completed ? 1 : 0,
        now
      );
      return {
        id: Number(info.lastInsertRowid),
        from: r.from || 'Cuentas',
        to: r.to || 'Creativos',
        task: r.task || '',
        entryDate: r.entryDate || now,
        deliveryDate: r.deliveryDate || '',
        sign: r.sign || '',
        notes: r.notes || '',
        stamp: r.stamp || null,
        completed: Boolean(r.completed),
      };
    });

    return {
      order: {
        id: newId,
        organizationId,
        parentOtId: parentOtId || null,
        ref: resolvedRef,
        discipline,
        client: resolvedClient || 'Sin Cliente',
        brand: resolvedBrand || 'Sin Marca',
        product: resolvedProduct,
        title,
        media,
        status,
        responsible,
        urgent: Boolean(urgent),
        brief,
        legalText,
        reopenReason: null,
        createdAt: now,
        updatedAt: now,
        routes: createdRoutes,
        mediaFiles: [],
      },
    };
  });

  const result = createTx();
  if ('errorStatus' in result && result.errorStatus) {
    return c.json({ ok: false, error: result.error, message: result.message }, result.errorStatus);
  }
  return c.json({ ok: true, order: result.order }, 201);
});

// 6. GUARDADO TRANSACCIONAL ACOTADO EN SQLITE (FILTRADO POR ORGANIZACIÓN Y ROL)
app.post('/api/studio/sync', async (c) => {
  const organizationId = c.get('organizationId');
  const memberRole = c.get('memberRole');
  const allowedClientId = c.get('allowedClientId');
  const user = c.get('user');
  const body = await c.req.json();
  const now = new Date().toISOString();

  if (!organizationId) {
    return c.json({ ok: false, error: 'No se encontró un espacio de trabajo activo.' }, 400);
  }

  const dbUser = user?.id
    ? (sqlite.prepare('SELECT short_name, departments FROM users WHERE id = ?').get(user.id) as any)
    : null;
  const userDepts = parseUserDepartments(dbUser?.departments);
  const userIdentifiers = [dbUser?.short_name, user?.name, user?.email]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim().toLowerCase());

  if (Array.isArray(body.orders)) {
    for (const ot of body.orders) {
      if (!ot || !ot.id) continue;
      const existingOt = sqlite
        .prepare('SELECT id, organization_id, client, responsible FROM work_orders WHERE id = ?')
        .get(String(ot.id)) as { id: string; organization_id: string | null; client: string; responsible: string } | undefined;

      if (existingOt && existingOt.organization_id && existingOt.organization_id !== organizationId) {
        return c.json({ ok: false, error: 'forbidden', message: `Orden ${ot.id} pertenece a otro estudio.` }, 403);
      }

      const existingRoutes = existingOt
        ? (sqlite
            .prepare('SELECT from_dept, to_dept, sign FROM route_entries WHERE ot_id = ? AND organization_id = ?')
            .all(existingOt.id, organizationId) as Array<{ from_dept: string; to_dept: string; sign: string }>)
        : [];

      const authorized = isOrderAuthorizedForUser({
        organizationId,
        memberRole,
        allowedClientId,
        userDepts,
        userIdentifiers,
        clientName: existingOt?.client || ot.client,
        responsible: existingOt?.responsible || ot.responsible,
        routes: existingRoutes.length > 0
          ? existingRoutes.map((r) => ({ fromDept: r.from_dept, toDept: r.to_dept, sign: r.sign }))
          : (Array.isArray(ot.routes) ? ot.routes : []),
      });

      if (!authorized) {
        return c.json({ ok: false, error: 'forbidden', message: `No autorizado para sincronizar la orden ${ot.id}.` }, 403);
      }
    }
  }

  const syncTx = sqlite.transaction(() => {
    if (memberRole === 'owner' && Array.isArray(body.clients)) {
      sqlite.prepare('DELETE FROM clients WHERE organization_id = ?').run(organizationId);
      const insClient = sqlite.prepare(
        'INSERT OR REPLACE INTO clients (id, organization_id, name, color, brands_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const cl of body.clients) {
        insClient.run(
          cl.id || 'c-' + Date.now() + Math.random(),
          organizationId,
          cl.name || 'Sin nombre',
          cl.color || 'emerald',
          JSON.stringify(cl.brands || []),
          now
        );
      }
    }

    if (memberRole === 'owner' && Array.isArray(body.statuses)) {
      sqlite.prepare('DELETE FROM statuses WHERE organization_id = ?').run(organizationId);
      const insStatus = sqlite.prepare(
        'INSERT OR REPLACE INTO statuses (id, organization_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)'
      );
      body.statuses.forEach((st: any, idx: number) => {
        insStatus.run(st.id || 'st-' + idx, organizationId, st.name, st.color || 'amber', idx);
      });
    }

    if (Array.isArray(body.orders)) {
      const insOrder = sqlite.prepare(`
        INSERT INTO work_orders (id, organization_id, parent_ot_id, ref, discipline, client, brand, product, title, media, status, responsible, urgent, brief, legal_text, reopen_reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          parent_ot_id = COALESCE(excluded.parent_ot_id, work_orders.parent_ot_id),
          ref = excluded.ref,
          discipline = excluded.discipline,
          client = excluded.client,
          brand = excluded.brand,
          product = excluded.product,
          title = excluded.title,
          media = excluded.media,
          status = excluded.status,
          responsible = excluded.responsible,
          urgent = excluded.urgent,
          brief = excluded.brief,
          legal_text = excluded.legal_text,
          reopen_reason = COALESCE(excluded.reopen_reason, work_orders.reopen_reason),
          updated_at = excluded.updated_at
      `);
      const insRoute = sqlite.prepare(`
        INSERT INTO route_entries (organization_id, ot_id, line_number, from_dept, to_dept, task, entry_date, delivery_date, sign, notes, stamp, completed, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insMedia = sqlite.prepare(`
        INSERT INTO media_files (id, organization_id, ot_id, route_entry_id, name, type, ext, size, date, url, preview_url, preview_kind, content, version_group_id, version_number, review_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 1), COALESCE(?, 'draft'))
        ON CONFLICT(id) DO UPDATE SET
          ot_id = excluded.ot_id,
          route_entry_id = excluded.route_entry_id,
          name = excluded.name,
          type = excluded.type,
          ext = excluded.ext,
          size = excluded.size,
          date = excluded.date,
          url = excluded.url,
          preview_url = excluded.preview_url,
          preview_kind = excluded.preview_kind,
          content = excluded.content,
          version_group_id = COALESCE(?, media_files.version_group_id),
          version_number = COALESCE(?, media_files.version_number),
          review_status = COALESCE(?, media_files.review_status)
      `);

      for (const ot of body.orders) {
        if (!ot || !ot.id) continue;

        const existingOtRow = sqlite
          .prepare('SELECT status, reopen_reason FROM work_orders WHERE id = ? AND organization_id = ?')
          .get(ot.id, organizationId) as { status?: string; reopen_reason?: string | null } | undefined;

        const effectiveStatus =
          memberRole !== 'owner' && existingOtRow?.status === 'Archivada'
            ? 'Archivada'
            : (ot.status || 'Tráfico');
        const effectiveReopenReason =
          memberRole === 'owner' ? (ot.reopenReason || null) : (existingOtRow?.reopen_reason || null);

        insOrder.run(
          ot.id,
          organizationId,
          ot.parentOtId || null,
          ot.ref || '',
          ot.discipline || 'advertising',
          ot.client || '',
          ot.brand || ot.product || '',
          ot.product || '',
          ot.title || '',
          ot.media || '',
          effectiveStatus,
          ot.responsible || '',
          ot.urgent ? 1 : 0,
          ot.brief || '',
          ot.legalText || '',
          effectiveReopenReason,
          ot.createdAt || now,
          now
        );

        if (Array.isArray(ot.routes)) {
          const existingRouteRows = sqlite
            .prepare('SELECT line_number, delivery_date FROM route_entries WHERE ot_id = ? AND organization_id = ?')
            .all(ot.id, organizationId) as Array<{ line_number: number; delivery_date: string }>;
          const existingDeliveryByLine = new Map(existingRouteRows.map((r) => [r.line_number, r.delivery_date]));

          sqlite.prepare('DELETE FROM route_entries WHERE ot_id = ? AND organization_id = ?').run(ot.id, organizationId);
          ot.routes.forEach((r: any, idx: number) => {
            const lineNum = idx + 1;
            const lockedDelivery = existingDeliveryByLine.get(lineNum);
            const finalDeliveryDate =
              memberRole !== 'owner' && lockedDelivery && lockedDelivery.trim() !== ''
                ? lockedDelivery
                : (r.deliveryDate || '');

            insRoute.run(
              organizationId,
              ot.id,
              lineNum,
              r.from || 'Cuentas',
              r.to || 'Creativos',
              r.task || '',
              r.entryDate || '',
              finalDeliveryDate,
              r.sign || '',
              r.notes || '',
              r.stamp || null,
              r.completed ? 1 : 0,
              now
            );
          });
        }

        if (Array.isArray(ot.mediaFiles)) {
          const incomingOtMediaIds = new Set(ot.mediaFiles.map((m: any) => m?.id).filter(Boolean).map(String));
          const existingOtMedia = sqlite
            .prepare('SELECT id FROM media_files WHERE ot_id = ? AND organization_id = ?')
            .all(ot.id, organizationId) as Array<{ id: string }>;
          for (const em of existingOtMedia) {
            if (!incomingOtMediaIds.has(em.id)) {
              sqlite.prepare('DELETE FROM media_files WHERE id = ? AND organization_id = ?').run(em.id, organizationId);
            }
          }

          for (const m of ot.mediaFiles) {
            const vg = m.versionGroupId || null;
            const vn = typeof m.versionNumber === 'number' ? m.versionNumber : null;
            const rs = m.reviewStatus || null;
            insMedia.run(
              m.id || 'm-' + Date.now() + Math.random(),
              organizationId,
              ot.id,
              m.routeEntryId || null,
              m.name || 'Archivo',
              m.type || 'document',
              m.ext || '',
              m.size || '',
              m.date || '',
              m.url || '',
              m.previewUrl || null,
              m.previewKind || null,
              m.content || null,
              vg,
              vn,
              rs,
              vg,
              vn,
              rs
            );
          }
        }
      }
    }

    if (body.stripboard && typeof body.stripboard === 'object') {
      if (memberRole === 'owner') {
        sqlite
          .prepare('DELETE FROM stripboard_strips WHERE organization_id = ? AND (user_id = ? OR user_id IS NULL)')
          .run(organizationId, user.id);
      } else {
        sqlite
          .prepare('DELETE FROM stripboard_strips WHERE organization_id = ? AND user_id = ?')
          .run(organizationId, user.id);
      }
      const insStrip = sqlite.prepare(`
        INSERT OR REPLACE INTO stripboard_strips (id, organization_id, user_id, date_str, sort_order, type, ot_id, title, client, brand, product, time_slot, task, assignee, shift_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const [dateStr, strips] of Object.entries(body.stripboard)) {
        if (Array.isArray(strips)) {
          strips.forEach((st: any, idx: number) => {
            insStrip.run(
              st.id || 'strip-' + Date.now() + '-' + idx,
              organizationId,
              user.id,
              dateStr,
              idx,
              st.type || 'ot',
              st.otId || null,
              st.title || null,
              st.client || null,
              st.brand || null,
              st.product || null,
              st.timeSlot || null,
              st.task || null,
              st.assignee || null,
              st.shiftStatus || 'Por Iniciar'
            );
          });
        }
      }
    }
  });

  syncTx();
  return c.json({ ok: true, savedAt: now });
});

// 6.1 BORRADOS EXPLÍCITOS (SIN DELETE CIEGO EN /sync)
app.delete('/api/studio/orders/:id', async (c) => {
  const organizationId = c.get('organizationId');
  const memberRole = c.get('memberRole');
  const otId = c.req.param('id');

  if (memberRole !== 'owner') {
    return c.json({ ok: false, error: 'forbidden', message: 'Solo el Dueño puede eliminar órdenes de trabajo.' }, 403);
  }

  const deleteTx = sqlite.transaction(() => {
    const childRows = sqlite
      .prepare('SELECT id FROM work_orders WHERE organization_id = ? AND parent_ot_id = ?')
      .all(organizationId, otId) as Array<{ id: string }>;
    const idsToDelete = [otId, ...childRows.map((r) => r.id)];

    for (const targetId of idsToDelete) {
      sqlite.prepare('DELETE FROM route_entries WHERE ot_id = ? AND organization_id = ?').run(targetId, organizationId);
      sqlite.prepare('DELETE FROM media_files WHERE ot_id = ? AND organization_id = ?').run(targetId, organizationId);
      sqlite.prepare('DELETE FROM shared_reviews WHERE ot_id = ? AND organization_id = ?').run(targetId, organizationId);
      sqlite.prepare('DELETE FROM stripboard_strips WHERE ot_id = ? AND organization_id = ?').run(targetId, organizationId);
      sqlite.prepare('DELETE FROM work_orders WHERE id = ? AND organization_id = ?').run(targetId, organizationId);
    }
    return idsToDelete;
  });

  const deletedIds = deleteTx();
  return c.json({ ok: true, deletedIds });
});

app.delete('/api/studio/clients/:id', async (c) => {
  const organizationId = c.get('organizationId');
  const memberRole = c.get('memberRole');
  const clientId = c.req.param('id');

  if (memberRole !== 'owner') {
    return c.json({ ok: false, error: 'forbidden', message: 'Solo el Dueño puede eliminar clientes.' }, 403);
  }

  sqlite.prepare('DELETE FROM clients WHERE id = ? AND organization_id = ?').run(clientId, organizationId);
  return c.json({ ok: true, deletedId: clientId });
});

app.delete('/api/studio/stripboard/:id', async (c) => {
  const organizationId = c.get('organizationId');
  const memberRole = c.get('memberRole');
  const user = c.get('user');
  const stripId = c.req.param('id');

  if (memberRole === 'owner') {
    sqlite
      .prepare('DELETE FROM stripboard_strips WHERE id = ? AND organization_id = ? AND (user_id = ? OR user_id IS NULL)')
      .run(stripId, organizationId, user.id);
  } else {
    sqlite
      .prepare('DELETE FROM stripboard_strips WHERE id = ? AND organization_id = ? AND user_id = ?')
      .run(stripId, organizationId, user.id);
  }
  return c.json({ ok: true, deletedId: stripId });
});

// 7. SUBIDA FÍSICA DE ARCHIVOS AL SERVIDOR + EXTRACTOR DE PREVIEW (AISLADO POR ORGANIZACIÓN Y CUOTA)
app.post('/api/studio/upload', async (c) => {
  const organizationId = c.get('organizationId');
  const body = await c.req.parseBody();
  const otId = String(body['ot_id'] || 'GENERAL').replace(/[^a-zA-Z0-9_-]/g, '');
  const file = body['file'];

  if (!file || typeof file === 'string') {
    return c.json({ ok: false, error: 'No se recibió un archivo válido.' }, 400);
  }

  const maxOrgBytes = Number(process.env.MAX_ORG_UPLOAD_BYTES || 500 * 1024 * 1024);
  const orgUploadsDir = path.join(uploadsDir, organizationId);
  const currentOrgBytes = getDirectorySizeBytes(orgUploadsDir);
  if (currentOrgBytes + (file.size || 0) > maxOrgBytes) {
    return c.json(
      { ok: false, error: 'storage_quota_exceeded', message: 'Cuota de almacenamiento del estudio excedida.' },
      413
    );
  }

  const mediaItem = await saveUploadedFileForOt(otId, file);
  const orgOtDir = path.join(orgUploadsDir, otId);
  if (!fs.existsSync(orgOtDir)) {
    fs.mkdirSync(orgOtDir, { recursive: true });
  }

  const moveIntoOrgDir = (rawUrl: string | null): string | null => {
    if (!rawUrl) return rawUrl;
    const prefix = `/uploads/${otId}/`;
    if (!rawUrl.startsWith(prefix)) return rawUrl;
    const fileName = rawUrl.slice(prefix.length);
    const srcPath = path.join(uploadsDir, otId, fileName);
    const destPath = path.join(orgOtDir, fileName);
    if (fs.existsSync(srcPath)) {
      fs.renameSync(srcPath, destPath);
    }
    return `/uploads/${organizationId}/${otId}/${fileName}`;
  };

  mediaItem.originalUrl = moveIntoOrgDir(mediaItem.originalUrl) || mediaItem.originalUrl;
  mediaItem.previewUrl = moveIntoOrgDir(mediaItem.previewUrl);
  mediaItem.url = moveIntoOrgDir(mediaItem.url) || mediaItem.url;

  return c.json({ ok: true, mediaItem });
});

// 7.1 RUTAS PRIVADAS DE REVISIÓN COLABORATIVA (VERSIONADO Y ENLACES)
app.route('/api/studio/reviews', studioReviewRoutes);

// ABRIR ARCHIVO DIRECTAMENTE EN SU APLICACIÓN NATIVA DE MACOS (AFFINITY, ADOBE, IWORK)
app.post('/api/studio/open-native', async (c) => {
  const { fileUrl } = await c.req.json();
  if (!fileUrl || typeof fileUrl !== 'string') {
    return c.json({ ok: false, error: 'Ruta inválida' }, 400);
  }
  const cleanRel = decodeURIComponent(fileUrl)
    .replace(/^\/+/, '')
    .replace(/\.preview\.(png|jpe?g|pdf)$/i, '');

  const fullPath = path.resolve('./', cleanRel);
  if (!fullPath.startsWith(uploadsDir) || !fs.existsSync(fullPath)) {
    return c.json({ ok: false, error: 'Archivo original no encontrado: ' + cleanRel }, 404);
  }
  const { execFile } = await import('node:child_process');
  execFile('open', [fullPath]);
  return c.json({ ok: true, opened: fullPath });
});

// 7.1 GOBERNANZA DE EQUIPO COLABORATIVO (/api/studio/team/*)
const TERMINAL_OT_STATUSES = ['Cerrado', 'Cancelado', 'Archivada', 'Aprobado'] as const;
const MAX_ACTIVE_SEATS = 6;

function requireStudioAdmin(c: any) {
  const user = c.get('user');
  const organizationId = c.get('organizationId');
  if (!user || !organizationId) return null;

  const caller = sqlite
    .prepare('SELECT id, role, status FROM members WHERE user_id = ? AND organization_id = ?')
    .get(user.id, organizationId) as { id: string; role: string; status?: string } | undefined;

  if (!caller || caller.status === 'deactivated' || caller.role !== 'owner') {
    return null;
  }
  return { caller, user, organizationId };
}

// Actualizar rol, alcance (allowedClientId) y departamentos de un miembro (solo Dueño)
app.post('/api/studio/team/member/update', async (c) => {
  const authCtx = requireStudioAdmin(c);
  if (!authCtx) {
    return c.json({ ok: false, error: 'forbidden', message: 'Solo el Dueño del estudio puede editar roles y privilegios.' }, 403);
  }
  const { caller, organizationId } = authCtx;

  let body: any = null;
  try {
    body = await c.req.json();
  } catch (_) {
    return c.json({ ok: false, error: 'invalid_json', message: 'Cuerpo JSON inválido.' }, 400);
  }

  const memberId = typeof body?.memberId === 'string' ? body.memberId.trim() : '';
  const nextRole = body?.role === 'client' ? 'client' : body?.role === 'member' ? 'member' : '';
  const rawAllowedClientId = typeof body?.allowedClientId === 'string' ? body.allowedClientId.trim() : '*';
  const nextAllowedClientId = nextRole === 'client' ? rawAllowedClientId : (rawAllowedClientId || '*');

  if (!memberId || !nextRole) {
    return c.json({ ok: false, error: 'invalid_params', message: 'Se requiere memberId y role ("member" o "client").' }, 400);
  }
  if (nextRole === 'client' && (!nextAllowedClientId || nextAllowedClientId === '*')) {
    return c.json({ ok: false, error: 'client_required', message: 'El rol Cliente requiere asignar un cliente específico.' }, 400);
  }

  const target = sqlite
    .prepare('SELECT id, user_id, role, status FROM members WHERE id = ? AND organization_id = ?')
    .get(memberId, organizationId) as { id: string; user_id: string; role: string; status?: string } | undefined;

  if (!target) {
    return c.json({ ok: false, error: 'member_not_found', message: 'Miembro no encontrado en este estudio.' }, 404);
  }
  if (target.role === 'owner' || target.id === caller.id) {
    return c.json({ ok: false, error: 'cannot_edit_owner', message: 'No es posible modificar el rol del Dueño desde este panel.' }, 400);
  }

  if (target.role === 'client' && nextRole === 'member' && target.status !== 'deactivated') {
    const row = sqlite
      .prepare("SELECT COUNT(*) as c FROM members WHERE organization_id = ? AND status != 'deactivated' AND role != 'client'")
      .get(organizationId) as { c: number } | undefined;
    if ((row?.c || 0) >= MAX_ACTIVE_SEATS) {
      return c.json({ ok: false, error: 'seat_limit_reached', message: `Límite de ${MAX_ACTIVE_SEATS} miembros activos alcanzado.` }, 400);
    }
  }

  sqlite
    .prepare('UPDATE members SET role = ?, allowed_client_id = ? WHERE id = ? AND organization_id = ?')
    .run(nextRole, nextAllowedClientId, memberId, organizationId);

  let updatedDepartments: string[] | null = null;
  if (Array.isArray(body?.departments)) {
    const clean = body.departments
      .map((d: any) => (typeof d === 'string' ? d.trim() : ''))
      .filter(Boolean);
    if (clean.length > 0) {
      updatedDepartments = clean;
      sqlite
        .prepare('UPDATE users SET departments = ? WHERE id = ?')
        .run(JSON.stringify(clean), target.user_id);
    }
  }

  if (typeof body?.phone === 'string') {
    sqlite
      .prepare('UPDATE users SET phone = ? WHERE id = ?')
      .run(body.phone.trim(), target.user_id);
  }

  return c.json({
    ok: true,
    memberId,
    role: nextRole,
    allowedClientId: nextAllowedClientId,
    departments: updatedDepartments,
    phone: typeof body?.phone === 'string' ? body.phone.trim() : undefined,
  });
});

// Alternar estado de miembro (active <-> deactivated) y revocar sesiones activas
app.post('/api/studio/team/member/status', async (c) => {
  const authCtx = requireStudioAdmin(c);
  if (!authCtx) {
    return c.json({ ok: false, error: 'forbidden', message: 'Requiere rol de Director o Administrador activo.' }, 403);
  }
  const { caller, organizationId } = authCtx;

  let body: any = null;
  try {
    body = await c.req.json();
  } catch (_) {
    return c.json({ ok: false, error: 'invalid_json', message: 'Cuerpo JSON inválido.' }, 400);
  }

  const memberId = typeof body?.memberId === 'string' ? body.memberId.trim() : '';
  const nextStatus = body?.status === 'active' || body?.status === 'deactivated' ? body.status : '';
  if (!memberId || !nextStatus) {
    return c.json({ ok: false, error: 'invalid_params', message: 'Se requiere memberId y status ("active" o "deactivated").' }, 400);
  }

  const target = sqlite
    .prepare('SELECT id, user_id, role, status FROM members WHERE id = ? AND organization_id = ?')
    .get(memberId, organizationId) as { id: string; user_id: string; role: string; status?: string } | undefined;

  if (!target) {
    return c.json({ ok: false, error: 'member_not_found', message: 'Miembro no encontrado en este estudio.' }, 404);
  }
  if (target.role === 'owner' && nextStatus === 'deactivated') {
    return c.json({ ok: false, error: 'cannot_deactivate_owner', message: 'No es posible desactivar al propietario del estudio.' }, 400);
  }
  if (target.id === caller.id && nextStatus === 'deactivated') {
    return c.json({ ok: false, error: 'cannot_deactivate_self', message: 'No puedes desactivar tu propia cuenta.' }, 400);
  }

  if (nextStatus === 'active' && target.status !== 'active') {
    const row = sqlite
      .prepare("SELECT COUNT(*) as c FROM members WHERE organization_id = ? AND status != 'deactivated'")
      .get(organizationId) as { c: number } | undefined;
    if ((row?.c || 0) >= MAX_ACTIVE_SEATS) {
      return c.json({ ok: false, error: 'seat_limit_reached', message: `Límite de ${MAX_ACTIVE_SEATS} miembros activos alcanzado.` }, 400);
    }
  }

  sqlite
    .prepare('UPDATE members SET status = ? WHERE id = ? AND organization_id = ?')
    .run(nextStatus, memberId, organizationId);

  let sessionsRevoked = false;
  if (nextStatus === 'deactivated') {
    sqlite
      .prepare('DELETE FROM sessions WHERE user_id = ? AND active_organization_id = ?')
      .run(target.user_id, organizationId);
    sessionsRevoked = true;
  }

  const activeRow = sqlite
    .prepare("SELECT COUNT(*) as c FROM members WHERE organization_id = ? AND status != 'deactivated'")
    .get(organizationId) as { c: number } | undefined;

  return c.json({
    ok: true,
    memberId,
    status: nextStatus,
    sessionsRevoked,
    activeMembersCount: activeRow?.c || 0,
    membershipLimit: MAX_ACTIVE_SEATS,
  });
});

// Reasignación atómica de OTs, rutas y tiras + eliminación segura de membresía
app.post('/api/studio/team/member/reassign-and-delete', async (c) => {
  const authCtx = requireStudioAdmin(c);
  if (!authCtx) {
    return c.json({ ok: false, error: 'forbidden', message: 'Requiere rol de Director o Administrador activo.' }, 403);
  }
  const { caller, organizationId } = authCtx;

  let body: any = null;
  try {
    body = await c.req.json();
  } catch (_) {
    return c.json({ ok: false, error: 'invalid_json', message: 'Cuerpo JSON inválido.' }, 400);
  }

  const memberId = typeof body?.memberId === 'string' ? body.memberId.trim() : '';
  const targetMemberId = typeof body?.targetMemberId === 'string' ? body.targetMemberId.trim() : '';
  if (!memberId) {
    return c.json({ ok: false, error: 'invalid_params', message: 'Se requiere memberId.' }, 400);
  }

  const leaving = sqlite
    .prepare(
      `SELECT m.id, m.user_id, m.role, u.short_name, u.name 
       FROM members m JOIN users u ON m.user_id = u.id 
       WHERE m.id = ? AND m.organization_id = ?`
    )
    .get(memberId, organizationId) as { id: string; user_id: string; role: string; short_name?: string; name: string } | undefined;

  if (!leaving) {
    return c.json({ ok: false, error: 'member_not_found', message: 'Miembro no encontrado en este estudio.' }, 404);
  }
  if (leaving.role === 'owner') {
    return c.json({ ok: false, error: 'cannot_remove_owner', message: 'No es posible retirar al propietario del estudio.' }, 400);
  }
  if (leaving.id === caller.id) {
    return c.json({ ok: false, error: 'cannot_remove_self', message: 'No puedes retirar tu propia membresía.' }, 400);
  }

  const leavingShortName = (leaving.short_name || leaving.name || '').trim();
  const placeholders = TERMINAL_OT_STATUSES.map(() => '?').join(',');

  const activeOrders = leavingShortName
    ? (sqlite
        .prepare(
          `SELECT id, title FROM work_orders 
           WHERE organization_id = ? AND responsible = ? AND status NOT IN (${placeholders})`
        )
        .all(organizationId, leavingShortName, ...TERMINAL_OT_STATUSES) as Array<{ id: string; title: string }>)
    : [];

  const activeRoutes = leavingShortName
    ? (sqlite
        .prepare('SELECT id FROM route_entries WHERE organization_id = ? AND sign = ? AND completed = 0')
        .all(organizationId, leavingShortName) as Array<{ id: number }>)
    : [];

  const activeStrips = leavingShortName
    ? (sqlite
        .prepare("SELECT id FROM stripboard_strips WHERE organization_id = ? AND assignee = ? AND shift_status != 'Entregado'")
        .all(organizationId, leavingShortName) as Array<{ id: string }>)
    : [];

  const hasWorkload = activeOrders.length > 0 || activeRoutes.length > 0 || activeStrips.length > 0;
  if (hasWorkload && !targetMemberId) {
    return c.json(
      {
        ok: false,
        error: 'reassignment_required',
        activeWorkOrdersCount: activeOrders.length,
        activeRoutesCount: activeRoutes.length,
        activeStripsCount: activeStrips.length,
        message: 'El colaborador tiene OTs o tareas activas pendientes de reasignación.',
      },
      400
    );
  }

  let reassignedOrdersCount = 0;
  let reassignedRoutesCount = 0;
  let reassignedStripsCount = 0;

  if (targetMemberId) {
    if (targetMemberId === memberId) {
      return c.json({ ok: false, error: 'invalid_target', message: 'El colaborador sucesor debe ser distinto al retirado.' }, 400);
    }

    const tx = sqlite.transaction(() => {
      const successor = sqlite
        .prepare(
          `SELECT m.id, m.status, u.short_name, u.name 
           FROM members m JOIN users u ON m.user_id = u.id 
           WHERE m.id = ? AND m.organization_id = ?`
        )
        .get(targetMemberId, organizationId) as { id: string; status?: string; short_name?: string; name: string } | undefined;

      if (!successor || successor.status === 'deactivated') {
        throw new Error('INVALID_SUCCESSOR');
      }

      const successorShortName = (successor.short_name || successor.name || '').trim();
      const nowIso = new Date().toISOString();

      if (leavingShortName && successorShortName) {
        const resOrders = sqlite
          .prepare(
            `UPDATE work_orders SET responsible = ?, updated_at = ? 
             WHERE organization_id = ? AND responsible = ? AND status NOT IN (${placeholders})`
          )
          .run(successorShortName, nowIso, organizationId, leavingShortName, ...TERMINAL_OT_STATUSES);
        reassignedOrdersCount = resOrders.changes;

        const resRoutes = sqlite
          .prepare('UPDATE route_entries SET sign = ? WHERE organization_id = ? AND sign = ? AND completed = 0')
          .run(successorShortName, organizationId, leavingShortName);
        reassignedRoutesCount = resRoutes.changes;

        const resStrips = sqlite
          .prepare("UPDATE stripboard_strips SET assignee = ? WHERE organization_id = ? AND assignee = ? AND shift_status != 'Entregado'")
          .run(successorShortName, organizationId, leavingShortName);
        reassignedStripsCount = resStrips.changes;

        if (activeOrders.length > 0) {
          const maxLineStmt = sqlite.prepare('SELECT COALESCE(MAX(line_number), 0) as maxLine FROM route_entries WHERE ot_id = ?');
          const insNoteStmt = sqlite.prepare(
            `INSERT INTO route_entries (organization_id, ot_id, line_number, from_dept, to_dept, task, entry_date, delivery_date, sign, notes, stamp, completed, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          const nowDate = new Date();
          const dd = String(nowDate.getDate()).padStart(2, '0');
          const mm = String(nowDate.getMonth() + 1).padStart(2, '0');
          const yyyy = nowDate.getFullYear();
          const hh = String(nowDate.getHours()).padStart(2, '0');
          const min = String(nowDate.getMinutes()).padStart(2, '0');
          const displayDate = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

          for (const ot of activeOrders) {
            const maxRow = maxLineStmt.get(ot.id) as { maxLine: number } | undefined;
            const nextLine = (maxRow?.maxLine || 0) + 1;
            insNoteStmt.run(
              organizationId,
              ot.id,
              nextLine,
              'Tráfico',
              'Tráfico',
              'Relevo operativo por transferencia de responsabilidad',
              displayDate,
              '',
              successorShortName,
              `Transferido desde ${leavingShortName}`,
              'RELEVO',
              1,
              nowIso
            );
          }
        }
      }
    });

    try {
      tx();
    } catch (err: any) {
      if (err?.message === 'INVALID_SUCCESSOR') {
        return c.json({ ok: false, error: 'invalid_successor', message: 'El miembro sucesor no existe o está desactivado.' }, 400);
      }
      throw err;
    }
  }

  // Revocar sesiones activas en la organización y eliminar la membresía
  sqlite.prepare('DELETE FROM sessions WHERE user_id = ? AND active_organization_id = ?').run(leaving.user_id, organizationId);
  try {
    await auth.api.removeMember({
      body: {
        memberIdOrEmail: memberId,
        organizationId,
      },
      headers: c.req.raw.headers,
    });
  } catch (_) {
    sqlite.prepare('DELETE FROM members WHERE id = ? AND organization_id = ?').run(memberId, organizationId);
  }

  return c.json({
    ok: true,
    deletedMemberId: memberId,
    targetMemberId: targetMemberId || null,
    reassignedOrdersCount,
    reassignedRoutesCount,
    reassignedStripsCount,
  });
});

// 8. SERVIR ARCHIVOS SUBIDOS, ASSETS E INYECTAR EL PUENTE EN EL PROTOTIPO MAESTRO
app.use('/uploads/*', serveStatic({ root: './' }));
app.use('/assets/*', serveStatic({ root: './dist' }));
app.use('/assets/*', serveStatic({ root: './' }));
app.use('/src/*', serveStatic({ root: './' }));
app.get('/favicon.ico', (c) => {
  const iconPath = path.resolve('./assets/favicon-32x32.png');
  if (fs.existsSync(iconPath)) {
    const buffer = fs.readFileSync(iconPath);
    return c.body(buffer, 200, { 'Content-Type': 'image/png' });
  }
  return c.text('', 404);
});
app.get('/review/:token', (c) => {
  const distReview = './dist/review.html';
  const devReview = './review.html';
  const target = fs.existsSync(distReview) ? distReview : devReview;
  if (fs.existsSync(target)) {
    return c.html(fs.readFileSync(target, 'utf-8'));
  }
  return c.text('Visor de Revisión no encontrado.', 404);
});

app.get('/', (c) => {
  if (fs.existsSync('./index.html')) {
    const html = fs.readFileSync('./index.html', 'utf-8');
    return c.html(html);
  }
  if (fs.existsSync('./mesa_de_tr_fico_sobres_ot v1.1.html')) {
    let html = fs.readFileSync('./mesa_de_tr_fico_sobres_ot v1.1.html', 'utf-8');
    html = html.replace('</body>', '<script src="/client-bridge.js"></script></body>');
    return c.html(html);
  }
  return c.text('Trafikeitor // Servidor Activo');
});

const port = Number(process.env.PORT || 3000);

if (!process.env.IS_TEST) {
  try {
    const server = serve({
      fetch: app.fetch,
      port,
    }, (info) => {
      console.log(`TRAFIKEITOR // Servidor activo en http://localhost:${info.port}`);
    });
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        // Un servidor dev ya está escuchando en el puerto, no interrumpir ejecución
        return;
      }
      console.error('[Server Error]', err);
    });
  } catch (_) {}
}

export default app;
