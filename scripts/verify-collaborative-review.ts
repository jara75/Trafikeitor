import assert from 'node:assert/strict';
import fs from 'node:fs';

const dbPath = process.env.TRAFICO_DB_PATH || '/tmp/trafico_test_review.db';
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
process.env.TRAFICO_DB_PATH = dbPath;
process.env.IS_TEST = 'true';

const { app } = await import('../src/server/index.js');
const { sqlite } = await import('../src/server/db/index.js');

async function req(path: string, init: RequestInit = {}, cookie?: string) {
  const headers = new Headers(init.headers || {});
  headers.set('Origin', 'http://localhost:3000');
  if (cookie) headers.set('cookie', cookie);
  const res = await app.fetch(new Request(`http://localhost:3000${path}`, { ...init, headers }));
  const setCookie = res.headers.get('set-cookie') || '';
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch (_) {}
  return { status: res.status, json, text, setCookie };
}

function extractCookie(setCookie: string): string {
  return setCookie
    .split(/,(?=\s*[^;]+=)/)
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

console.log('================================================================');
console.log('TRAFIKEITOR // SUITE E2E: REVISIÓN COLABORATIVA Y PINES');
console.log('================================================================\n');

// 1. Registro + Estudio + OT
const ts = Date.now();
const signup = await req('/api/auth/sign-up/email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Director Estudio',
    email: `dir_rev_${ts}@estudio.test`,
    password: 'Password123!',
  }),
});
assert.equal(signup.status, 200, 'Registro de Director debe responder 200');
const cookie = extractCookie(signup.setCookie);
assert.ok(cookie, 'Debe emitir cookie de sesión');

const createOrg = await req(
  '/api/auth/organization/create',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Estudio Revisión', slug: `estudio-rev-${ts}` }),
  },
  cookie
);
assert.equal(createOrg.status, 200, 'Creación de organización debe responder 200');
const setActive = await req(
  '/api/auth/organization/set-active',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizationId: createOrg.json.id }),
  },
  cookie
);
assert.equal(setActive.status, 200, 'Debe fijar organización activa');

// 2. Subida física v1 + Sync
const form1 = new FormData();
form1.append('ot_id', 'OT-RV-001');
form1.append('file', new File([Buffer.from('PNG_DATA_V1')], 'kv_campana_v1.png', { type: 'image/png' }));
const up1 = await req('/api/studio/upload', { method: 'POST', body: form1 }, cookie);
assert.equal(up1.status, 200);
assert.ok(up1.json?.mediaItem?.id, 'Debe devolver mediaItem v1');
const v1 = up1.json.mediaItem;

const sync1 = await req(
  '/api/studio/sync',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orders: [
        {
          id: 'OT-RV-001',
          discipline: 'advertising',
          client: 'Acme Corp',
          brand: 'Acme',
          title: 'KV Campaña Lanzamiento',
          status: 'En Redacción',
          mediaFiles: [v1],
          routes: [],
        },
      ],
    }),
  },
  cookie
);
assert.equal(sync1.status, 200);
console.log('[1] Subida física v1 y sincronización inicial OK:', v1.id);

// 3. Compartir para revisar
const shareRes = await req(
  '/api/studio/reviews/share',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otId: 'OT-RV-001', mediaFileId: v1.id, reviewerLabel: 'Cliente Acme' }),
  },
  cookie
);
assert.equal(shareRes.status, 200);
const token = shareRes.json.token;
assert.ok(token, 'Debe generar token público');

const pageHtml = await req(`/review/${token}`);
assert.equal(pageHtml.status, 200);
assert.ok(pageHtml.text.includes('review-viewer.js') || pageHtml.text.includes('Revisión Colaborativa'), 'GET /review/:token debe servir HTML del visor');

const pub1 = await req(`/api/public/review/${token}`);
assert.equal(pub1.status, 200);
assert.equal(pub1.json.activeMedia.id, v1.id);
console.log('[2] Enlace público generado y visor /review/:token operativo:', token);

// 4. Pines normalizados + autoría híbrida + resolución
const pinRes = await req(`/api/public/review/${token}/threads`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mediaFileId: v1.id,
    xPercent: 0.4125,
    yPercent: 0.685,
    pageNumber: 1,
    content: 'Aumentar contraste del titular',
    authorName: 'María Gómez',
  }),
});
assert.equal(pinRes.status, 201);
assert.equal(pinRes.json.thread.pinNumber, 1);
assert.equal(pinRes.json.message.authorRole, 'client');
const threadId = pinRes.json.thread.id;

const agencyReply = await req(
  `/api/public/review/${token}/messages`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mediaFileId: v1.id,
      threadId,
      content: 'Ajustado en v2, revisa por favor.',
    }),
  },
  cookie
);
assert.equal(agencyReply.status, 201);
assert.equal(agencyReply.json.message.authorRole, 'agency');

const resolveRes = await req(
  `/api/public/review/${token}/threads/${threadId}/resolve`,
  {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isResolved: true }),
  },
  cookie
);
assert.equal(resolveRes.status, 200);
assert.equal(resolveRes.json.thread.isResolved, true);
console.log('[3] Pines normalizados, autoría híbrida (client/agency) y resolución OK');

// 5. Protección crítica de POST /api/studio/sync (no borrar cascada ni metadatos)
const sync2 = await req(
  '/api/studio/sync',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orders: [
        {
          id: 'OT-RV-001',
          discipline: 'advertising',
          client: 'Acme Corp',
          brand: 'Acme',
          title: 'KV Campaña Lanzamiento (Editado)',
          status: 'Tráfico',
          mediaFiles: [{ id: v1.id, name: v1.name, type: v1.type, ext: v1.ext, size: v1.size, date: v1.date, url: v1.url }],
          routes: [],
        },
      ],
    }),
  },
  cookie
);
assert.equal(sync2.status, 200);
const pubAfterSync = await req(`/api/public/review/${token}`);
assert.equal(pubAfterSync.status, 200, 'shared_reviews no debe eliminarse tras POST /api/studio/sync');
assert.equal(pubAfterSync.json.threads.length, 1, 'review_threads no debe eliminarse tras POST /api/studio/sync');
assert.equal(pubAfterSync.json.activeMedia.reviewStatus, 'in_review', 'review_status debe preservarse tras sync');
console.log('[4] Protección no destructiva en POST /api/studio/sync verificada (0 pérdida de hilos/enlaces)');

// 6. Subida de versión v2 y congelamiento de v1
const form2 = new FormData();
form2.append('ot_id', 'OT-RV-001');
form2.append('parent_media_id', v1.id);
form2.append('file', new File([Buffer.from('PNG_DATA_V2')], 'kv_campana_v2.png', { type: 'image/png' }));
const up2 = await req('/api/studio/reviews/version', { method: 'POST', body: form2 }, cookie);
assert.equal(up2.status, 200);
const v2 = up2.json.mediaItem;
assert.equal(v2.versionNumber, 2);

const pubV2 = await req(`/api/public/review/${token}`);
assert.equal(pubV2.json.activeMedia.id, v2.id, 'El enlace debe apuntar a v2');
assert.equal(pubV2.json.versions.length, 2, 'Deben existir 2 versiones en el selector');
assert.equal(pubV2.json.threads.length, 0, 'v2 debe iniciar con lienzo limpio (0 pines)');

const pubV1History = await req(`/api/public/review/${token}?mediaId=${encodeURIComponent(v1.id)}`);
assert.equal(pubV1History.json.threads.length, 1, 'v1 debe conservar su historial de pines intacto');
console.log('[5] Versionado v2 y congelamiento histórico de pines de v1 OK');

// 7. Cierre automático ("Solicitar Cambios" -> "Aprobar Pieza")
const changesRes = await req(`/api/public/review/${token}/decision`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mediaFileId: v2.id,
    decision: 'changes_requested',
    authorName: 'María Gómez',
    summary: 'Ajustar tono del fondo',
  }),
});
assert.equal(changesRes.status, 200);
assert.equal(changesRes.json.orderStatus, 'Diseño');
assert.equal(changesRes.json.routeEntry.stamp, 'AJUSTES');

const approveRes = await req(`/api/public/review/${token}/decision`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mediaFileId: v2.id,
    decision: 'approved',
    authorName: 'María Gómez',
  }),
});
assert.equal(approveRes.status, 200);
assert.equal(approveRes.json.orderStatus, 'Aprobado');
assert.equal(approveRes.json.routeEntry.stamp, 'APROBADO');

const orderRow = sqlite.prepare('SELECT status FROM work_orders WHERE id = ?').get('OT-RV-001') as { status: string };
assert.equal(orderRow.status, 'Aprobado');
const routeCount = sqlite.prepare('SELECT COUNT(*) AS c FROM route_entries WHERE ot_id = ?').get('OT-RV-001') as { c: number };
assert.equal(routeCount.c, 2, 'Deben haberse asentado 2 movimientos automáticos en route_entries');
console.log('[6] Cierre automático en route_entries (AJUSTES / APROBADO) y work_orders.status OK');

console.log('\n================================================================');
console.log('TODAS LAS PRUEBAS DE REVISIÓN COLABORATIVA PASARON AL 100%');
console.log('================================================================');
