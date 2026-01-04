import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { prisma } from './db';
import { logger } from './logger';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      image: string | null;
      tenantId: string | null;
      isSetupComplete: boolean;
    };
  }

  interface User {
    tenantId: string | null;
    isSetupComplete: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    tenantId: string | null;
    isSetupComplete: boolean;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
          hd: '*', // Allow any Google Workspace domain
        },
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!profile?.email) {
        logger.warn('Sign in attempt without email');
        return false;
      }

      // Extract domain from email for tenant matching
      const domain = profile.email.split('@')[1];

      try {
        // Check if user exists
        let dbUser = await prisma.adminUser.findUnique({
          where: { email: profile.email },
          include: { tenant: true },
        });

        if (!dbUser) {
          // Create new user - tenant will be created in setup wizard
          dbUser = await prisma.adminUser.create({
            data: {
              email: profile.email,
              name: profile.name || null,
              googleId: account?.providerAccountId || null,
              avatarUrl: (profile as { picture?: string }).picture || null,
            },
            include: { tenant: true },
          });
          logger.info({ userId: dbUser.id, email: dbUser.email }, 'New admin user created');
        } else {
          // Update existing user info
          await prisma.adminUser.update({
            where: { id: dbUser.id },
            data: {
              name: profile.name || dbUser.name,
              googleId: account?.providerAccountId || dbUser.googleId,
              avatarUrl: (profile as { picture?: string }).picture || dbUser.avatarUrl,
              lastLoginAt: new Date(),
            },
          });
          logger.info({ userId: dbUser.id }, 'Admin user logged in');
        }

        return true;
      } catch (error) {
        logger.error({ error, email: profile.email }, 'Error during sign in');
        return false;
      }
    },
    async jwt({ token, user, account, profile, trigger }) {
      if (user && profile?.email) {
        // Initial sign in
        const dbUser = await prisma.adminUser.findUnique({
          where: { email: profile.email },
          include: { tenant: true },
        });

        if (dbUser) {
          token.userId = dbUser.id;
          token.tenantId = dbUser.tenantId;
          token.isSetupComplete = dbUser.tenant?.setupComplete ?? false;
        }
      }

      // Refresh tenant info on session update
      if (trigger === 'update' && token.userId) {
        const dbUser = await prisma.adminUser.findUnique({
          where: { id: token.userId },
          include: { tenant: true },
        });

        if (dbUser) {
          token.tenantId = dbUser.tenantId;
          token.isSetupComplete = dbUser.tenant?.setupComplete ?? false;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId;
        session.user.tenantId = token.tenantId;
        session.user.isSetupComplete = token.isSetupComplete;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
};
