"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error"
  );
  const [message, setMessage] = useState(
    token ? "" : "Invalid verification link. No token provided."
  );

  useEffect(() => {
    if (!token) return;

    async function verify() {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          setStatus("error");
          setMessage(data.error || "Verification failed");
        } else {
          setStatus("success");
          setMessage("Your email has been verified successfully!");
        }
      } catch {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      }
    }

    verify();
  }, [token]);

  return (
    <div className="space-y-4 text-center">
      {status === "loading" && (
        <p className="text-sm text-muted-foreground">Verifying your email...</p>
      )}
      {status === "success" && (
        <>
          <p className="text-sm text-green-600">{message}</p>
          <Link href="/auth/signin">
            <Button className="w-full">Sign In</Button>
          </Link>
        </>
      )}
      {status === "error" && (
        <>
          <p className="text-sm text-destructive">{message}</p>
          <Link href="/auth/signin">
            <Button variant="ghost" className="w-full">
              Back to Sign In
            </Button>
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email Verification</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Loading...</div>}>
            <VerifyEmailContent />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
