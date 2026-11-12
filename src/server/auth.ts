import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
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
      organization: schema.organizations,
      member: schema.members,
      invitation: schema.invitations,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      shortName: {
        type: 'string',
        required: false,
        defaultValue: 'Andrés J.',
      },
      color: {
        type: 'string',
        required: false,
        defaultValue: 'cyan',
      },
      avatarMode: {
        type: 'string',
        required: false,
        defaultValue: 'initials',
      },
      avatarIcon: {
        type: 'string',
        required: false,
        defaultValue: 'pen',
      },
      departments: {
        type: 'string',
        required: false,
        defaultValue: '["Cuentas","Tráfico","Creativos"]',
      },
      studioId: {
        type: 'number',
        required: false,
        defaultValue: 1,
      },
      role: {
        type: 'string',
        required: false,
        defaultValue: 'director',
      },
    },
  },
  plugins: [
    organization({
      memberLimit: 6,
      sendInvitationEmail: async (data) => {
        console.log('[Better Auth] Invitación enviada:', data.email, 'id:', data.id);
      },
    }),
  ],
  trustedOrigins: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://trafico.elmarcante.com',
  ],
});
