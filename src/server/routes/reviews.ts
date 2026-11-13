import crypto from 'node:crypto';
import { Hono } from 'hono';
import { sqlite } from '../db';
import { auth } from '../auth';
import { saveUploadedFileForOt } from '../services/upload-helper';

type StudioVars = {
  user: typeof auth.$Infer.Session.user;
  session: typeof auth.$Infer.Session.session;
  organizationId: string;
};

type SseListener = (event: string, data: Record<string, unknown>) => void;
const streamSubscribers = new Map<string, Set<SseListener>>();

function emitReviewSync(token: string, type: string, payload: Record<string, unknown> = {}) {
  const listeners = streamSubscribers.get(token);
  if (!listeners || listeners.size === 0) return;
  for (const send of listeners) {
    try {
      send('sync', { type, ...payload, ts: Date.now() });
    } catch (_) {}
  }
}

function formatDisplayDateNow(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

async function resolveHybridAuthor(headers: Headers, rawAuthorName?: unknown): Promise<{
  authorUserId: string | null;
  authorName: string;
  authorRole: 'agency' | 'client';
} | null> {
  const session = await auth.api.getSession({ headers }).catch(() => null);
  if (session?.user) {
    const u = session.user as any;
    return {
      authorUserId: u.id,
      authorName: u.shortName || u.name || 'Agencia',
      authorRole: 'agency',
    };
  }
  const guestName = typeof rawAuthorName === 'string' ? rawAuthorName.trim() : '';
  if (!guestName) return null;
  return {
    authorUserId: null,
    authorName: guestName.slice(0, 80),
    authorRole: 'client',
  };
}

function getValidShareByToken(token: string): {
  ok: true;
  review: any;
  order: any;
} | {
  ok: false;
  status: 404 | 410;
  error: string;
} {
  const review = sqlite
    .prepare('SELECT * FROM shared_reviews WHERE token = ? AND revoked = 0')
    .get(token) as any;

  if (!review) {
    return { ok: false, status: 404, error: 'Enlace de revisión no válido, expirado o revocado.' };
  }

  if (review.expires_at) {
    const expDate = new Date(review.expires_at);
    if (!isNaN(expDate.getTime()) && expDate < new Date()) {
      return { ok: false, status: 410, error: 'Este enlace de revisión ha expirado.' };
    }
  }

  const order = sqlite.prepare('SELECT * FROM work_orders WHERE id = ?').get(review.ot_id) as any;
  if (!order) {
    return { ok: false, status: 404, error: 'La Orden de Trabajo asociada no existe.' };
  }

  return { ok: true, review, order };
}

function resolveTargetMediaForShare(review: any, requestedMediaId?: string): {
  activeMedia: any | null;
  versions: any[];
} {
  const allOtMedia = sqlite
    .prepare('SELECT * FROM media_files WHERE ot_id = ? ORDER BY version_number ASC, date ASC')
    .all(review.ot_id) as any[];

  if (allOtMedia.length === 0) {
    return { activeMedia: null, versions: [] };
  }

  let anchorMedia = review.media_file_id
    ? allOtMedia.find((m) => m.id === review.media_file_id) || null
    : null;

  if (!anchorMedia) {
    anchorMedia = allOtMedia[allOtMedia.length - 1];
  }

  const groupId = anchorMedia.version_group_id;
  const versions = groupId
    ? allOtMedia.filter((m) => m.version_group_id === groupId).sort((a, b) => (a.version_number || 1) - (b.version_number || 1))
    : [anchorMedia];

  let activeMedia = anchorMedia;
  if (requestedMediaId) {
    const matched = versions.find((v) => v.id === requestedMediaId);
    if (matched) activeMedia = matched;
  }

  return { activeMedia, versions };
}

function mapMediaRow(m: any) {
  if (!m) return null;
  return {
    id: m.id,
    otId: m.ot_id,
    name: m.name,
    type: m.type,
    ext: m.ext,
    size: m.size,
    date: m.date,
    url: m.url,
    previewUrl: m.preview_url || null,
    previewKind: m.preview_kind || null,
    content: m.content || null,
    versionGroupId: m.version_group_id || null,
    versionNumber: m.version_number || 1,
    reviewStatus: m.review_status || 'draft',
  };
}

// ============================================================================
// RUTAS PRIVADAS DEL ESTUDIO (/api/studio/reviews/*)
// ============================================================================
export const studioReviewRoutes = new Hono<{ Variables: StudioVars }>();

studioReviewRoutes.post('/share', async (c) => {
  const organizationId = c.get('organizationId');
  const body = await c.req.json().catch(() => ({}));
  const otId = String(body.otId || '').trim();
  const mediaFileId = String(body.mediaFileId || '').trim();
  const reviewerLabel = typeof body.reviewerLabel === 'string' && body.reviewerLabel.trim()
    ? body.reviewerLabel.trim()
    : 'Cliente';

  if (!otId || !mediaFileId) {
    return c.json({ ok: false, error: 'Se requiere otId y mediaFileId.' }, 400);
  }

  const order = sqlite
    .prepare('SELECT id FROM work_orders WHERE id = ? AND organization_id = ?')
    .get(otId, organizationId) as any;
  if (!order) {
    return c.json({ ok: false, error: 'Orden de Trabajo no encontrada.' }, 404);
  }

  const media = sqlite
    .prepare('SELECT * FROM media_files WHERE id = ? AND ot_id = ? AND organization_id = ?')
    .get(mediaFileId, otId, organizationId) as any;
  if (!media) {
    return c.json({ ok: false, error: 'Pieza no encontrada en el Media Pool de la OT.' }, 404);
  }

  const nowIso = new Date().toISOString();
  const versionGroupId = media.version_group_id || ('vg-' + crypto.randomUUID().slice(0, 8));

  sqlite
    .prepare(
      "UPDATE media_files SET version_group_id = ?, review_status = CASE WHEN review_status = 'draft' OR review_status IS NULL THEN 'in_review' ELSE review_status END WHERE id = ?"
    )
    .run(versionGroupId, mediaFileId);

  const existingShare = sqlite
    .prepare(
      `SELECT sr.* FROM shared_reviews sr
       LEFT JOIN media_files mf ON mf.id = sr.media_file_id
       WHERE sr.organization_id = ? AND sr.ot_id = ? AND sr.revoked = 0
         AND (sr.media_file_id = ? OR mf.version_group_id = ?)
       ORDER BY sr.created_at DESC LIMIT 1`
    )
    .get(organizationId, otId, mediaFileId, versionGroupId) as any;

  let token: string;
  if (existingShare) {
    token = existingShare.token;
    sqlite
      .prepare('UPDATE shared_reviews SET media_file_id = ?, reviewer_label = ? WHERE token = ?')
      .run(mediaFileId, reviewerLabel, token);
  } else {
    token = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    sqlite
      .prepare(
        `INSERT INTO shared_reviews (token, organization_id, ot_id, media_file_id, route_entry_ids_json, allow_full_ot, reviewer_label, expires_at, revoked, created_at)
         VALUES (?, ?, ?, ?, '[]', 1, ?, ?, 0, ?)`
      )
      .run(token, organizationId, otId, mediaFileId, reviewerLabel, body.expiresAt || null, nowIso);
  }

  const updatedMedia = sqlite.prepare('SELECT * FROM media_files WHERE id = ?').get(mediaFileId);
  return c.json({
    ok: true,
    token,
    url: `/review/${token}`,
    mediaFile: mapMediaRow(updatedMedia),
  });
});

studioReviewRoutes.post('/version', async (c) => {
  const organizationId = c.get('organizationId');
  const body = await c.req.parseBody();
  const otId = String(body['ot_id'] || '').trim();
  const parentMediaId = String(body['parent_media_id'] || '').trim();
  const file = body['file'];

  if (!otId || !parentMediaId || !file || typeof file === 'string') {
    return c.json({ ok: false, error: 'Se requieren ot_id, parent_media_id y file.' }, 400);
  }

  const parentMedia = sqlite
    .prepare('SELECT * FROM media_files WHERE id = ? AND ot_id = ? AND organization_id = ?')
    .get(parentMediaId, otId, organizationId) as any;
  if (!parentMedia) {
    return c.json({ ok: false, error: 'Pieza base no encontrada.' }, 404);
  }

  const versionGroupId = parentMedia.version_group_id || ('vg-' + crypto.randomUUID().slice(0, 8));
  if (!parentMedia.version_group_id) {
    sqlite.prepare('UPDATE media_files SET version_group_id = ? WHERE id = ?').run(versionGroupId, parentMediaId);
  }

  const maxRow = sqlite
    .prepare('SELECT COALESCE(MAX(version_number), 1) AS max_ver FROM media_files WHERE ot_id = ? AND version_group_id = ?')
    .get(otId, versionGroupId) as { max_ver: number };
  const nextVersion = (maxRow?.max_ver || 1) + 1;

  const saved = await saveUploadedFileForOt(otId, file, {
    versionGroupId,
    versionNumber: nextVersion,
    reviewStatus: 'in_review',
  });

  sqlite
    .prepare(
      `INSERT INTO media_files (id, organization_id, ot_id, route_entry_id, name, type, ext, size, date, url, preview_url, preview_kind, content, version_group_id, version_number, review_status)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      saved.id,
      organizationId,
      otId,
      saved.name,
      saved.type,
      saved.ext,
      saved.size,
      saved.date,
      saved.url,
      saved.previewUrl,
      saved.previewKind,
      saved.content,
      saved.versionGroupId,
      saved.versionNumber,
      saved.reviewStatus
    );

  // Actualizar enlaces activos del mismo grupo para que apunten por defecto a la nueva versión
  const affectedShares = sqlite
    .prepare(
      `SELECT sr.token FROM shared_reviews sr
       JOIN media_files mf ON mf.id = sr.media_file_id
       WHERE sr.organization_id = ? AND sr.ot_id = ? AND sr.revoked = 0 AND mf.version_group_id = ?`
    )
    .all(organizationId, otId, versionGroupId) as Array<{ token: string }>;

  for (const sh of affectedShares) {
    sqlite.prepare('UPDATE shared_reviews SET media_file_id = ? WHERE token = ?').run(saved.id, sh.token);
    emitReviewSync(sh.token, 'VERSION_ADDED', { mediaFileId: saved.id, versionNumber: nextVersion });
  }

  return c.json({ ok: true, mediaItem: saved });
});

studioReviewRoutes.get('/ot/:otId', async (c) => {
  const organizationId = c.get('organizationId');
  const otId = c.req.param('otId');

  const shares = sqlite
    .prepare('SELECT * FROM shared_reviews WHERE organization_id = ? AND ot_id = ? AND revoked = 0 ORDER BY created_at DESC')
    .all(organizationId, otId) as any[];

  const pinCountsRows = sqlite
    .prepare(
      `SELECT rt.media_file_id, COUNT(*) AS total, SUM(CASE WHEN rt.is_resolved = 0 THEN 1 ELSE 0 END) AS open_count
       FROM review_threads rt
       JOIN media_files mf ON mf.id = rt.media_file_id
       WHERE mf.organization_id = ? AND mf.ot_id = ?
       GROUP BY rt.media_file_id`
    )
    .all(organizationId, otId) as Array<{ media_file_id: string; total: number; open_count: number }>;

  const pinCountsByMediaId: Record<string, { total: number; open: number }> = {};
  for (const row of pinCountsRows) {
    pinCountsByMediaId[row.media_file_id] = { total: row.total, open: row.open_count };
  }

  return c.json({ ok: true, shares, pinCountsByMediaId });
});

studioReviewRoutes.patch('/share/:token/revoke', async (c) => {
  const organizationId = c.get('organizationId');
  const token = c.req.param('token');
  const info = sqlite
    .prepare('UPDATE shared_reviews SET revoked = 1 WHERE token = ? AND organization_id = ?')
    .run(token, organizationId);

  if (info.changes === 0) {
    return c.json({ ok: false, error: 'Enlace no encontrado.' }, 404);
  }
  return c.json({ ok: true, token, revoked: true });
});

// ============================================================================
// RUTAS PÚBLICAS DE REVISIÓN (/api/public/review/:token/*)
// ============================================================================
export const publicReviewRoutes = new Hono();

publicReviewRoutes.get('/:token', async (c) => {
  const token = c.req.param('token');
  const lookup = getValidShareByToken(token);
  if (!lookup.ok) {
    return c.json({ ok: false, error: lookup.error }, lookup.status);
  }

  const { review, order } = lookup;
  const requestedMediaId = c.req.query('mediaId') || undefined;
  const { activeMedia, versions } = resolveTargetMediaForShare(review, requestedMediaId);

  let allowedLineIds: number[] = [];
  try {
    allowedLineIds = JSON.parse(review.route_entry_ids_json || '[]');
  } catch (_) {}

  const allRoutes = sqlite
    .prepare('SELECT * FROM route_entries WHERE ot_id = ? ORDER BY line_number ASC')
    .all(review.ot_id) as any[];
  const visibleRoutes = review.allow_full_ot
    ? allRoutes
    : allRoutes.filter((r) => allowedLineIds.includes(r.id));
  const allMedia = sqlite.prepare('SELECT * FROM media_files WHERE ot_id = ?').all(review.ot_id) as any[];

  const threads = activeMedia
    ? sqlite
        .prepare('SELECT * FROM review_threads WHERE media_file_id = ? ORDER BY pin_number ASC')
        .all(activeMedia.id)
    : [];
  const messages = activeMedia
    ? sqlite
        .prepare('SELECT * FROM review_messages WHERE media_file_id = ? ORDER BY created_at ASC')
        .all(activeMedia.id)
    : [];

  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  const viewerSession = session?.user
    ? {
        isAgency: true,
        name: (session.user as any).shortName || session.user.name || 'Agencia',
      }
    : { isAgency: false, name: null };

  return c.json({
    ok: true,
    review: {
      token: review.token,
      reviewerLabel: review.reviewer_label,
      allowFullOt: Boolean(review.allow_full_ot),
      allowedLineIds,
      mediaFileId: review.media_file_id || activeMedia?.id || null,
    },
    order,
    activeMedia: mapMediaRow(activeMedia),
    versions: versions.map(mapMediaRow),
    threads: (threads as any[]).map((t) => ({
      id: t.id,
      mediaFileId: t.media_file_id,
      pinNumber: t.pin_number,
      xPercent: t.x_percent,
      yPercent: t.y_percent,
      pageNumber: t.page_number || 1,
      pinColor: t.pin_color || 'teal',
      isResolved: Boolean(t.is_resolved),
      resolvedByName: t.resolved_by_name || null,
      createdAt: t.created_at,
    })),
    messages: (messages as any[]).map((m) => ({
      id: m.id,
      mediaFileId: m.media_file_id,
      threadId: m.thread_id || null,
      authorUserId: m.author_user_id || null,
      authorName: m.author_name,
      authorRole: m.author_role,
      content: m.content,
      createdAt: m.created_at,
    })),
    viewerSession,
    routes: visibleRoutes,
    allRoutes: review.allow_full_ot ? allRoutes : undefined,
    mediaFiles: allMedia.map(mapMediaRow),
  });
});

publicReviewRoutes.post('/:token/threads', async (c) => {
  const token = c.req.param('token');
  const lookup = getValidShareByToken(token);
  if (!lookup.ok) {
    return c.json({ ok: false, error: lookup.error }, lookup.status);
  }

  const body = await c.req.json().catch(() => ({}));
  const author = await resolveHybridAuthor(c.req.raw.headers, body.authorName);
  if (!author) {
    return c.json({ ok: false, error: 'Se requiere tu nombre para firmar el comentario.' }, 400);
  }

  const xPercent = Number(body.xPercent);
  const yPercent = Number(body.yPercent);
  const pageNumber = Math.max(1, Math.floor(Number(body.pageNumber || 1)));
  const allowedColors = new Set(['teal', 'amber', 'pink', 'red', 'white', 'black']);
  const pinColor = allowedColors.has(body.pinColor) ? body.pinColor : 'teal';
  const content = typeof body.content === 'string' ? body.content.trim() : '';

  if (
    !Number.isFinite(xPercent) || xPercent < 0 || xPercent > 1 ||
    !Number.isFinite(yPercent) || yPercent < 0 || yPercent > 1 ||
    !content
  ) {
    return c.json({ ok: false, error: 'Coordenadas normalizadas (0..1) y contenido son obligatorios.' }, 400);
  }

  const { activeMedia } = resolveTargetMediaForShare(lookup.review, body.mediaFileId);
  if (!activeMedia) {
    return c.json({ ok: false, error: 'No hay pieza asociada para anotar.' }, 404);
  }

  const threadId = 'th-' + crypto.randomUUID();
  const messageId = 'msg-' + crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const tx = sqlite.transaction(() => {
    const maxPinRow = sqlite
      .prepare('SELECT COALESCE(MAX(pin_number), 0) AS max_pin FROM review_threads WHERE media_file_id = ?')
      .get(activeMedia.id) as { max_pin: number };
    const pinNumber = (maxPinRow?.max_pin || 0) + 1;

    sqlite
      .prepare(
        `INSERT INTO review_threads (id, organization_id, media_file_id, pin_number, x_percent, y_percent, page_number, pin_color, is_resolved, resolved_by_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`
      )
      .run(threadId, lookup.review.organization_id || lookup.order.organization_id, activeMedia.id, pinNumber, xPercent, yPercent, pageNumber, pinColor, nowIso);

    sqlite
      .prepare(
        `INSERT INTO review_messages (id, organization_id, media_file_id, thread_id, author_user_id, author_name, author_role, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        messageId,
        lookup.review.organization_id || lookup.order.organization_id,
        activeMedia.id,
        threadId,
        author.authorUserId,
        author.authorName,
        author.authorRole,
        content,
        nowIso
      );

    return pinNumber;
  });

  const pinNumber = tx();
  emitReviewSync(token, 'NEW_THREAD', { mediaFileId: activeMedia.id, threadId, pinNumber });

  return c.json({
    ok: true,
    thread: {
      id: threadId,
      mediaFileId: activeMedia.id,
      pinNumber,
      xPercent,
      yPercent,
      pageNumber,
      isResolved: false,
      resolvedByName: null,
      createdAt: nowIso,
    },
    message: {
      id: messageId,
      mediaFileId: activeMedia.id,
      threadId,
      authorUserId: author.authorUserId,
      authorName: author.authorName,
      authorRole: author.authorRole,
      content,
      createdAt: nowIso,
    },
  }, 201);
});

publicReviewRoutes.post('/:token/messages', async (c) => {
  const token = c.req.param('token');
  const lookup = getValidShareByToken(token);
  if (!lookup.ok) {
    return c.json({ ok: false, error: lookup.error }, lookup.status);
  }

  const body = await c.req.json().catch(() => ({}));
  const author = await resolveHybridAuthor(c.req.raw.headers, body.authorName);
  if (!author) {
    return c.json({ ok: false, error: 'Se requiere tu nombre para enviar mensajes.' }, 400);
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return c.json({ ok: false, error: 'El mensaje no puede estar vacío.' }, 400);
  }

  const { activeMedia } = resolveTargetMediaForShare(lookup.review, body.mediaFileId);
  if (!activeMedia) {
    return c.json({ ok: false, error: 'No hay pieza asociada.' }, 404);
  }

  const threadId = typeof body.threadId === 'string' && body.threadId.trim() ? body.threadId.trim() : null;
  if (threadId) {
    const thread = sqlite
      .prepare('SELECT id FROM review_threads WHERE id = ? AND media_file_id = ?')
      .get(threadId, activeMedia.id);
    if (!thread) {
      return c.json({ ok: false, error: 'Hilo de comentario no encontrado.' }, 404);
    }
  }

  const messageId = 'msg-' + crypto.randomUUID();
  const nowIso = new Date().toISOString();

  sqlite
    .prepare(
      `INSERT INTO review_messages (id, organization_id, media_file_id, thread_id, author_user_id, author_name, author_role, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      messageId,
      lookup.review.organization_id || lookup.order.organization_id,
      activeMedia.id,
      threadId,
      author.authorUserId,
      author.authorName,
      author.authorRole,
      content,
      nowIso
    );

  emitReviewSync(token, 'NEW_MESSAGE', { mediaFileId: activeMedia.id, threadId, messageId });

  return c.json({
    ok: true,
    message: {
      id: messageId,
      mediaFileId: activeMedia.id,
      threadId,
      authorUserId: author.authorUserId,
      authorName: author.authorName,
      authorRole: author.authorRole,
      content,
      createdAt: nowIso,
    },
  }, 201);
});

publicReviewRoutes.patch('/:token/threads/:threadId/position', async (c) => {
  const token = c.req.param('token');
  const threadId = c.req.param('threadId');
  const lookup = getValidShareByToken(token);
  if (!lookup.ok) {
    return c.json({ ok: false, error: lookup.error }, lookup.status);
  }

  const body = await c.req.json().catch(() => ({}));
  const xRaw = Number(body.xPercent);
  const yRaw = Number(body.yPercent);
  if (!Number.isFinite(xRaw) || !Number.isFinite(yRaw)) {
    return c.json({ ok: false, error: 'Coordenadas inválidas.' }, 400);
  }
  const xPercent = Math.min(1, Math.max(0, Number(xRaw.toFixed(4))));
  const yPercent = Math.min(1, Math.max(0, Number(yRaw.toFixed(4))));

  const thread = sqlite
    .prepare(
      `SELECT rt.* FROM review_threads rt
       JOIN media_files mf ON mf.id = rt.media_file_id
       WHERE rt.id = ? AND mf.ot_id = ?`
    )
    .get(threadId, lookup.order.id) as any;

  if (!thread) {
    return c.json({ ok: false, error: 'Pin no encontrado.' }, 404);
  }

  sqlite
    .prepare('UPDATE review_threads SET x_percent = ?, y_percent = ? WHERE id = ?')
    .run(xPercent, yPercent, threadId);

  emitReviewSync(token, 'THREAD_MOVED', {
    mediaFileId: thread.media_file_id,
    threadId,
    xPercent,
    yPercent,
  });

  return c.json({ ok: true, threadId, xPercent, yPercent });
});

publicReviewRoutes.patch('/:token/threads/:threadId/color', async (c) => {
  const token = c.req.param('token');
  const threadId = c.req.param('threadId');
  const lookup = getValidShareByToken(token);
  if (!lookup.ok) {
    return c.json({ ok: false, error: lookup.error }, lookup.status);
  }

  const body = await c.req.json().catch(() => ({}));
  const allowedColors = new Set(['teal', 'amber', 'pink', 'red', 'white', 'black']);
  const pinColor = allowedColors.has(body.pinColor) ? body.pinColor : '';
  if (!pinColor) {
    return c.json({ ok: false, error: 'Color inválido.' }, 400);
  }

  const thread = sqlite
    .prepare(
      `SELECT rt.* FROM review_threads rt
       JOIN media_files mf ON mf.id = rt.media_file_id
       WHERE rt.id = ? AND mf.ot_id = ?`
    )
    .get(threadId, lookup.order.id) as any;

  if (!thread) {
    return c.json({ ok: false, error: 'Pin no encontrado.' }, 404);
  }

  sqlite.prepare('UPDATE review_threads SET pin_color = ? WHERE id = ?').run(pinColor, threadId);
  emitReviewSync(token, 'THREAD_COLOR_CHANGED', { mediaFileId: thread.media_file_id, threadId, pinColor });

  return c.json({ ok: true, threadId, pinColor });
});

publicReviewRoutes.patch('/:token/threads/:threadId/resolve', async (c) => {
  const token = c.req.param('token');
  const threadId = c.req.param('threadId');
  const lookup = getValidShareByToken(token);
  if (!lookup.ok) {
    return c.json({ ok: false, error: lookup.error }, lookup.status);
  }

  const body = await c.req.json().catch(() => ({}));
  const author = await resolveHybridAuthor(c.req.raw.headers, body.authorName || lookup.review.reviewer_label || 'Cliente');

  const thread = sqlite
    .prepare(
      `SELECT rt.* FROM review_threads rt
       JOIN media_files mf ON mf.id = rt.media_file_id
       WHERE rt.id = ? AND mf.ot_id = ?`
    )
    .get(threadId, lookup.order.id) as any;

  if (!thread) {
    return c.json({ ok: false, error: 'Pin no encontrado.' }, 404);
  }

  const nextResolved = typeof body.isResolved === 'boolean' ? body.isResolved : !Boolean(thread.is_resolved);
  const resolvedByName = nextResolved ? (author?.authorName || 'Usuario') : null;

  sqlite
    .prepare('UPDATE review_threads SET is_resolved = ?, resolved_by_name = ? WHERE id = ?')
    .run(nextResolved ? 1 : 0, resolvedByName, threadId);

  emitReviewSync(token, 'PIN_RESOLVED', { mediaFileId: thread.media_file_id, threadId, isResolved: nextResolved });

  return c.json({
    ok: true,
    thread: {
      id: thread.id,
      mediaFileId: thread.media_file_id,
      pinNumber: thread.pin_number,
      xPercent: thread.x_percent,
      yPercent: thread.y_percent,
      pageNumber: thread.page_number || 1,
      isResolved: nextResolved,
      resolvedByName,
      createdAt: thread.created_at,
    },
  });
});

publicReviewRoutes.post('/:token/decision', async (c) => {
  const token = c.req.param('token');
  const lookup = getValidShareByToken(token);
  if (!lookup.ok) {
    return c.json({ ok: false, error: lookup.error }, lookup.status);
  }

  const body = await c.req.json().catch(() => ({}));
  const decision = body.decision;
  if (decision !== 'approved' && decision !== 'changes_requested') {
    return c.json({ ok: false, error: "Decisión inválida. Use 'approved' o 'changes_requested'." }, 400);
  }

  const author = await resolveHybridAuthor(c.req.raw.headers, body.authorName);
  if (!author) {
    return c.json({ ok: false, error: 'Se requiere tu nombre para registrar la decisión.' }, 400);
  }

  const { activeMedia } = resolveTargetMediaForShare(lookup.review, body.mediaFileId);
  if (!activeMedia) {
    return c.json({ ok: false, error: 'No hay pieza asociada.' }, 404);
  }

  const orgId = lookup.review.organization_id || lookup.order.organization_id;
  const nowIso = new Date().toISOString();
  const displayNow = formatDisplayDateNow();
  const summary = typeof body.summary === 'string' && body.summary.trim()
    ? body.summary.trim()
    : (decision === 'approved'
        ? `Pieza "${activeMedia.name}" (v${activeMedia.version_number || 1}) aprobada por ${author.authorName}.`
        : `Cambios solicitados sobre "${activeMedia.name}" (v${activeMedia.version_number || 1}) por ${author.authorName}.`);

  const isApproved = decision === 'approved';
  const stamp = isApproved ? 'APROBADO' : 'AJUSTES';
  const targetDept = isApproved
    ? 'Tráfico'
    : (lookup.order.discipline === 'web' || lookup.order.discipline === 'software' ? 'Desarrollo' : 'Diseño');
  const nextOrderStatus = isApproved ? 'Aprobado' : targetDept;
  const routeTask = isApproved
    ? `Aprobación externa de pieza (${activeMedia.name} v${activeMedia.version_number || 1})`
    : `Ajustes solicitados en revisión (${activeMedia.name} v${activeMedia.version_number || 1})`;

  const tx = sqlite.transaction(() => {
    sqlite.prepare('UPDATE media_files SET review_status = ? WHERE id = ?').run(decision, activeMedia.id);

    const maxLineRow = sqlite
      .prepare('SELECT COALESCE(MAX(line_number), 0) AS max_line FROM route_entries WHERE ot_id = ?')
      .get(lookup.order.id) as { max_line: number };
    const nextLine = (maxLineRow?.max_line || 0) + 1;

    const routeRes = sqlite
      .prepare(
        `INSERT INTO route_entries (organization_id, ot_id, line_number, from_dept, to_dept, task, entry_date, delivery_date, sign, notes, stamp, completed, created_at)
         VALUES (?, ?, ?, 'Cliente', ?, ?, ?, '', ?, ?, ?, ?, ?)`
      )
      .run(
        orgId,
        lookup.order.id,
        nextLine,
        targetDept,
        routeTask,
        displayNow,
        author.authorName,
        summary,
        stamp,
        isApproved ? 1 : 0,
        nowIso
      );

    sqlite
      .prepare('UPDATE work_orders SET status = ?, updated_at = ? WHERE id = ?')
      .run(nextOrderStatus, nowIso, lookup.order.id);

    return Number(routeRes.lastInsertRowid);
  });

  const routeEntryId = tx();
  emitReviewSync(token, 'STATUS_CHANGED', {
    mediaFileId: activeMedia.id,
    decision,
    orderStatus: nextOrderStatus,
    authorName: author.authorName,
  });

  return c.json({
    ok: true,
    decision,
    mediaStatus: decision,
    orderStatus: nextOrderStatus,
    routeEntry: {
      id: routeEntryId,
      from: 'Cliente',
      to: targetDept,
      task: routeTask,
      entryDate: displayNow,
      sign: author.authorName,
      notes: summary,
      stamp,
      completed: isApproved,
    },
  });
});

publicReviewRoutes.get('/:token/stream', (c) => {
  const token = c.req.param('token');
  const lookup = getValidShareByToken(token);
  if (!lookup.ok) {
    return c.json({ ok: false, error: lookup.error }, lookup.status);
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send: SseListener = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      if (!streamSubscribers.has(token)) {
        streamSubscribers.set(token, new Set());
      }
      streamSubscribers.get(token)!.add(send);

      send('connected', { token, ts: Date.now() });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch (_) {}
      }, 25000);

      cleanup = () => {
        clearInterval(heartbeat);
        const set = streamSubscribers.get(token);
        if (set) {
          set.delete(send);
          if (set.size === 0) streamSubscribers.delete(token);
        }
      };

      c.req.raw.signal.addEventListener('abort', () => {
        if (cleanup) cleanup();
        try { controller.close(); } catch (_) {}
      });
    },
    cancel() {
      if (cleanup) cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
});

