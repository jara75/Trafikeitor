import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { defaultRoles, memberAc } from 'better-auth/plugins/organization/access';
import { db, sqlite } from './db';
import * as schema from './db/schema';
import { sendTeamInvitationEmail } from './services/mailer';

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
      phone: {
        type: 'string',
        required: false,
      },
      role: {
        type: 'string',
        required: false,
        defaultValue: 'user',
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const u = user as any;
          const superAdminEmail = (process.env.SUPERADMIN_EMAIL || 'contacto@marcanter.com').toLowerCase().trim();
          const email = typeof u.email === 'string' ? u.email.toLowerCase().trim() : '';
          const assignedRole = email && email === superAdminEmail ? 'super_admin' : (u.role || 'user');

          const rawShort = typeof u.shortName === 'string' ? u.shortName.trim() : '';
          const cleanName = typeof u.name === 'string' ? u.name.trim() : '';
          const isResidual = rawShort === 'Andrés J.' && !cleanName.toLowerCase().includes('andrés');
          let shortName = u.shortName;
          if (!rawShort || isResidual) {
            const parts = cleanName.split(/\s+/).filter(Boolean);
            shortName = parts.length > 1 ? `${parts[0]} ${parts[1][0].toUpperCase()}.` : (parts[0] || 'Usuario');
          }

          return {
            data: {
              ...user,
              role: assignedRole,
              shortName,
            },
          };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const s = session as any;
          if (s.activeOrganizationId) {
            return { data: session };
          }
          const memberRow = sqlite
            .prepare(
              "SELECT organization_id FROM members WHERE user_id = ? AND status != 'deactivated' ORDER BY created_at ASC LIMIT 1"
            )
            .get(s.userId) as { organization_id: string } | undefined;

          if (memberRow?.organization_id) {
            return {
              data: {
                ...session,
                activeOrganizationId: memberRow.organization_id,
              },
            };
          }
          return { data: session };
        },
      },
    },
  },
  plugins: [
    organization({
      roles: {
        ...defaultRoles,
        client: memberAc,
      },
      membershipLimit: async (user, org) => {
        const email = typeof user?.email === 'string' ? user.email.toLowerCase().trim() : '';
        if (email) {
          const clientInvite = sqlite
            .prepare(
              "SELECT 1 as ok FROM invitations WHERE organization_id = ? AND lower(email) = ? AND role = 'client' AND status = 'pending' LIMIT 1"
            )
            .get(org.id, email) as { ok: number } | undefined;
          if (clientInvite) {
            return 1_000_000;
          }
        }
        const row = sqlite
          .prepare(
            "SELECT COUNT(*) as c FROM members WHERE organization_id = ? AND (status = 'deactivated' OR role = 'client')"
          )
          .get(org.id) as { c: number } | undefined;
        const nonQuotaCount = row?.c || 0;
        return 6 + nonQuotaCount;
      },
      organizationHooks: {
        beforeAddMember: async ({ member, organization: org }) => {
          if (member.role !== 'client') {
            const row = sqlite
              .prepare(
                "SELECT COUNT(*) as c FROM members WHERE organization_id = ? AND status != 'deactivated' AND role IN ('owner', 'member')"
              )
              .get(org.id) as { c: number } | undefined;
            if ((row?.c || 0) >= 6) {
              throw new APIError('FORBIDDEN', {
                message: 'Límite de 6 integrantes activos (owner + 5 colaboradores) alcanzado.',
              });
            }
          }
        },
        afterAcceptInvitation: async ({ invitation, member }) => {
          const invRow = sqlite
            .prepare('SELECT role, allowed_client_id FROM invitations WHERE id = ?')
            .get(invitation.id) as { role: string | null; allowed_client_id: string | null } | undefined;
          const resolvedRole = invRow?.role || (invitation as any).role || member.role || 'member';
          const resolvedAllowedClientId =
            invRow?.allowed_client_id || (invitation as any).allowedClientId || '*';

          sqlite
            .prepare('UPDATE members SET role = ?, allowed_client_id = ? WHERE id = ?')
            .run(resolvedRole, resolvedAllowedClientId, member.id);
        },
      },
      schema: {
        member: {
          additionalFields: {
            status: {
              type: 'string',
              required: false,
              defaultValue: 'active',
            },
            roleTitle: {
              type: 'string',
              required: false,
              defaultValue: 'Creativo',
            },
            allowedClientId: {
              type: 'string',
              required: false,
              defaultValue: '*',
            },
          },
        },
        invitation: {
          additionalFields: {
            allowedClientId: {
              type: 'string',
              required: false,
              defaultValue: '*',
            },
          },
        },
      },
      sendInvitationEmail: async (data) => {
        await sendTeamInvitationEmail({
          id: data.id,
          email: data.email,
          inviterName: (data as any).inviter?.user?.name || (data as any).inviter?.user?.email,
          organizationName: (data as any).organization?.name,
        });
      },
    }),
  ],
  trustedOrigins: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://trafico.elmarcante.com',
  ],
});
