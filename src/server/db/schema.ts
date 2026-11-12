import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const studios = sqliteTable('studios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  ownerEmail: text('owner_email').notNull(),
  planStatus: text('plan_status').notNull().default('active'),
  departmentsJson: text('departments_json').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
});

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  metadata: text('metadata'),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  studioId: integer('studio_id').notNull().default(1).references(() => studios.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('director'),
  shortName: text('short_name').notNull().default('Andrés J.'),
  color: text('color').notNull().default('cyan'),
  avatarMode: text('avatar_mode').notNull().default('initials'),
  avatarIcon: text('avatar_icon').notNull().default('pen'),
  departments: text('departments').notNull().default('["Cuentas","Tráfico","Creativos"]'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  activeOrganizationId: text('active_organization_id'),
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const invitations = sqliteTable('invitations', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role'),
  status: text('status').notNull().default('pending'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  inviterId: text('inviter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
});

export const clients = sqliteTable('clients', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  studioId: integer('studio_id').notNull().default(1).references(() => studios.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('emerald'),
  brandsJson: text('brands_json').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
});

export const statuses = sqliteTable('statuses', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  studioId: integer('studio_id').notNull().default(1).references(() => studios.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('amber'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const workOrders = sqliteTable('work_orders', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  studioId: integer('studio_id').notNull().default(1).references(() => studios.id, { onDelete: 'cascade' }),
  ref: text('ref').notNull().default(''),
  discipline: text('discipline').notNull().default('advertising'),
  client: text('client').notNull(),
  brand: text('brand').notNull(),
  product: text('product').notNull().default(''),
  title: text('title').notNull(),
  media: text('media').notNull().default(''),
  status: text('status').notNull().default('En Redacción'),
  responsible: text('responsible').notNull().default('Andrés J.'),
  urgent: integer('urgent', { mode: 'boolean' }).notNull().default(false),
  brief: text('brief').notNull().default(''),
  legalText: text('legal_text').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const routeEntries = sqliteTable('route_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: text('organization_id'),
  studioId: integer('studio_id').notNull().default(1),
  otId: text('ot_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  lineNumber: integer('line_number').notNull().default(1),
  fromDept: text('from_dept').notNull().default('Cuentas'),
  toDept: text('to_dept').notNull().default('Creativos'),
  task: text('task').notNull().default(''),
  entryDate: text('entry_date').notNull(),
  deliveryDate: text('delivery_date').notNull().default(''),
  sign: text('sign').default('Andrés J.'),
  notes: text('notes').default(''),
  stamp: text('stamp'),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const mediaFiles = sqliteTable('media_files', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  studioId: integer('studio_id').notNull().default(1),
  otId: text('ot_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  routeEntryId: integer('route_entry_id'),
  name: text('name').notNull(),
  type: text('type').notNull().default('document'),
  ext: text('ext').notNull().default(''),
  size: text('size').notNull().default(''),
  date: text('date').notNull(),
  url: text('url').notNull(),
  previewUrl: text('preview_url'),
  previewKind: text('preview_kind'),
  content: text('content'),
});

export const stripboardStrips = sqliteTable('stripboard_strips', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  studioId: integer('studio_id').notNull().default(1),
  dateStr: text('date_str').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  type: text('type').notNull().default('ot'),
  otId: text('ot_id'),
  title: text('title'),
  client: text('client'),
  brand: text('brand'),
  product: text('product'),
  timeSlot: text('time_slot'),
  task: text('task'),
  assignee: text('assignee'),
  shiftStatus: text('shift_status').notNull().default('Por Iniciar'),
});

export const sharedReviews = sqliteTable('shared_reviews', {
  token: text('token').primaryKey(),
  organizationId: text('organization_id'),
  studioId: integer('studio_id').notNull().default(1),
  otId: text('ot_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  routeEntryIdsJson: text('route_entry_ids_json').notNull().default('[]'),
  allowFullOt: integer('allow_full_ot', { mode: 'boolean' }).notNull().default(true),
  reviewerLabel: text('reviewer_label').default('Cliente'),
  expiresAt: text('expires_at'),
  revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});
