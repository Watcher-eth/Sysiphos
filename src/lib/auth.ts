// src/lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

function displayNameForWorkspace(user: { name?: string | null; email?: string | null }) {
  const base =
    (user.name && user.name.trim()) ||
    (user.email ? user.email.split("@")[0] : "") ||
    "Workspace";
  return `${base}'s Workspace`;
}

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),

  session: { strategy: "database" },

  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    EmailProvider({
      server: process.env.EMAIL_SERVER!, // keep for now; you can swap to Resend later
      from: process.env.EMAIL_FROM!,
    }),
  ],

  callbacks: {
    async session({ session, user }) {
      if (session.user) (session.user as any).id = user.id;
      return session;
    },
  },

  events: {
    async createUser({ user }) {
      // 1) If they already have a workspace membership, do nothing.
      const existing = await db
        .select({ workspaceId: schema.workspaceMembers.workspaceId })
        .from(schema.workspaceMembers)
        .where(eq(schema.workspaceMembers.userId, user.id as any))
        .limit(1);

      if (existing[0]) return;

      // 2) Create a workspace + owner membership atomically.
      await db.transaction(async (tx) => {
        const wsName = displayNameForWorkspace({
          name: user.name,
          email: user.email,
        });

        const created = await tx
          .insert(schema.workspaces)
          .values({
            name: wsName,
            createdByUserId: user.id as any,
          })
          .returning({ id: schema.workspaces.id });

        const workspaceId = created[0]!.id;

        await tx.insert(schema.workspaceMembers).values({
          workspaceId,
          userId: user.id as any,
          role: "owner",
        });
      });
    },
  },
};