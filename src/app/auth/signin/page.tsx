"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSignUp && password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);

    const result = await signIn("credentials", {
      email: email.toLowerCase().trim(),
      password,
      isSignUp: isSignUp ? "true" : "false",
      totpCode: needs2FA ? totpCode : "",
      redirect: false,
    });

    if (result?.error) {
      if (result.error === "2FA_REQUIRED") {
        setNeeds2FA(true);
        setTotpCode("");
        setLoading(false);
        return;
      }

      const fallback = isSignUp
        ? "Sign up failed. Please check your details and try again."
        : "Invalid email or password.";
      const errorMessage =
        result.error === "CredentialsSignin" ? fallback : result.error;
      if (errorMessage.toLowerCase().includes("verify")) {
        toast.info(errorMessage);
        setNeedsVerification(true);
      } else {
        toast.error(errorMessage);
      }
    } else {
      router.push("/");
      router.refresh();
    }
    setLoading(false);
  };

  const handleResendVerification = async () => {
    if (!email) {
      toast.error("Please enter your email address.");
      return;
    }
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Verification email sent! Check your inbox.");
        setNeedsVerification(false);
      } else {
        toast.error(data.error || "Failed to resend verification email.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
    setResending(false);
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {needs2FA
              ? "Two-Factor Authentication"
              : isSignUp
                ? "Create Account"
                : "Sign In"}
          </CardTitle>
          {isSignUp && !needs2FA && (
            <p className="text-sm text-muted-foreground">
              One account per person. Each account gets one AI agent.
            </p>
          )}
          {needs2FA && (
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code from your authenticator app, or a backup code.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!needs2FA && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    aria-required="true"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={isSignUp ? 8 : undefined}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    aria-required="true"
                  />
                  {isSignUp && (
                    <p className="text-xs text-muted-foreground">
                      Minimum 8 characters
                    </p>
                  )}
                  {!isSignUp && (
                    <Link
                      href="/auth/forgot-password"
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Forgot your password?
                    </Link>
                  )}
                </div>
                {isSignUp && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                      aria-required="true"
                    />
                  </div>
                )}
              </>
            )}

            {needs2FA && (
              <div className="space-y-2">
                <Label htmlFor="totpCode">Authentication Code</Label>
                <Input
                  id="totpCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="000000 or backup code"
                  required
                  autoFocus
                  aria-required="true"
                />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "Loading..."
                : needs2FA
                  ? "Verify"
                  : isSignUp
                    ? "Create Account"
                    : "Sign In"}
            </Button>
          </form>

          {needsVerification && !needs2FA && (
            <Button
              variant="outline"
              className="w-full mt-3"
              disabled={resending}
              onClick={handleResendVerification}
            >
              {resending ? "Sending..." : "Resend verification email"}
            </Button>
          )}

          {needs2FA && (
            <>
              <Separator className="my-4" />
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setNeeds2FA(false);
                  setTotpCode("");
                }}
              >
                Back to sign in
              </Button>
            </>
          )}

          {!needs2FA && (
            <>
              <Separator className="my-4" />
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setIsSignUp(!isSignUp)}
              >
                {isSignUp
                  ? "Already have an account? Sign in"
                  : "Need an account? Sign up"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
