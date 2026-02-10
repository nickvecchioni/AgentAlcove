import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "./db";
import { checkRateLimit } from "./rate-limiter";
import { checkSignupRateLimit, getSignupLimitPerIp } from "./signup-rate-limiter";
import { sendVerificationEmail } from "./email";
import { logger } from "./logger";
import { isPasswordBreached } from "./password-check";
import { verifyTOTP, verifyBackupCode } from "./totp";
import type { Adapter } from "next-auth/adapters";

/**
 * Extract client IP from NextAuth's raw request object.
 * Takes the rightmost X-Forwarded-For IP (proxy-appended) to prevent spoofing.
 */
function getRequestIp(req: unknown): string {
  if (!req || typeof req !== "object") return "unknown";

  const maybeReq = req as {
    headers?: Record<string, string | string[] | undefined>;
  };
  const headers = maybeReq.headers || {};

  const forwarded =
    headers["x-forwarded-for"] || headers["X-Forwarded-For"];
  const realIp = headers["x-real-ip"] || headers["X-Real-IP"];

  const forwardedValue = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded;
  if (forwardedValue) {
    const ips = forwardedValue.split(",").map((s) => s.trim()).filter(Boolean);
    return ips[ips.length - 1] || "unknown";
  }

  const realValue = Array.isArray(realIp) ? realIp[0] : realIp;
  return realValue?.trim() || "unknown";
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        isSignUp: { label: "Sign Up", type: "text" },
        totpCode: { label: "2FA Code", type: "text" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase().trim();

        if (credentials.isSignUp === "true") {
          // Password strength: minimum 8 chars
          if (credentials.password.length < 8) {
            throw new Error("Password must be at least 8 characters");
          }

          // Check against known breached passwords
          if (await isPasswordBreached(credentials.password)) {
            throw new Error(
              "This password has appeared in a data breach. Please choose a different password."
            );
          }

          const existing = await prisma.user.findUnique({
            where: { email },
            select: { id: true, deletedAt: true },
          });
          if (existing) throw new Error("Email already registered");

          // Rate limit only after all validations pass — right before creating the account
          const ip = getRequestIp(req);
          const signupRate = await checkSignupRateLimit(ip);
          if (!signupRate.allowed) {
            throw new Error(
              `Too many signups from this network. Limit is ${getSignupLimitPerIp()} per day.`
            );
          }

          const hash = await bcrypt.hash(credentials.password, 12);
          await prisma.user.create({
            data: {
              email,
              name: null,
              passwordHash: hash,
            },
          });

          // Generate verification token
          const rawToken = crypto.randomBytes(48).toString("hex");
          const hashedToken = crypto
            .createHash("sha256")
            .update(rawToken)
            .digest("hex");

          await prisma.verificationToken.create({
            data: {
              identifier: email,
              token: hashedToken,
              expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            },
          });

          try {
            await sendVerificationEmail(email, rawToken);
          } catch (emailErr) {
            logger.error("[auth] Failed to send verification email", emailErr, { email });
            throw new Error(
              "Account created but we couldn't send the verification email. Please try signing in and request a new verification link."
            );
          }

          throw new Error(
            "Account created! Please check your email to verify your account before signing in."
          );
        }

        // Login rate limiting: 10 attempts per 15 minutes per IP, 5 per email
        const ip = getRequestIp(req);
        const ipLimit = await checkRateLimit(`login:ip:${ip}`, 10, 15 * 60 * 1000);
        if (!ipLimit.allowed) {
          throw new Error("Too many login attempts. Please try again later.");
        }
        const emailLimit = await checkRateLimit(`login:email:${email}`, 5, 15 * 60 * 1000);
        if (!emailLimit.allowed) {
          throw new Error("Too many login attempts for this account. Please try again later.");
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            emailVerified: true,
            deletedAt: true,
            twoFactorEnabled: true,
            twoFactorSecret: true,
            backupCodes: true,
          },
        });
        if (!user?.passwordHash) return null;

        if (user.deletedAt) {
          throw new Error("This account has been deleted.");
        }

        const valid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );
        if (!valid) return null;

        if (!user.emailVerified) {
          throw new Error(
            "Please verify your email before signing in. Check your inbox for the verification link."
          );
        }

        // 2FA check
        if (user.twoFactorEnabled && user.twoFactorSecret) {
          const totpCode = credentials.totpCode?.trim();
          if (!totpCode) {
            throw new Error("2FA_REQUIRED");
          }

          const [encrypted, iv, tag] = user.twoFactorSecret.split(":");
          if (!encrypted || !iv || !tag) {
            throw new Error("Invalid 2FA configuration");
          }

          // Try TOTP verification first
          const totpValid = verifyTOTP(totpCode, encrypted, iv, tag);
          if (!totpValid) {
            // Try as backup code
            const hashedCodes: string[] = user.backupCodes
              ? JSON.parse(user.backupCodes)
              : [];
            const backup = verifyBackupCode(totpCode, hashedCodes);
            if (!backup.valid) {
              throw new Error("Invalid 2FA code");
            }
            // Remove used backup code
            await prisma.user.update({
              where: { id: user.id },
              data: { backupCodes: JSON.stringify(backup.remaining) },
            });
          }
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
          }),
        ]
      : []),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }

      // Check if password was changed after this token was issued, or user was soft-deleted
      if (token.id && token.iat) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { passwordChangedAt: true, isAdmin: true, deletedAt: true },
        });
        if (dbUser?.deletedAt) {
          return { ...token, id: undefined };
        }
        if (
          dbUser?.passwordChangedAt &&
          Math.floor(dbUser.passwordChangedAt.getTime() / 1000) > (token.iat as number)
        ) {
          // Password was changed after token issuance — invalidate
          return { ...token, id: undefined };
        }
        token.isAdmin = dbUser?.isAdmin ?? false;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        (session.user as { id: string; isAdmin?: boolean }).id = token.id as string;
        (session.user as { isAdmin?: boolean }).isAdmin = token.isAdmin ?? false;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
};
