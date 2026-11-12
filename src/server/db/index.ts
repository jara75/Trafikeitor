import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const dbPath = process.env.TRAFICO_DB_PATH || './trafico.db';
export const sqlite = new Database(dbPath);

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export function initDatabaseAndSeed() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS studios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      plan_status TEXT NOT NULL DEFAULT 'active',
      departments_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      logo TEXT,
      created_at INTEGER NOT NULL,
      metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      studio_id INTEGER NOT NULL DEFAULT 1 REFERENCES studios(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'director',
      short_name TEXT DEFAULT 'Andrés J.',
      color TEXT DEFAULT 'cyan',
      avatar_mode TEXT DEFAULT 'initials',
      avatar_icon TEXT DEFAULT 'pen',
      departments TEXT DEFAULT '["Cuentas","Tráfico","Creativos"]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      active_organization_id TEXT
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      password TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS verifications (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      role TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      studio_id INTEGER NOT NULL DEFAULT 1 REFERENCES studios(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'emerald',
      brands_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS statuses (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      studio_id INTEGER NOT NULL DEFAULT 1 REFERENCES studios(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'amber',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS work_orders (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      studio_id INTEGER NOT NULL DEFAULT 1 REFERENCES studios(id) ON DELETE CASCADE,
      ref TEXT NOT NULL DEFAULT '',
      discipline TEXT NOT NULL DEFAULT 'advertising',
      client TEXT NOT NULL,
      brand TEXT NOT NULL,
      product TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      media TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'En Redacción',
      responsible TEXT NOT NULL DEFAULT 'Andrés J.',
      urgent INTEGER NOT NULL DEFAULT 0,
      brief TEXT NOT NULL DEFAULT '',
      legal_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS route_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT,
      studio_id INTEGER NOT NULL DEFAULT 1,
      ot_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      line_number INTEGER NOT NULL DEFAULT 1,
      from_dept TEXT NOT NULL DEFAULT 'Cuentas',
      to_dept TEXT NOT NULL DEFAULT 'Creativos',
      task TEXT NOT NULL DEFAULT '',
      entry_date TEXT NOT NULL,
      delivery_date TEXT NOT NULL DEFAULT '',
      sign TEXT DEFAULT 'Andrés J.',
      notes TEXT DEFAULT '',
      stamp TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS media_files (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      studio_id INTEGER NOT NULL DEFAULT 1,
      ot_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      route_entry_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'document',
      ext TEXT NOT NULL DEFAULT '',
      size TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      url TEXT NOT NULL,
      preview_url TEXT,
      preview_kind TEXT,
      content TEXT
    );
    CREATE TABLE IF NOT EXISTS stripboard_strips (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      studio_id INTEGER NOT NULL DEFAULT 1,
      date_str TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'ot',
      ot_id TEXT,
      title TEXT,
      client TEXT,
      brand TEXT,
      product TEXT,
      time_slot TEXT,
      task TEXT,
      assignee TEXT,
      shift_status TEXT NOT NULL DEFAULT 'Por Iniciar'
    );
    CREATE TABLE IF NOT EXISTS shared_reviews (
      token TEXT PRIMARY KEY,
      organization_id TEXT,
      studio_id INTEGER NOT NULL DEFAULT 1,
      ot_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      route_entry_ids_json TEXT NOT NULL DEFAULT '[]',
      allow_full_ot INTEGER NOT NULL DEFAULT 1,
      reviewer_label TEXT DEFAULT 'Cliente',
      expires_at TEXT,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  const safeAlter = (sql: string) => {
    try {
      sqlite.exec(sql);
    } catch (_) {}
  };

  safeAlter("ALTER TABLE clients ADD COLUMN color TEXT DEFAULT 'emerald'");
  safeAlter("ALTER TABLE sessions ADD COLUMN active_organization_id TEXT");
  safeAlter("ALTER TABLE users ADD COLUMN short_name TEXT DEFAULT 'Andrés J.'");
  safeAlter("ALTER TABLE users ADD COLUMN color TEXT DEFAULT 'cyan'");
  safeAlter("ALTER TABLE users ADD COLUMN avatar_mode TEXT DEFAULT 'initials'");
  safeAlter("ALTER TABLE users ADD COLUMN avatar_icon TEXT DEFAULT 'pen'");
  safeAlter("ALTER TABLE users ADD COLUMN departments TEXT DEFAULT '[\"Cuentas\",\"Tráfico\",\"Creativos\"]'");
  safeAlter("ALTER TABLE clients ADD COLUMN organization_id TEXT");
  safeAlter("ALTER TABLE statuses ADD COLUMN organization_id TEXT");
  safeAlter("ALTER TABLE work_orders ADD COLUMN organization_id TEXT");
  safeAlter("ALTER TABLE work_orders ADD COLUMN responsible TEXT DEFAULT 'Andrés J.'");
  safeAlter("ALTER TABLE route_entries ADD COLUMN organization_id TEXT");
  safeAlter("ALTER TABLE route_entries ADD COLUMN sign TEXT DEFAULT 'Andrés J.'");
  safeAlter("ALTER TABLE route_entries ADD COLUMN notes TEXT DEFAULT ''");
  safeAlter("ALTER TABLE media_files ADD COLUMN organization_id TEXT");
  safeAlter("ALTER TABLE stripboard_strips ADD COLUMN organization_id TEXT");
  safeAlter("ALTER TABLE shared_reviews ADD COLUMN organization_id TEXT");

  const studioCount = sqlite.prepare('SELECT COUNT(*) as c FROM studios').get() as { c: number };
  if (studioCount.c === 0) {
    const now = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO studios (id, slug, name, owner_email, plan_status, departments_json, created_at)
      VALUES (1, 'elmarcante', 'EL MARCANTE // CONTROL DE TRÁFICO', 'contacto@marcanter.com', 'active', '[]', ?)
    `).run(now);
  }
}
