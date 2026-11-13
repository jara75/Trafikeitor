import { auth } from '../src/server/auth';
import { app } from '../src/server';
import { sqlite } from '../src/server/db';

async function testPhase4() {
  console.log('=== VERIFICANDO FASE 4: MODO EXPIRADO (402) Y WEBHOOK BOLD ===');

  const testEmail = 'fase4.director@bold-paywall.com';
  const orgSlug = 'estudio-paywall-' + Date.now();
  const orgName = 'Agencia Bold Paywall Test';

  sqlite.prepare('DELETE FROM users WHERE email = ?').run(testEmail);
  sqlite.prepare('DELETE FROM organizations WHERE slug = ?').run(orgSlug);

  // 1. Registro abierto y sesión
  await auth.api.signUpEmail({
    body: {
      email: testEmail,
      password: 'Password1234!',
      name: 'Director Paywall'
    }
  });

  const signInRes = await auth.api.signInEmail({
    body: {
      email: testEmail,
      password: 'Password1234!'
    },
    asResponse: true
  });
  const cookie = signInRes.headers.get('set-cookie') || '';

  // 2. Crear organización
  const createOrgReq = new Request('http://localhost:3000/api/auth/organization/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      Origin: 'http://localhost:3000'
    },
    body: JSON.stringify({
      name: orgName,
      slug: orgSlug
    })
  });
  const createOrgRes = await app.fetch(createOrgReq);
  const createdOrg = await createOrgRes.json();
  const orgId = createdOrg.id;
  console.log('✔ 1. Estudio creado:', createdOrg.name, 'ID:', orgId);

  // Activar org en sesión
  const setActiveReq = new Request('http://localhost:3000/api/auth/organization/set-active', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      Origin: 'http://localhost:3000'
    },
    body: JSON.stringify({ organizationId: orgId })
  });
  const setActiveRes = await app.fetch(setActiveReq);
  const activeCookie = setActiveRes.headers.get('set-cookie') || cookie;

  // 3. Probar que sync funciona normalmente durante el período de prueba (14 días)
  const syncReq1 = new Request('http://localhost:3000/api/studio/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: activeCookie,
      Origin: 'http://localhost:3000'
    },
    body: JSON.stringify({
      orders: [
        {
          id: 'OT-PAY-01',
          client: 'Cliente Activo',
          brand: 'Marca A',
          title: 'Campaña en Trial Vigente',
          status: 'Tráfico'
        }
      ]
    })
  });
  const syncRes1 = await app.fetch(syncReq1);
  const syncData1 = await syncRes1.json();
  console.log('✔ 2. Sync exitoso en período de prueba vigente:', syncRes1.status, syncData1.ok);
  if (syncRes1.status !== 200 || !syncData1.ok) {
    throw new Error('Falla en sync con trial vigente');
  }

  // 4. Simular vencimiento de prueba en SQLite (trial_ends_at en el pasado)
  const pastTimestamp = Math.floor(Date.now() / 1000) - 7200; // 2 horas atrás
  sqlite
    .prepare("UPDATE organizations SET trial_ends_at = ?, subscription_status = 'trialing' WHERE id = ?")
    .run(pastTimestamp, orgId);
  console.log('✔ 3. Simulación de prueba vencida aplicada en SQLite.');

  // 5. Verificar que bootstrap sigue respondiendo 200 OK (acceso de solo lectura y respaldos)
  const bootReq = new Request('http://localhost:3000/api/studio/bootstrap', {
    method: 'GET',
    headers: {
      Cookie: activeCookie,
      Origin: 'http://localhost:3000'
    }
  });
  const bootRes = await app.fetch(bootReq);
  const bootData = await bootRes.json();
  console.log('✔ 4. Bootstrap en modo expirado (solo lectura):');
  console.log('   - Status HTTP:', bootRes.status);
  console.log('   - Días restantes:', bootData.organization?.trialDaysLeft);
  console.log('   - Órdenes accesibles para lectura/respaldo:', bootData.orders?.length);

  if (bootRes.status !== 200 || bootData.organization?.trialDaysLeft !== 0) {
    throw new Error(`Se esperaba bootstrap 200 OK con trialDaysLeft === 0, se obtuvo ${bootRes.status}`);
  }

  // 6. Probar que las mutaciones POST /api/studio/sync son rechazadas con 402 Payment Required
  const syncReq2 = new Request('http://localhost:3000/api/studio/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: activeCookie,
      Origin: 'http://localhost:3000'
    },
    body: JSON.stringify({
      orders: [
        {
          id: 'OT-PAY-02',
          client: 'Cliente Bloqueado',
          brand: 'Marca B',
          title: 'Campaña con Trial Vencido',
          status: 'Tráfico'
        }
      ]
    })
  });
  const syncRes2 = await app.fetch(syncReq2);
  const syncData2 = await syncRes2.json();
  console.log('✔ 5. Intento de sync con prueba expirada rechazado correctamente:');
  console.log('   - Código HTTP:', syncRes2.status);
  console.log('   - Error:', syncData2.error);
  console.log('   - Mensaje:', syncData2.message);

  if (syncRes2.status !== 402 || syncData2.error !== 'trial_expired') {
    throw new Error(`Se esperaba 402 trial_expired, se obtuvo ${syncRes2.status}`);
  }

  // 7. Simular recepción de Webhook de Bold con pago aprobado
  process.env.BOLD_WEBHOOK_SECRET = 'bold_secret_test_key_2026';

  // 7.1 Probar rechazo con secreto inválido
  const badWebhookReq = new Request('http://localhost:3000/api/billing/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bold-signature': 'secreto_invalido'
    },
    body: JSON.stringify({
      status: 'APPROVED',
      reference: orgId
    })
  });
  const badWebhookRes = await app.fetch(badWebhookReq);
  console.log('✔ 6. Webhook no autorizado rechazado:', badWebhookRes.status);
  if (badWebhookRes.status !== 401) {
    throw new Error(`Se esperaba 401 en webhook con secreto inválido, se obtuvo ${badWebhookRes.status}`);
  }

  // 7.2 Probar aceptación con secreto válido y payload de Bold
  const validWebhookReq = new Request('http://localhost:3000/api/billing/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bold-signature': 'bold_secret_test_key_2026'
    },
    body: JSON.stringify({
      data: {
        status: 'APPROVED',
        reference: orgId,
        payment_method: 'CARD',
        amount: 49.00
      }
    })
  });
  const validWebhookRes = await app.fetch(validWebhookReq);
  const validWebhookData = await validWebhookRes.json();
  console.log('✔ 7. Webhook de Bold procesado exitosamente:');
  console.log('   - Activated:', validWebhookData.activated);
  console.log('   - Organization ID:', validWebhookData.organizationId);

  if (validWebhookRes.status !== 200 || !validWebhookData.activated) {
    throw new Error('Falla al activar organización desde Webhook de Bold');
  }

  // 8. Verificar en SQLite que el estado ahora es 'active'
  const activeOrgDb = sqlite.prepare('SELECT status, subscription_status FROM organizations WHERE id = ?').get(orgId) as any;
  console.log('✔ 8. Estado en SQLite post-webhook:');
  console.log('   - subscription_status:', activeOrgDb.subscription_status);
  console.log('   - status:', activeOrgDb.status);

  if (activeOrgDb.subscription_status !== 'active' || activeOrgDb.status !== 'active') {
    throw new Error(`Se esperaba subscription_status: 'active', se obtuvo ${activeOrgDb.subscription_status}`);
  }

  // 9. Reintentar mutación sync: ¡Ahora debe responder 200 OK!
  const syncReq3 = new Request('http://localhost:3000/api/studio/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: activeCookie,
      Origin: 'http://localhost:3000'
    },
    body: JSON.stringify({
      orders: [
        {
          id: 'OT-PAY-03',
          client: 'Cliente Reactivado',
          brand: 'Marca C',
          title: 'Campaña con Plan Pro Desbloqueado',
          status: 'Tráfico'
        }
      ]
    })
  });
  const syncRes3 = await app.fetch(syncReq3);
  const syncData3 = await syncRes3.json();
  console.log('✔ 9. Sync reactivado exitosamente tras pago confirmado:', syncRes3.status, syncData3.ok);

  if (syncRes3.status !== 200 || !syncData3.ok) {
    throw new Error('Sync falló tras confirmación de pago en webhook');
  }

  // Limpieza
  sqlite.prepare('DELETE FROM work_orders WHERE id IN (?, ?, ?)').run('OT-PAY-01', 'OT-PAY-02', 'OT-PAY-03');
  sqlite.prepare('DELETE FROM organizations WHERE slug = ?').run(orgSlug);
  sqlite.prepare('DELETE FROM users WHERE email = ?').run(testEmail);
  delete process.env.BOLD_WEBHOOK_SECRET;

  console.log('✔ 10. Limpieza de datos completada.');
  console.log('=== FASE 4 VERIFICADA EXITOSAMENTE ===');
}

testPhase4().catch((err) => {
  console.error('Error en test de Fase 4:', err);
  process.exit(1);
});

