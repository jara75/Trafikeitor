import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';
import * as schema from './db/schema';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET || 'el_marcante_super_secret_key_2026_traffic_control_998877',
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      studioId: {
        type: 'number',
        required: true,
        defaultValue: 1,
      },
      role: {
        type: 'string',
        required: true,
        defaultValue: 'director',
      },
    },
  },
  trustedOrigins: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://trafico.elmarcante.com',
  ],
});
