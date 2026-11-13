import { auth } from '../src/server/auth';
import { app } from '../src/server';
import { sqlite } from '../src/server/db';

async function verifyFullPlgFlow() {
  console.log('================================================================');
  console.log('TRAFIKEITOR // VERIFICACIÓN INTEGRAL DE FLUJO COMERCIAL SAAS PLG');
  console.log('================================================================');

  const testEmail = 'director.master@agencia-creativa-plg.com';
  const orgSlug = 'agencia-master-' + Date.now();
  const orgName = 'Central Creativa de Marcas';

  sqlite.prepare('DELETE FROM users WHERE email = ?').run(testEmail);
  sqlite.prepare('DELETE FROM organizations WHERE slug = ?').run(orgSlug);

  // --------------------------------------------------------------------------
  // TEST 1: Registro Público Abierto y Compuerta de Onboarding (403)
  // --------------------------------------------------------------------------
  console.log('\n[Paso 1] Registro público abierto sin tarjeta:');
  const signUpRes = await auth.api.signUpEmail({
    body: {
      email: testEmail,
      password: 'Password1234!',
      name: 'Director Creativo Maestro'
    }
  });
  console.log('✔ Usuario registrado en Better Auth:', signUpRes.user.email);

  const signInRes = await auth.api.signInEmail({
    body: { email: testEmail, password: 'Password1234!' },
    asResponse: true
  });
  const cookie = signInRes.headers.get('set-cookie') || '';

  const preBootRes = await app.fetch(new Request('http://localhost:3000/api/studio/bootstrap', {
    headers: { Cookie: cookie, Origin: 'http://localhost:3000' }
  }));
  const preBootData = await preBootRes.json();
  console.log('✔ Compuerta Preflight activada sin organización: HTTP', preBootRes.status, preBootData.error);
  if (preBootRes.status !== 403 || preBootData.error !== 'no_organization') {
    throw new Error('Compuerta de Onboarding falló: se esperaba 403 no_organization');
  }

  // --------------------------------------------------------------------------
  // TEST 2: Creación de Estudio ("Nombra tu Estudio") y Persistencia de 14 Días
  // --------------------------------------------------------------------------
  console.log('\n[Paso 2] Creación de estudio ("Nombra tu Estudio"):');
  const createOrgRes = await app.fetch(new Request('http://localhost:3000/api/auth/organization/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
    body: JSON.stringify({ name: orgName, slug: orgSlug })
  }));
  const createdOrg = await createOrgRes.json();
  const orgId = createdOrg.id;
  console.log('✔ Estudio creado en Better Auth:', createdOrg.name, 'ID:', orgId);

  const dbOrg = sqlite.prepare('SELECT id, name, slug, status, subscription_status, trial_ends_at FROM organizations WHERE id = ?').get(orgId) as any;
  console.log('✔ Registro verificado en SQLite:');
  console.log('   - Subscription Status:', dbOrg.subscription_status);
  console.log('   - Administrative Status:', dbOrg.status);
  console.log('   - Trial Ends At:', dbOrg.trial_ends_at, `(${new Date(dbOrg.trial_ends_at * 1000).toISOString()})`);

  if (!dbOrg.trial_ends_at || dbOrg.subscription_status !== 'trialing') {
    throw new Error('Falla: trial_ends_at o subscription_status no fueron persistidos en SQLite');
  }

  // Fijar activa
  const setActiveRes = await app.fetch(new Request('http://localhost:3000/api/auth/organization/set-active', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
    body: JSON.stringify({ organizationId: orgId })
  }));
  const activeCookie = setActiveRes.headers.get('set-cookie') || cookie;

  // --------------------------------------------------------------------------
  // TEST 3: Bootstrap y Operación en Período de Prueba Vigente
  // --------------------------------------------------------------------------
  console.log('\n[Paso 3] Bootstrap y Operación en Prueba Vigente:');
  const bootRes = await app.fetch(new Request('http://localhost:3000/api/studio/bootstrap', {
    headers: { Cookie: activeCookie, Origin: 'http://localhost:3000' }
  }));
  const bootData = await bootRes.json();
  console.log('✔ Bootstrap exitoso:');
  console.log('   - Estudio:', bootData.organization?.name);
  console.log('   - Días restantes:', bootData.organization?.trialDaysLeft);
  console.log('   - Órdenes iniciales:', bootData.orders?.length);

  if (bootRes.status !== 200 || bootData.organization?.trialDaysLeft !== 14) {
    throw new Error('Falla en bootstrap de prueba vigente');
  }

  // Sync orden
  const syncRes1 = await app.fetch(new Request('http://localhost:3000/api/studio/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: activeCookie, Origin: 'http://localhost:3000' },
    body: JSON.stringify({
      orders: [
        {
          id: 'OT-MASTER-01',
          client: 'Cervecería Master',
          brand: 'Pilsen Pro',
          title: 'Campaña Primavera 2026',
          status: 'Tráfico'
        }
      ]
    })
  }));
  const syncData1 = await syncRes1.json();
  console.log('✔ Sincronización de OT con prueba activa: HTTP', syncRes1.status, syncData1.ok);
  if (syncRes1.status !== 200 || !syncData1.ok) {
    throw new Error('Falla en sincronización con prueba activa');
  }

  // --------------------------------------------------------------------------
  // TEST 4: Simulación de Expiración (402 en Mutaciones, 200 en Lectura/Respaldo)
  // --------------------------------------------------------------------------
  console.log('\n[Paso 4] Simulación de Expiración de Prueba:');
  const pastTimestamp = Math.floor(Date.now() / 1000) - 3600;
  sqlite.prepare("UPDATE organizations SET trial_ends_at = ?, subscription_status = 'trialing' WHERE id = ?").run(pastTimestamp, orgId);

  // Lectura garantizada
  const expiredBootRes = await app.fetch(new Request('http://localhost:3000/api/studio/bootstrap', {
    headers: { Cookie: activeCookie, Origin: 'http://localhost:3000' }
  }));
  const expiredBootData = await expiredBootRes.json();
  console.log('✔ Lectura y respaldos preservados: HTTP', expiredBootRes.status, `(Días restantes: ${expiredBootData.organization?.trialDaysLeft})`);
  if (expiredBootRes.status !== 200 || expiredBootData.organization?.trialDaysLeft !== 0) {
    throw new Error('Lectura en modo expirado falló');
  }

  // Mutación bloqueada con 402
  const syncRes2 = await app.fetch(new Request('http://localhost:3000/api/studio/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: activeCookie, Origin: 'http://localhost:3000' },
    body: JSON.stringify({
      orders: [
        {
          id: 'OT-MASTER-02',
          client: 'Cervecería Master',
          brand: 'Pilsen Pro',
          title: 'OT Bloqueada',
          status: 'Tráfico'
        }
      ]
    })
  }));
  const syncData2 = await syncRes2.json();
  console.log('✔ Mutación bloqueada con Paywall: HTTP', syncRes2.status, syncData2.error);
  if (syncRes2.status !== 402 || syncData2.error !== 'trial_expired') {
    throw new Error('Se esperaba 402 trial_expired');
  }

  // --------------------------------------------------------------------------
  // TEST 5: Webhook de Activación Comercial con Bold
  // --------------------------------------------------------------------------
  console.log('\n[Paso 5] Webhook de Activación Comercial con Bold:');
  process.env.BOLD_WEBHOOK_SECRET = 'bold_prod_secret_token_123';

  // Intento no autorizado
  const badWhRes = await app.fetch(new Request('http://localhost:3000/api/billing/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bold-signature': 'token_erroneo' },
    body: JSON.stringify({ status: 'APPROVED', reference: orgId })
  }));
  console.log('✔ Intento de webhook no autorizado rechazado: HTTP', badWhRes.status);
  if (badWhRes.status !== 401) {
    throw new Error('Falla en validación de seguridad de webhook');
  }

  // Webhook autorizado aprobado
  const goodWhRes = await app.fetch(new Request('http://localhost:3000/api/billing/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bold-signature': 'bold_prod_secret_token_123' },
    body: JSON.stringify({
      data: {
        status: 'APPROVED',
        reference: orgId,
        payment_method: 'PSE',
        amount: 49.00
      }
    })
  }));
  const goodWhData = await goodWhRes.json();
  console.log('✔ Webhook aprobado de Bold procesado: HTTP', goodWhRes.status, 'Activado:', goodWhData.activated);
  if (goodWhRes.status !== 200 || !goodWhData.activated) {
    throw new Error('Falla al activar organización desde webhook de Bold');
  }

  const activatedDbOrg = sqlite.prepare('SELECT subscription_status, status FROM organizations WHERE id = ?').get(orgId) as any;
  console.log('✔ Estado final en SQLite: subscription_status =', activatedDbOrg.subscription_status);
  if (activatedDbOrg.subscription_status !== 'active') {
    throw new Error('Suscripción no pasó a active en SQLite');
  }

  // Mutación desbloqueada
  const syncRes3 = await app.fetch(new Request('http://localhost:3000/api/studio/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: activeCookie, Origin: 'http://localhost:3000' },
    body: JSON.stringify({
      orders: [
        {
          id: 'OT-MASTER-03',
          client: 'Cervecería Master',
          brand: 'Pilsen Pro',
          title: 'OT Desbloqueada con Bold Pro',
          status: 'Tráfico'
        }
      ]
    })
  }));
  const syncData3 = await syncRes3.json();
  console.log('✔ Mutación desbloqueada tras confirmación de pago: HTTP', syncRes3.status, syncData3.ok);
  if (syncRes3.status !== 200 || !syncData3.ok) {
    throw new Error('Mutación no se desbloqueó tras activación');
  }

  // --------------------------------------------------------------------------
  // TEST 6: Invitaciones de Equipo (Better Auth Nativo)
  // --------------------------------------------------------------------------
  console.log('\n[Paso 6] Invitación de Colaboradores de Equipo:');
  const inviteRes = await app.fetch(new Request('http://localhost:3000/api/auth/organization/invite-member', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: activeCookie, Origin: 'http://localhost:3000' },
    body: JSON.stringify({
      email: 'colaborador.nuevo@agencia.com',
      role: 'member'
    })
  }));
  const inviteData = await inviteRes.json();
  console.log('✔ Invitación de miembro enviada exitosamente: ID =', inviteData.id, 'Email =', inviteData.email);
  if (inviteRes.status !== 200 || !inviteData.id) {
    throw new Error('Falla en creación de invitación de equipo');
  }

  // Limpieza
  sqlite.prepare('DELETE FROM invitations WHERE id = ?').run(inviteData.id);
  sqlite.prepare('DELETE FROM work_orders WHERE id IN (?, ?, ?)').run('OT-MASTER-01', 'OT-MASTER-02', 'OT-MASTER-03');
  sqlite.prepare('DELETE FROM organizations WHERE slug = ?').run(orgSlug);
  sqlite.prepare('DELETE FROM users WHERE email = ?').run(testEmail);
  delete process.env.BOLD_WEBHOOK_SECRET;

  console.log('\n✔ Limpieza de datos de prueba completada.');
  console.log('================================================================');
  console.log('¡TODAS LAS PRUEBAS DEL FLUJO SAAS PLG HAN PASADO AL 100%!');
  console.log('================================================================');
}

verifyFullPlgFlow().catch((err) => {
  console.error('\n❌ ERROR EN VERIFICACIÓN PLG:', err);
  process.exit(1);
});

