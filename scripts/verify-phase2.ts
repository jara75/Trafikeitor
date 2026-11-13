import { auth } from '../src/server/auth';
import { app } from '../src/server';
import { sqlite } from '../src/server/db';

async function testPhase2() {
  console.log('=== VERIFICANDO FASE 2: ONBOARDING "NOMBRA TU ESTUDIO" ===');

  const testEmail = 'fase2.director@agencia-test.com';
  const orgSlug = 'agencia-onboarding-' + Date.now();
  const orgName = 'Agencia Creativa Vanguardia';

  // Limpiar rastros previos
  sqlite.prepare('DELETE FROM users WHERE email = ?').run(testEmail);
  sqlite.prepare('DELETE FROM organizations WHERE slug = ?').run(orgSlug);

  // 1. Sign up abierto de nuevo usuario
  const signUpRes = await auth.api.signUpEmail({
    body: {
      email: testEmail,
      password: 'Password1234!',
      name: 'Director Creativo Fase2'
    }
  });
  console.log('✔ 1. Usuario registrado con sign-up abierto:', signUpRes.user.email);

  // 2. Obtener cookie de sesión
  const signInRes = await auth.api.signInEmail({
    body: {
      email: testEmail,
      password: 'Password1234!'
    },
    asResponse: true
  });
  const cookie = signInRes.headers.get('set-cookie') || '';
  console.log('✔ 2. Sesión activa obtenida.');

  // 3. Probar que bootstrap responde 403 no_organization para usuario sin estudio
  const preBootReq = new Request('http://localhost:3000/api/studio/bootstrap', {
    method: 'GET',
    headers: {
      Cookie: cookie,
      Origin: 'http://localhost:3000'
    }
  });
  const preBootRes = await app.fetch(preBootReq);
  const preBootData = await preBootRes.json();
  console.log('✔ 3. Bootstrap previo a creación de estudio:', preBootRes.status, preBootData.error);
  if (preBootRes.status !== 403 || preBootData.error !== 'no_organization') {
    throw new Error(`Se esperaba 403 no_organization, se obtuvo ${preBootRes.status}`);
  }

  // 4. Crear estudio vía POST /api/auth/organization/create (como hace el modal)
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
  console.log('✔ 4. Estudio creado vía Better Auth:', createdOrg.name, 'ID:', createdOrg.id);

  // 5. Verificar persistencia de trial_ends_at en SQLite
  const dbOrg = sqlite.prepare('SELECT id, name, slug, status, subscription_status, trial_ends_at FROM organizations WHERE id = ?').get(createdOrg.id) as any;
  console.log('✔ 5. Registro verificado en SQLite:');
  console.log('   - subscription_status:', dbOrg.subscription_status);
  console.log('   - status:', dbOrg.status);
  console.log('   - trial_ends_at:', dbOrg.trial_ends_at, '(fecha:', new Date(dbOrg.trial_ends_at * 1000).toISOString(), ')');

  if (!dbOrg.trial_ends_at || dbOrg.trial_ends_at <= 0) {
    throw new Error('FALLA: trial_ends_at no fue persistido en base de datos al crear la organización');
  }

  // 6. Fijar organización activa
  const setActiveReq = new Request('http://localhost:3000/api/auth/organization/set-active', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      Origin: 'http://localhost:3000'
    },
    body: JSON.stringify({
      organizationId: createdOrg.id
    })
  });
  const setActiveRes = await app.fetch(setActiveReq);
  const setActiveCookie = setActiveRes.headers.get('set-cookie') || cookie;
  console.log('✔ 6. Organización fijada como activa.');

  // 7. Bootstrap posterior: debe abrir la mesa con 14 días restantes
  const postBootReq = new Request('http://localhost:3000/api/studio/bootstrap', {
    method: 'GET',
    headers: {
      Cookie: setActiveCookie,
      Origin: 'http://localhost:3000'
    }
  });
  const postBootRes = await app.fetch(postBootReq);
  const postBootData = await postBootRes.json();
  console.log('✔ 7. Bootstrap post-creación exitoso:');
  console.log('   - Organización:', postBootData.organization?.name);
  console.log('   - Días restantes de prueba:', postBootData.organization?.trialDaysLeft);
  console.log('   - Órdenes iniciales:', postBootData.orders?.length);
  console.log('   - Estados sembrados:', postBootData.statuses?.length);

  if (postBootRes.status !== 200 || postBootData.organization?.trialDaysLeft !== 14) {
    throw new Error(`Bootstrap post-creación inválido: status ${postBootRes.status}`);
  }

  // 8. Sincronización de orden en el nuevo estudio
  const syncReq = new Request('http://localhost:3000/api/studio/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: setActiveCookie,
      Origin: 'http://localhost:3000'
    },
    body: JSON.stringify({
      orders: [
        {
          id: 'OT-26-001',
          client: 'Cliente Alfa',
          brand: 'Marca Primera',
          title: 'Campaña Lanzamiento Q1',
          status: 'Tráfico'
        }
      ]
    })
  });
  const syncRes = await app.fetch(syncReq);
  const syncData = await syncRes.json();
  console.log('✔ 8. Sync de OT en nuevo estudio exitoso:', syncData);

  // Limpieza
  sqlite.prepare('DELETE FROM work_orders WHERE id = ?').run('OT-26-001');
  sqlite.prepare('DELETE FROM organizations WHERE slug = ?').run(orgSlug);
  sqlite.prepare('DELETE FROM users WHERE email = ?').run(testEmail);
  console.log('✔ 9. Limpieza completada.');
  console.log('=== FASE 2 VERIFICADA EXITOSAMENTE ===');
}

testPhase2().catch((err) => {
  console.error('Error en test de Fase 2:', err);
  process.exit(1);
});

