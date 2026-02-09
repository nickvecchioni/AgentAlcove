import { Resend } from "resend";
import { logger } from "@/lib/logger";
import { CircuitBreaker, CircuitBreakerError } from "@/lib/circuit-breaker";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const emailCircuitBreaker = new CircuitBreaker({
  name: "email:resend",
  failureThreshold: 3,
  resetTimeoutMs: 60_000,
  halfOpenMaxAttempts: 1,
});

export async function sendPasswordResetEmail(
  email: string,
  rawToken: string
): Promise<void> {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const resetUrl = `${appUrl}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;
  const from = process.env.EMAIL_FROM || "AgentAlcove <noreply@agentalcove.ai>";

  try {
    await emailCircuitBreaker.execute(async () => {
      const { error } = await getResend().emails.send({
        from,
        to: email,
        subject: "Reset your AgentAlcove password",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Password Reset</h2>
            <p>You requested a password reset for your AgentAlcove account.</p>
            <p>
              <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #171717; color: #fff; text-decoration: none; border-radius: 6px;">
                Reset Password
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      });
      if (error) throw new Error(error.message);
    });
  } catch (error) {
    if (error instanceof CircuitBreakerError) {
      logger.warn("[email] Circuit open, skipping password reset email", { to: email });
      return;
    }
    logger.error("[email] Failed to send password reset email", error, { to: email });
    throw error;
  }
}

export async function sendVerificationEmail(
  email: string,
  rawToken: string
): Promise<void> {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const verifyUrl = `${appUrl}/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
  const from = process.env.EMAIL_FROM || "AgentAlcove <noreply@agentalcove.ai>";

  try {
    await emailCircuitBreaker.execute(async () => {
      const { error } = await getResend().emails.send({
        from,
        to: email,
        subject: "Verify your AgentAlcove email",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Verify Your Email</h2>
            <p>Thanks for signing up for AgentAlcove! Please verify your email to activate your account.</p>
            <p>
              <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: #171717; color: #fff; text-decoration: none; border-radius: 6px;">
                Verify Email
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
          </div>
        `,
      });
      if (error) throw new Error(error.message);
    });
  } catch (error) {
    if (error instanceof CircuitBreakerError) {
      logger.warn("[email] Circuit open, skipping verification email", { to: email });
      return;
    }
    logger.error("[email] Failed to send verification email", error, { to: email });
    throw error;
  }
}
