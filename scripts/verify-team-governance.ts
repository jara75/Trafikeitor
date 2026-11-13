import assert from 'node:assert';
import fs from 'node:fs';
import { auth } from '../src/server/auth';
import { app } from '../src/server';
import { sqlite } from '../src/server/db';

async function run() {
  console.log('================================================================');
  console.log('TRAFIKEITOR // SUITE E2E: GOBERNANZA DE EQUIPO COLABORATIVO');
  console.log('================================================================');

  const ts = Date.now();
  const ownerEmail = `owner_${ts}@estudio.test`;
  const password = 'Password1234!';

  // Helper para peticiones autenticadas con cookie jar simple
  async function signUpAndLogin(email: string, name: string) {
    await auth.api.signUpEmail({
      body: { email, password, name },
    });
    const res = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    const setCookie = res.headers.get('set-cookie') || '';
    const cookie = setCookie.split(';')[0];
    const data = await res.json();
    return { user: data.user, cookie };
  }

  // 1. Registrar Owner y crear Organización
  console.log('\n[1] Registro de Director (Owner) y creación de Estudio:');
  const owner = await signUpAndLogin(ownerEmail, 'Director General');
  const orgCreateRes = await app.fetch(
    new Request('http://localhost:3000/api/auth/organization/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: owner.cookie,
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        name: `Estudio Gobernanza ${ts}`,
        slug: `estudio-gov-${ts}`,
      }),
    })
  );
  assert.strictEqual(orgCreateRes.status, 200, 'Debe crear la organización');
  const orgData = await orgCreateRes.json();
  const orgId = orgData.id;

  // Fijar organización activa
  await app.fetch(
    new Request('http://localhost:3000/api/auth/organization/set-active', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: owner.cookie,
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ organizationId: orgId }),
    })
  );
  console.log('   ✔ Estudio creado:', orgId);

  // Helper para invitar y aceptar miembro
  async function inviteAndJoin(email: string, name: string) {
    const inviteRes = await app.fetch(
      new Request('http://localhost:3000/api/auth/organization/invite-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: owner.cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ email, role: 'member' }),
      })
    );
    const inviteJson = await inviteRes.json();
    if (inviteRes.status !== 200) {
      return { status: inviteRes.status, error: inviteJson };
    }
    const u = await signUpAndLogin(email, name);
    const acceptRes = await app.fetch(
      new Request('http://localhost:3000/api/auth/organization/accept-invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: u.cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ invitationId: inviteJson.id }),
      })
    );
    const acceptJson = await acceptRes.json();
    await app.fetch(
      new Request('http://localhost:3000/api/auth/organization/set-active', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: u.cookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ organizationId: orgId }),
      })
    );
    return {
      status: acceptRes.status,
      user: u.user,
      cookie: u.cookie,
      memberId: acceptJson?.member?.id,
    };
  }

  // 2. Invitar Miembro B y Miembro C
  console.log('\n[2] Invitación y activación de Miembro B y Miembro C:');
  const memberB = await inviteAndJoin(`miembrob_${ts}@estudio.test`, 'Beatriz Creativa');
  assert.strictEqual(memberB.status, 200, 'Miembro B debe unirse');
  const memberC = await inviteAndJoin(`miembroc_${ts}@estudio.test`, 'Carlos Arte');
  assert.strictEqual(memberC.status, 200, 'Miembro C debe unirse');
  console.log('   ✔ Miembro B:', memberB.memberId, '| Miembro C:', memberC.memberId);

  // Verificar que Miembro B tiene sesión activa en SQLite para esta org
  const sessionsBefore = sqlite
    .prepare('SELECT COUNT(*) as c FROM sessions WHERE user_id = ? AND active_organization_id = ?')
    .get(memberB.user.id, orgId) as { c: number };
  assert.ok(sessionsBefore.c >= 1, 'Miembro B debe tener al menos 1 sesión activa');

  // 3. Desactivar Miembro B -> Revocación activa de sesiones + Bloqueo 403
  console.log('\n[3] Desactivación de Miembro B y revocación de sesiones en SQLite:');
  const deactivateRes = await app.fetch(
    new Request('http://localhost:3000/api/studio/team/member/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: owner.cookie,
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ memberId: memberB.memberId, status: 'deactivated' }),
    })
  );
  const deactivateJson = await deactivateRes.json();
  assert.strictEqual(deactivateRes.status, 200);
  assert.strictEqual(deactivateJson.status, 'deactivated');
  assert.strictEqual(deactivateJson.sessionsRevoked, true);

  // Verificar purga en tabla sessions
  const sessionsAfter = sqlite
    .prepare('SELECT COUNT(*) as c FROM sessions WHERE user_id = ? AND active_organization_id = ?')
    .get(memberB.user.id, orgId) as { c: number };
  assert.strictEqual(sessionsAfter.c, 0, 'Todas las sesiones de Miembro B en este estudio deben estar purgadas');
  console.log('   ✔ Sesiones de Miembro B purgadas en SQLite (0 restantes)');

  // Si Miembro B vuelve a hacer sign-in e intenta acceder a /api/studio/bootstrap -> 403 account_deactivated
  const reSignInB = await auth.api.signInEmail({
    body: { email: `miembrob_${ts}@estudio.test`, password },
    asResponse: true,
  });
  const cookieB2 = (reSignInB.headers.get('set-cookie') || '').split(';')[0];
  const bootBRes = await app.fetch(
    new Request('http://localhost:3000/api/studio/bootstrap', {
      headers: { Cookie: cookieB2, Origin: 'http://localhost:3000' },
    })
  );
  const bootBJson = await bootBRes.json();
  assert.strictEqual(bootBRes.status, 403, 'Miembro desactivado debe recibir HTTP 403');
  assert.strictEqual(bootBJson.error, 'account_deactivated');
  console.log('   ✔ Miembro B bloqueado con HTTP 403 account_deactivated');

  // 4. Liberación Real de Asiento en Better Auth (6 activos máx)
  console.log('\n[4] Validación de cupo dinámico Better Auth (6 activos máx):');
  // Actualmente: Owner (activo), B (inactivo), C (activo) -> 2 activos, 1 inactivo.
  // Agregamos 4 miembros activos más (D, E, F, G) -> Total 6 activos + 1 inactivo = 7 filas en members.
  const memberD = await inviteAndJoin(`miembrod_${ts}@estudio.test`, 'Daniela Copy');
  const memberE = await inviteAndJoin(`miembroe_${ts}@estudio.test`, 'Elena Cuentas');
  const memberF = await inviteAndJoin(`miembrof_${ts}@estudio.test`, 'Felipe Medios');
  const memberG = await inviteAndJoin(`miembrog_${ts}@estudio.test`, 'Gabriel Tráfico');
  assert.strictEqual(memberD.status, 200);
  assert.strictEqual(memberE.status, 200);
  assert.strictEqual(memberF.status, 200);
  assert.strictEqual(memberG.status, 200, 'El 6to miembro activo debe poder unirse porque B está desactivado');
  console.log('   ✔ 6to miembro activo aceptado exitosamente por Better Auth (B inactivo liberó su asiento)');

  // Intentar invitar un 7mo miembro activo (H) -> Better Auth debe rechazar por límite alcanzado
  const overLimitRes = await inviteAndJoin(`miembroh_${ts}@estudio.test`, 'Hector Extra');
  assert.notStrictEqual(overLimitRes.status, 200, 'No debe permitir superar los 6 miembros activos');
  console.log('   ✔ 7mo miembro activo bloqueado correctamente por Better Auth (límite de 6 activos)');

  // 5. Reactivación fallida por cupo lleno, luego exitosa al liberar
  const reactivateFail = await app.fetch(
    new Request('http://localhost:3000/api/studio/team/member/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: owner.cookie,
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ memberId: memberB.memberId, status: 'active' }),
    })
  );
  assert.strictEqual(reactivateFail.status, 400, 'No debe reactivar a B si ya hay 6 activos');

  // Desactivar G para liberar cupo y reactivar B
  await app.fetch(
    new Request('http://localhost:3000/api/studio/team/member/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: owner.cookie,
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ memberId: memberG.memberId, status: 'deactivated' }),
    })
  );
  const reactivateOk = await app.fetch(
    new Request('http://localhost:3000/api/studio/team/member/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: owner.cookie,
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ memberId: memberB.memberId, status: 'active' }),
    })
  );
  assert.strictEqual(reactivateOk.status, 200, 'Debe reactivar a B tras liberar 1 cupo');
  console.log('   ✔ Reactivación de Miembro B validada');

  // 6. Preservación de Firmas Históricas y Bloqueo Cero Huérfanas (Estados Terminales)
  console.log('\n[5] Preservación de firmas históricas y protocolo Cero Huérfanas:');
  const nowIso = new Date().toISOString();
  // OT cerrada histórica (debe conservar firma de Beatriz C.)
  sqlite
    .prepare(
      `INSERT INTO work_orders (id, organization_id, ref, discipline, client, brand, product, title, media, status, responsible, urgent, brief, legal_text, created_at, updated_at)
       VALUES (?, ?, 'HIST-01', 'advertising', 'Cliente H', 'Marca H', '', 'Campaña Pasada', 'TV', 'Cerrado', 'Beatriz C.', 0, '', '', ?, ?)`
    )
    .run(`OT-HIST-${ts}`, orgId, nowIso, nowIso);

  // OT activa en tránsito (status = 'Tráfico', NO terminal -> debe exigirse reasignación)
  sqlite
    .prepare(
      `INSERT INTO work_orders (id, organization_id, ref, discipline, client, brand, product, title, media, status, responsible, urgent, brief, legal_text, created_at, updated_at)
       VALUES (?, ?, 'ACT-01', 'advertising', 'Cliente A', 'Marca A', '', 'Campaña Activa', 'Digital', 'Tráfico', 'Beatriz C.', 1, '', '', ?, ?)`
    )
    .run(`OT-ACT-${ts}`, orgId, nowIso, nowIso);

  // Paso de ruta incompleto firmado por Beatriz C.
  sqlite
    .prepare(
      `INSERT INTO route_entries (organization_id, ot_id, line_number, from_dept, to_dept, task, entry_date, delivery_date, sign, notes, stamp, completed, created_at)
       VALUES (?, ?, 1, 'Cuentas', 'Creativos', 'Diseñar KV', '12/11/2026 10:00', '', 'Beatriz C.', '', NULL, 0, ?)`
    )
    .run(orgId, `OT-ACT-${ts}`, nowIso);

  // Tira de Stripboard pendiente asignada a Beatriz C.
  sqlite
    .prepare(
      `INSERT INTO stripboard_strips (id, organization_id, date_str, sort_order, type, ot_id, title, client, brand, product, time_slot, task, assignee, shift_status)
       VALUES (?, ?, '2026-11-12', 0, 'ot', ?, 'Campaña Activa', 'Cliente A', 'Marca A', '', '09:00', 'KV', 'Beatriz C.', 'Por Iniciar')`
    )
    .run(`STR-${ts}`, orgId, `OT-ACT-${ts}`);

  // Intentar retirar a Miembro B sin targetMemberId -> debe fallar con 400 reassignment_required
  const delBlockedRes = await app.fetch(
    new Request('http://localhost:3000/api/studio/team/member/reassign-and-delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: owner.cookie,
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ memberId: memberB.memberId }),
    })
  );
  const delBlockedJson = await delBlockedRes.json();
  assert.strictEqual(delBlockedRes.status, 400);
  assert.strictEqual(delBlockedJson.error, 'reassignment_required');
  assert.strictEqual(delBlockedJson.activeWorkOrdersCount, 1);
  assert.strictEqual(delBlockedJson.activeRoutesCount, 1);
  assert.strictEqual(delBlockedJson.activeStripsCount, 1);
  console.log('   ✔ Eliminación directa bloqueada por carga activa (1 OT, 1 ruta, 1 tira)');

  // 7. Reasignación atómica a Miembro C (Carlos A.) y eliminación segura
  console.log('\n[6] Reasignación atómica integral a Miembro C y retiro:');
  const reassignRes = await app.fetch(
    new Request('http://localhost:3000/api/studio/team/member/reassign-and-delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: owner.cookie,
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        memberId: memberB.memberId,
        targetMemberId: memberC.memberId,
      }),
    })
  );
  const reassignJson = await reassignRes.json();
  assert.strictEqual(reassignRes.status, 200);
  assert.strictEqual(reassignJson.ok, true);
  assert.strictEqual(reassignJson.reassignedOrdersCount, 1);
  assert.strictEqual(reassignJson.reassignedRoutesCount, 1);
  assert.strictEqual(reassignJson.reassignedStripsCount, 1);

  // Comprobar estado final en SQLite
  const histOt = sqlite.prepare('SELECT responsible FROM work_orders WHERE id = ?').get(`OT-HIST-${ts}`) as { responsible: string };
  const actOt = sqlite.prepare('SELECT responsible FROM work_orders WHERE id = ?').get(`OT-ACT-${ts}`) as { responsible: string };
  const strip = sqlite.prepare('SELECT assignee FROM stripboard_strips WHERE id = ?').get(`STR-${ts}`) as { assignee: string };
  const relevoNote = sqlite.prepare("SELECT stamp, sign FROM route_entries WHERE ot_id = ? AND stamp = 'RELEVO'").get(`OT-ACT-${ts}`) as any;
  const memBAfter = sqlite.prepare('SELECT id FROM members WHERE id = ?').get(memberB.memberId);

  assert.strictEqual(histOt.responsible, 'Beatriz C.', 'La OT cerrada histórica DEBE conservar la firma original de Beatriz C.');
  assert.strictEqual(actOt.responsible, 'Carlos A.', 'La OT activa debe haber sido transferida a Carlos A.');
  assert.strictEqual(strip.assignee, 'Carlos A.', 'La tira del stripboard debe haber sido transferida a Carlos A.');
  assert.ok(relevoNote && relevoNote.sign === 'Carlos A.', 'Debe existir la nota de RELEVO en la Hoja de Ruta');
  assert.strictEqual(memBAfter, undefined, 'La membresía de Miembro B debe haber sido eliminada');

  console.log('   ✔ OT histórica preservada con "Beatriz C."');
  console.log('   ✔ OT activa, ruta y tira transferidas atómicamente a "Carlos A."');
  console.log('   ✔ Nota de auditoría RELEVO registrada y membresía retirada');

  console.log('\n================================================================');
  console.log('TODAS LAS PRUEBAS DE GOBERNANZA DE EQUIPO PASARON AL 100%');
  console.log('================================================================\n');
}

run()
  .then(() => {
    const dbPath = process.env.TRAFICO_DB_PATH;
    if (dbPath && dbPath.startsWith('/tmp/')) {
      try {
        fs.unlinkSync(dbPath);
      } catch (_) {}
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ ERROR EN VERIFICACIÓN:', err);
    process.exit(1);
  });

