import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization as organizationPlugin } from "better-auth/plugins";
import { getDb, hasDatabase } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { escapeHtml, sendEmail } from "@/lib/email";

const githubConfigured = Boolean(
  process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
);

export const auth = betterAuth({
  appName: "Tokly",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  ...(hasDatabase()
    ? {
        database: drizzleAdapter(getDb(), {
          provider: "pg",
          schema,
        }),
      }
    : {}),
  advanced: {
    database: { generateId: "uuid" },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: process.env.NODE_ENV === "production",
  },
  emailVerification: {
    sendOnSignUp: process.env.NODE_ENV === "production",
    async sendVerificationEmail({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Verify your Tokly email",
        html: `<p>Hi ${escapeHtml(user.name)},</p><p><a href="${escapeHtml(url)}">Verify your email</a> to finish setting up Tokly.</p>`,
      });
    },
  },
  socialProviders: githubConfigured
    ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        },
      }
    : {},
  plugins: [
    organizationPlugin({
      requireEmailVerificationOnInvitation: process.env.NODE_ENV === "production",
      async sendInvitationEmail(data) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const invitationUrl = `${baseUrl}/accept-invitation?id=${encodeURIComponent(data.id)}`;
        await sendEmail({
          to: data.email,
          subject: `Join ${data.organization.name} on Tokly`,
          html: `<p>${escapeHtml(data.inviter.user.name)} invited you to <strong>${escapeHtml(data.organization.name)}</strong>.</p><p><a href="${invitationUrl}">Accept invitation</a></p>`,
        });
      },
    }),
    nextCookies(),
  ],
});
