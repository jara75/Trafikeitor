import Database from 'better-sqlite3';
import assert from 'node:assert';

console.log('=== VERIFICACIÓN DE IDENTIDAD Y LIMPIEZA DE "ANDRÉS J." ===\n');

// 1. Verificación en SQLite
const db = new Database('./trafico.db');

const carolina = db.prepare("SELECT id, name, email, short_name, role FROM users WHERE email = 'jara.grupo3b@gmail.com'").get() as any;
console.log('1. Usuario Carolina en DB:', carolina);
assert.ok(carolina, 'El usuario Carolina Cardenas debe existir en la base de datos');
assert.strictEqual(carolina.name, 'Carolina Cardenas');
assert.strictEqual(carolina.short_name, 'Carolina C.', 'El short_name de Carolina NO puede ser "Andrés J.", debe ser "Carolina C."');
console.log('   ✓ Carolina tiene short_name = "Carolina C." en trafico.db');

// 2. Verificación de que no queden usuarios no-Andrés con "Andrés J."
const residualUsers = db.prepare("SELECT id, name, email, short_name FROM users WHERE short_name = 'Andrés J.' AND LOWER(name) NOT LIKE '%andrés%'").all() as any[];
console.log('\n2. Verificando usuarios no-Andrés con short_name residual:', residualUsers.length);
assert.strictEqual(residualUsers.length, 0, 'No debe quedar ningún usuario con short_name "Andrés J." cuyo nombre no sea Andrés');
console.log('   ✓ Cero usuarios con short_name residual en SQLite');

// 3. Test de lógica de derivación
function deriveShortName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
}

function resolveValidShortName(name: string, shortName: string): string {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanShort = typeof shortName === 'string' ? shortName.trim() : '';
  const isResidual = cleanShort === 'Andrés J.' && cleanName && !cleanName.toLowerCase().includes('andrés');
  if (!cleanShort || isResidual) {
    return deriveShortName(cleanName) || cleanName || 'Usuario';
  }
  return cleanShort;
}

console.log('\n3. Verificación de deriveShortName & resolveValidShortName:');
assert.strictEqual(deriveShortName('Carolina Cardenas'), 'Carolina C.');
assert.strictEqual(deriveShortName('Carolina'), 'Carolina');
assert.strictEqual(deriveShortName('Andrés Jaramillo'), 'Andrés J.');
assert.strictEqual(deriveShortName('María Creativa'), 'María C.');
console.log('   ✓ deriveShortName deriva correctamente para todos los casos');

assert.strictEqual(resolveValidShortName('Carolina Cardenas', 'Andrés J.'), 'Carolina C.', 'Residual Andrés J. debe purgarse');
assert.strictEqual(resolveValidShortName('Carolina Cardenas', 'Caro C.'), 'Caro C.', 'Custom shortName legítimo se respeta');
assert.strictEqual(resolveValidShortName('Andrés Jaramillo', 'Andrés J.'), 'Andrés J.', 'Andrés legítimo se conserva');
console.log('   ✓ resolveValidShortName purga residuales y preserva legítimos');

// 4. Verificación del Trigger SQLite trg_user_short_name
console.log('\n4. Verificación del trigger SQLite trg_user_short_name:');
const testUserId = 'test-user-' + Date.now();
db.prepare(`
  INSERT INTO users (id, name, email, email_verified, role, short_name, created_at, updated_at)
  VALUES (?, ?, ?, 0, 'director', 'Andrés J.', ?, ?)
`).run(testUserId, 'Daniela Ospina', `daniela_${Date.now()}@estudio.com`, Date.now(), Date.now());

const inserted = db.prepare("SELECT id, name, short_name FROM users WHERE id = ?").get(testUserId) as any;
console.log('   Usuario insertado con short_name="Andrés J.":', inserted);
assert.strictEqual(inserted.short_name, 'Daniela O.', 'El trigger SQLite debe corregir automáticamente el short_name a "Daniela O."');
console.log('   ✓ Trigger SQLite auto-corrigió short_name a "Daniela O."');

// Limpieza del usuario de prueba
db.prepare("DELETE FROM users WHERE id = ?").run(testUserId);

console.log('\n=== TODAS LAS VERIFICACIONES DE IDENTIDAD PASARON CON ÉXITO (100%) ===\n');

