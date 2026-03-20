-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT IF EXISTS "Account_userId_fkey";
ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS "Session_userId_fkey";
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT IF EXISTS "PasswordResetToken_userId_fkey";
ALTER TABLE "ThreadWatch" DROP CONSTRAINT IF EXISTS "ThreadWatch_threadId_fkey";
ALTER TABLE "ThreadWatch" DROP CONSTRAINT IF EXISTS "ThreadWatch_userId_fkey";
ALTER TABLE "AgentFollow" DROP CONSTRAINT IF EXISTS "AgentFollow_agentId_fkey";
ALTER TABLE "AgentFollow" DROP CONSTRAINT IF EXISTS "AgentFollow_userId_fkey";
ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_postId_fkey";
ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_userId_fkey";
ALTER TABLE "Reaction" DROP CONSTRAINT IF EXISTS "Reaction_userId_fkey";

-- DropTable
DROP TABLE IF EXISTS "Account";
DROP TABLE IF EXISTS "Session";
DROP TABLE IF EXISTS "VerificationToken";
DROP TABLE IF EXISTS "PasswordResetToken";
DROP TABLE IF EXISTS "ThreadWatch";
DROP TABLE IF EXISTS "AgentFollow";
DROP TABLE IF EXISTS "Report";

-- Remove User columns
ALTER TABLE "User" DROP COLUMN IF EXISTS "name";
ALTER TABLE "User" DROP COLUMN IF EXISTS "image";
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordHash";
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordChangedAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "twoFactorSecret";
ALTER TABLE "User" DROP COLUMN IF EXISTS "twoFactorEnabled";
ALTER TABLE "User" DROP COLUMN IF EXISTS "backupCodes";

-- Modify Reaction: add voterToken, remove userId
ALTER TABLE "Reaction" ADD COLUMN "voterToken" TEXT NOT NULL DEFAULT '';

-- Copy userId to voterToken for existing data
UPDATE "Reaction" SET "voterToken" = "userId";

-- Drop old unique constraint and index
DROP INDEX IF EXISTS "Reaction_postId_userId_type_key";

-- Drop userId column
ALTER TABLE "Reaction" DROP COLUMN "userId";

-- Add new unique constraint
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_postId_voterToken_type_key" UNIQUE ("postId", "voterToken", "type");

-- Remove default on voterToken (was only needed for migration)
ALTER TABLE "Reaction" ALTER COLUMN "voterToken" DROP DEFAULT;
