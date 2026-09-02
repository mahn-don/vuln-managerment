import NextAuth from "next-auth";

/**
 * AUTH_SECRET signs every session and derives the key that encrypts provider
 * credentials at rest. compose.yaml carries a placeholder for local use; a
 * production process that inherited it would issue forgeable sessions and
 * encrypt secrets under a value published in the repository.
 */
const PLACEHOLDER_SECRETS = ["local-only-change-before-production", "changeme", "secret"];

if (process.env.NODE_ENV === "production") {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret || PLACEHOLDER_SECRETS.includes(secret) || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to a unique value of at least 32 characters in production."
    );
  }
}
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { distributedRateLimit } from "@/lib/api/rate-limit";

function validateAuthSecret() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    if (!process.env.AUTH_SECRET) {
      throw new Error("AUTH_SECRET is required in production");
    }
    if (process.env.AUTH_SECRET.includes("dev-secret")) {
      throw new Error("AUTH_SECRET must be changed from the dev default in production");
    }
  }
}
validateAuthSecret();

const ROLE_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DUMMY_PASSWORD_HASH = "$2b$10$kInpLjuaF8KTF/E/WDafvuqrSymN6KyfIjYvqBmpQ8ZiK7oENk072";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = String(credentials.email).trim().toLowerCase();
        const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
        const ip = forwardedFor || request.headers.get("x-real-ip") || "unknown";
        const emailKey = createHash("sha256").update(email).digest("hex").slice(0, 24);
        const limit = await distributedRateLimit({
          key: `login:${ip}:${emailKey}`,
          limit: 10,
          windowMs: 15 * 60 * 1000,
        });
        if (!limit.allowed) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { businessUnit: true },
        });

        const isValid = await compare(
          String(credentials.password),
          user?.passwordHash || DUMMY_PASSWORD_HASH
        );
        if (!user || !user.isActive || !user.passwordHash || !isValid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          role: user.role,
          businessUnitId: user.businessUnitId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.businessUnitId = user.businessUnitId;
        token.lastRefreshed = Date.now();
        return token;
      }

      const lastRefreshed = (token.lastRefreshed as number) || 0;
      if (Date.now() - lastRefreshed > ROLE_REFRESH_INTERVAL_MS) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, isActive: true, businessUnitId: true },
        });

        // Returning null invalidates the session outright. The previous empty
        // object was not a valid token: it silently produced a signed-in user
        // with no id and no role rather than signing a deactivated account out.
        if (!dbUser || !dbUser.isActive) {
          return null;
        }

        token.role = dbUser.role;
        token.businessUnitId = dbUser.businessUnitId;
        token.lastRefreshed = Date.now();
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.businessUnitId = token.businessUnitId as string | null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
});
