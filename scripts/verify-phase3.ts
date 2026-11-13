import fs from 'fs';
import path from 'path';
import { auth } from '../src/server/auth';
import { app } from '../src/server';
import { sqlite } from '../src/server/db';

async function testPhase3() {
  console.log('=== VERIFICANDO FASE 3: HEADER BADGE Y MODAL PAYWALL BOLD ===');

  // 1. Verificar markup de index.html
  const indexPath = path.resolve(process.cwd(), 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf-8');

  console.log('✔ 1. Verificando componentes en index.html:');
  if (!indexHtml.includes('id="header-trial-badge"')) {
    throw new Error('Falta el elemento #header-trial-badge en index.html');
  }
  console.log('   - #header-trial-badge presente.');

  if (!indexHtml.includes('id="subscription-paywall-modal"')) {
    throw new Error('Falta el elemento #subscription-paywall-modal en index.html');
  }
  console.log('   - #subscription-paywall-modal presente.');

  if (!indexHtml.includes('id="paywall-bold-checkout-btn"')) {
    throw new Error('Falta el botón #paywall-bold-checkout-btn en index.html');
  }
  console.log('   - #paywall-bold-checkout-btn presente.');

  if (!indexHtml.includes('id="paywall-export-backup-btn"')) {
    throw new Error('Falta el botón #paywall-export-backup-btn en index.html');
  }
  console.log('   - #paywall-export-backup-btn presente.');

  // 2. Verificar API bootstrap con métricas de prueba y suscripción
  const testEmail = 'fase3.director@bold-test.com';
  const orgSlug = 'estudio-bold-' + Date.now();
  const orgName = 'Agencia Bold Creativa';

  sqlite.prepare('DELETE FROM users WHERE email = ?').run(testEmail);
  sqlite.prepare('DELETE FROM organizations WHERE slug = ?').run(orgSlug);

  // Registro y sesión
  await auth.api.signUpEmail({
    body: {
      email: testEmail,
      password: 'Password1234!',
      name: 'Director Bold Fase3'
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

  // Crear organización
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

  // Activar org
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
  const activeCookie = setActiveRes.headers.get('set-cookie') || cookie;

  // Bootstrap
  const bootReq = new Request('http://localhost:3000/api/studio/bootstrap', {
    method: 'GET',
    headers: {
      Cookie: activeCookie,
      Origin: 'http://localhost:3000'
    }
  });
  const bootRes = await app.fetch(bootReq);
  const bootData = await bootRes.json();

  console.log('✔ 2. Verificando contrato de datos de bootstrap:');
  console.log('   - Organización:', bootData.organization?.name);
  console.log('   - Subscription Status:', bootData.organization?.subscriptionStatus);
  console.log('   - Trial Days Left:', bootData.organization?.trialDaysLeft);
  console.log('   - Trial Ends At:', bootData.organization?.trialEndsAt);

  if (bootData.organization?.subscriptionStatus !== 'trialing') {
    throw new Error(`Se esperaba subscriptionStatus === 'trialing', se obtuvo ${bootData.organization?.subscriptionStatus}`);
  }
  if (bootData.organization?.trialDaysLeft !== 14) {
    throw new Error(`Se esperaba trialDaysLeft === 14, se obtuvo ${bootData.organization?.trialDaysLeft}`);
  }

  // 3. Verificar simulación de URL de Bold Checkout con reference del estudio
  const boldBaseUrl = 'https://checkout.bold.co/payment/LNK_TRAFIKEITOR_PRO';
  const expectedCheckoutUrl = `${boldBaseUrl}?reference=${encodeURIComponent(createdOrg.id)}`;
  console.log('✔ 3. URL de Checkout Bold generada correctamente:');
  console.log('   -', expectedCheckoutUrl);

  if (!expectedCheckoutUrl.includes(createdOrg.id)) {
    throw new Error('La URL de checkout no contiene el ID de la organización como reference');
  }

  // Limpieza
  sqlite.prepare('DELETE FROM organizations WHERE slug = ?').run(orgSlug);
  sqlite.prepare('DELETE FROM users WHERE email = ?').run(testEmail);
  console.log('✔ 4. Limpieza de datos de prueba.');
  console.log('=== FASE 3 VERIFICADA EXITOSAMENTE ===');
}

testPhase3().catch((err) => {
  console.error('Error en test de Fase 3:', err);
  process.exit(1);
});

