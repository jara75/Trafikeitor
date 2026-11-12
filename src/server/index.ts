import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { db, sqlite, initDatabaseAndSeed } from './db';
import {
  studios,
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
import { extractServerPreview } from './services/preview-extractor';

initDatabaseAndSeed();

const uploadsDir = path.resolve('./uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

type Variables = {
  user: typeof auth.$Infer.Session.user;
  session: typeof auth.$Infer.Session.session;
  studioId: number;
};

const app = new Hono<{ Variables: Variables }>();

app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'https://trafico.elmarcante.com'],
    credentials: true,
  })
);

// 1. ENDPOINTS DE AUTENTICACIÓN (BETTER AUTH)
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw);
});

app.post("/api/logout-force", (c) => {
  sqlite.prepare("DELETE FROM sessions").run();
  c.header("Set-Cookie", "better-auth.session_token=; Path=/; Max-Age=0; HttpOnly");
  return c.json({ ok: true });
});

// 2. ESTADO DEL SERVIDOR Y VERIFICACIÓN DE USUARIOS REGISTRADOS
app.get('/api/status', (c) => {
  const userCount = sqlite.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
  return c.json({
    ok: true,
    service: 'TRAFIKEITOR // MOTOR DE TRÁFICO & STRIPBOARD',
    engine: 'SQLite WAL + Drizzle ORM + Better Auth',
    hasUsers: userCount.c > 0,
  });
});

// 3. SERVIR EL PUENTE JS DEL CLIENTE
app.get('/client-bridge.js', (c) => {
  const bridgePath = path.resolve('./src/server/client-bridge.js');
  const code = fs.readFileSync(bridgePath, 'utf-8');
  return c.text(code, 200, { 'Content-Type': 'application/javascript; charset=utf-8' });
});

// 4. ENLACES PÚBLICOS COMPARTIDOS PARA CLIENTES (SIN LOGIN)
app.get('/api/share/:token', async (c) => {
  const token = c.req.param('token');
  const review = db.select().from(sharedReviews).where(eq(sharedReviews.token, token)).get();

  if (!review || review.revoked) {
    return c.json({ ok: false, error: 'Enlace de revisión no válido o revocado.' }, 404);
  }

  const order = db.select().from(workOrders).where(eq(workOrders.id, review.otId)).get();
  if (!order) {
    return c.json({ ok: false, error: 'Orden de Trabajo no encontrada.' }, 404);
  }

  const allRoutes = db.select().from(routeEntries).where(eq(routeEntries.otId, order.id)).all();
  const allMedia = db.select().from(mediaFiles).where(eq(mediaFiles.otId, order.id)).all();
  const allowedLineIds: number[] = JSON.parse(review.routeEntryIdsJson || '[]');

  const visibleRoutes =
    review.allowFullOt || allowedLineIds.length === 0
      ? allRoutes
      : allRoutes.filter((r) => allowedLineIds.includes(r.id));

  return c.json({
    ok: true,
    review: {
      token: review.token,
      allowFullOt: review.allowFullOt,
      reviewerLabel: review.reviewerLabel,
      allowedLineIds,
    },
    order,
    routes: visibleRoutes,
    allRoutes: review.allowFullOt ? allRoutes : undefined,
    mediaFiles: allMedia,
  });
});

// 5. MIDDLEWARE PROTEGIDO POR ESTUDIO
app.use('/api/studio/*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ ok: false, error: 'No autorizado. Inicia sesión en El Marcante.' }, 401);
  }

  const studioId = Number((session.user as any).studioId || 1);
  const studio = db.select().from(studios).where(eq(studios.id, studioId)).get();

  if (!studio || studio.planStatus === 'suspended') {
    return c.json({ ok: false, error: 'Licencia de estudio suspendida o inactiva.' }, 403);
  }

  c.set('user', session.user);
  c.set('session', session.session);
  c.set('studioId', studioId);
  await next();
});

// 6. CARGA COMPLETA DEL ESTUDIO DESDE SQLITE (BOOTSTRAP)
app.get('/api/studio/bootstrap', (c) => {
  const studioId = c.get('studioId');
  const user = c.get('user');
  const studio = db.select().from(studios).where(eq(studios.id, studioId)).get();
  const studioClients = db.select().from(clients).where(eq(clients.studioId, studioId)).all();
  const studioStatuses = db.select().from(statuses).where(eq(statuses.studioId, studioId)).all();
  const studioOrders = db.select().from(workOrders).where(eq(workOrders.studioId, studioId)).all();
  const studioRoutes = db.select().from(routeEntries).where(eq(routeEntries.studioId, studioId)).all();
  const studioMedia = db.select().from(mediaFiles).where(eq(mediaFiles.studioId, studioId)).all();
  const studioStrips = db.select().from(stripboardStrips).where(eq(stripboardStrips.studioId, studioId)).all();

  const ordersHydrated = studioOrders.map((ot) => ({
    ...ot,
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
        stamp: r.stamp,
        completed: Boolean(r.completed),
      })),
    mediaFiles: studioMedia.filter((m) => m.otId === ot.id),
  }));

  // Agrupar stripboard por fecha YYYY-MM-DD tal como lo espera la vista
  const stripboardByDate: Record<string, any[]> = {};
  studioStrips
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .forEach((st) => {
      if (!stripboardByDate[st.dateStr]) stripboardByDate[st.dateStr] = [];
      stripboardByDate[st.dateStr].push({
        id: st.id,
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
    user,
    studio,
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

// 7. GUARDADO TRANSACCIONAL COMPLETO EN SQLITE
app.post('/api/studio/sync', async (c) => {
  const studioId = c.get('studioId');
  const body = await c.req.json();
  const now = new Date().toISOString();

  const syncTx = sqlite.transaction(() => {
    if (Array.isArray(body.clients)) {
      sqlite.prepare('DELETE FROM clients WHERE studio_id = ?').run(studioId);
      const insClient = sqlite.prepare(
        'INSERT INTO clients (id, studio_id, name, color, brands_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const cl of body.clients) {
        insClient.run(
          cl.id || 'c-' + Date.now() + Math.random(),
          studioId,
          cl.name || 'Sin nombre',
          cl.color || 'emerald',
          JSON.stringify(cl.brands || []),
          now
        );
      }
    }

    if (Array.isArray(body.statuses)) {
      sqlite.prepare('DELETE FROM statuses WHERE studio_id = ?').run(studioId);
      const insStatus = sqlite.prepare(
        'INSERT INTO statuses (id, studio_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)'
      );
      body.statuses.forEach((st: any, idx: number) => {
        insStatus.run(st.id || 'st-' + idx, studioId, st.name, st.color || 'amber', idx);
      });
    }

    if (Array.isArray(body.orders)) {
      sqlite.prepare('DELETE FROM route_entries WHERE studio_id = ?').run(studioId);
      sqlite.prepare('DELETE FROM media_files WHERE studio_id = ?').run(studioId);
      sqlite.prepare('DELETE FROM work_orders WHERE studio_id = ?').run(studioId);

      const insOrder = sqlite.prepare(`
        INSERT INTO work_orders (id, studio_id, ref, discipline, client, brand, product, title, media, status, urgent, brief, legal_text, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insRoute = sqlite.prepare(`
        INSERT INTO route_entries (studio_id, ot_id, line_number, from_dept, to_dept, task, entry_date, delivery_date, stamp, completed, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insMedia = sqlite.prepare(`
        INSERT INTO media_files (id, studio_id, ot_id, route_entry_id, name, type, ext, size, date, url, preview_url, preview_kind, content)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const ot of body.orders) {
        insOrder.run(
          ot.id,
          studioId,
          ot.ref || '',
          ot.discipline || 'advertising',
          ot.client || '',
          ot.brand || ot.product || '',
          ot.product || '',
          ot.title || '',
          ot.media || '',
          ot.status || 'En Tránsito',
          ot.urgent ? 1 : 0,
          ot.brief || '',
          ot.legalText || '',
          ot.createdAt || now,
          now
        );

        if (Array.isArray(ot.routes)) {
          ot.routes.forEach((r: any, idx: number) => {
            insRoute.run(
              studioId,
              ot.id,
              idx + 1,
              r.from || 'Cuentas',
              r.to || 'Creativos',
              r.task || '',
              r.entryDate || '',
              r.deliveryDate || '',
              r.stamp || null,
              r.completed ? 1 : 0,
              now
            );
          });
        }

        if (Array.isArray(ot.mediaFiles)) {
          for (const m of ot.mediaFiles) {
            insMedia.run(
              m.id || 'm-' + Date.now() + Math.random(),
              studioId,
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
              m.content || null
            );
          }
        }
      }
    }

    if (body.stripboard && typeof body.stripboard === 'object') {
      sqlite.prepare('DELETE FROM stripboard_strips WHERE studio_id = ?').run(studioId);
      const insStrip = sqlite.prepare(`
        INSERT INTO stripboard_strips (id, studio_id, date_str, sort_order, type, ot_id, title, client, brand, product, time_slot, task, assignee, shift_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const [dateStr, strips] of Object.entries(body.stripboard)) {
        if (Array.isArray(strips)) {
          strips.forEach((st: any, idx: number) => {
            insStrip.run(
              st.id || 'strip-' + Date.now() + '-' + idx,
              studioId,
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

// 8. SUBIDA FÍSICA DE ARCHIVOS AL SERVIDOR + EXTRACTOR DE PREVIEW (AFFINITY, IWORK, ADOBE)
app.post('/api/studio/upload', async (c) => {
  const body = await c.req.parseBody();
  const otId = String(body['ot_id'] || 'GENERAL').replace(/[^a-zA-Z0-9_-]/g, '');
  const file = body['file'];

  if (!file || typeof file === 'string') {
    return c.json({ ok: false, error: 'No se recibió un archivo válido.' }, 400);
  }

  const origName = file.name || 'archivo';
  const ext = path.extname(origName).toLowerCase().replace(/^\./, '');
  const safeBase = path.basename(origName, path.extname(origName)).replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniquePrefix = Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const destFileName = `${uniquePrefix}_${safeBase}${ext ? '.' + ext : ''}`;

  const otDir = path.join(uploadsDir, otId);
  if (!fs.existsSync(otDir)) {
    fs.mkdirSync(otDir, { recursive: true });
  }

  const destPath = path.join(otDir, destFileName);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(destPath, buffer);

  const relUrl = `/uploads/${otId}/${destFileName}`;
  const preview = extractServerPreview(destPath, ext, otDir, destFileName);

  const codeExts = ['html','htm','js','mjs','jsx','ts','tsx','css','scss','sass','json','py','sh','bash','zsh','sql','xml','yaml','yml','php','rb','go','rs','c','cpp','h','txt','csv','svg','md','markdown'];
  let textContent: string | null = null;
  if (codeExts.includes(ext) && buffer.length < 1024 * 1024) {
    textContent = buffer.toString('utf-8');
  }

  let fileType = 'document';
  if (['jpg','jpeg','png','gif','webp','bmp','ico','avif','svg'].includes(ext)) fileType = 'image';
  else if (['mp4','webm','mov','ogg','m4v'].includes(ext)) fileType = 'video';
  else if (ext === 'pdf') fileType = 'pdf';
  else if (['md','markdown'].includes(ext)) fileType = 'markdown';
  else if (['ttf','otf','woff','woff2'].includes(ext)) fileType = 'font';
  else if (codeExts.includes(ext)) fileType = 'code';

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');

  const mediaItem = {
    id: 'm-' + Date.now() + Math.random().toString(36).substring(2, 6),
    name: origName,
    type: preview?.kind || fileType,
    ext,
    size: (buffer.length / (1024 * 1024)).toFixed(2) + ' MB',
    date: `${dd}/${mm}/${yyyy} ${hh}:${min}`,
    url: preview ? `/uploads/${otId}/${preview.file}` : relUrl,
    originalUrl: relUrl,
    previewUrl: preview ? `/uploads/${otId}/${preview.file}` : null,
    previewKind: preview ? preview.kind : null,
    content: textContent,
  };

  return c.json({ ok: true, mediaItem });
});


// ABRIR ARCHIVO DIRECTAMENTE EN SU APLICACIÓN NATIVA DE MACOS (AFFINITY, ADOBE, IWORK)
app.post("/api/studio/open-native", async (c) => {
  const { fileUrl } = await c.req.json();
  if (!fileUrl || typeof fileUrl !== "string") {
    return c.json({ ok: false, error: "Ruta inválida" }, 400);
  }
  // Si viene con .preview.png o .preview.pdf, recuperar el nombre del archivo editable original (.af, .ai, .pages, etc.)
  const cleanRel = decodeURIComponent(fileUrl)
    .replace(/^\/+/, "")
    .replace(/\.preview\.(png|jpe?g|pdf)$/i, "");

  const fullPath = path.resolve("./", cleanRel);
  if (!fullPath.startsWith(uploadsDir) || !fs.existsSync(fullPath)) {
    return c.json({ ok: false, error: "Archivo original no encontrado: " + cleanRel }, 404);
  }
  const { execFile } = await import("node:child_process");
  execFile("open", [fullPath]);
  return c.json({ ok: true, opened: fullPath });
});

// 9. SERVIR ARCHIVOS SUBIDOS, ASSETS E INYECTAR EL PUENTE EN EL PROTOTIPO MAESTRO
app.use('/uploads/*', serveStatic({ root: './' }));
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
console.log(`TRAFIKEITOR // Servidor activo en http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
