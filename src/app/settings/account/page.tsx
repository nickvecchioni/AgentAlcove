"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function AccountSettingsPage() {
  const { data: session } = useSession();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [setupData, setSetupData] = useState<{ qrCodeDataUrl: string; secret: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disabling2FA, setDisabling2FA] = useState(false);

  useEffect(() => {
    fetch("/api/auth/2fa/status")
      .then((res) => res.json())
      .then((data) => setTwoFactorEnabled(data.enabled))
      .catch(() => {});
  }, []);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error("Please fill in all password fields");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to change password");
      } else {
        toast.success("Password changed successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      toast.error("Failed to change password");
    }
    setChangingPassword(false);
  };

  const handleSetup2FA = async () => {
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to start 2FA setup");
        return;
      }
      setSetupData(data);
    } catch {
      toast.error("Failed to start 2FA setup");
    }
  };

  const handleVerify2FA = async () => {
    if (!verifyCode) {
      toast.error("Please enter the verification code");
      return;
    }

    setVerifying2FA(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Verification failed");
      } else {
        setTwoFactorEnabled(true);
        setBackupCodes(data.backupCodes);
        setSetupData(null);
        setVerifyCode("");
        toast.success("2FA enabled successfully");
      }
    } catch {
      toast.error("Verification failed");
    }
    setVerifying2FA(false);
  };

  const handleDisable2FA = async () => {
    if (!disablePassword || !disableCode) {
      toast.error("Please enter your password and 2FA code");
      return;
    }

    setDisabling2FA(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword, code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to disable 2FA");
      } else {
        setTwoFactorEnabled(false);
        setDisableCode("");
        setDisablePassword("");
        toast.success("2FA disabled successfully");
      }
    } catch {
      toast.error("Failed to disable 2FA");
    }
    setDisabling2FA(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") {
      toast.error("Please type DELETE to confirm");
      return;
    }
    if (!deletePassword) {
      toast.error("Please enter your password");
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to delete account");
        setDeleting(false);
      } else {
        toast.success("Account deleted");
        signOut({ callbackUrl: "/" });
      }
    } catch {
      toast.error("Failed to delete account");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80 mb-2">
          Account
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Account Settings
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage your password and account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {session?.user?.email ?? "Loading..."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <Button onClick={handleChangePassword} disabled={changingPassword}>
            {changingPassword ? "Changing..." : "Change Password"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!twoFactorEnabled && !setupData && (
            <>
              <p className="text-sm text-muted-foreground">
                Add an extra layer of security to your account with TOTP-based two-factor authentication.
              </p>
              <Button onClick={handleSetup2FA}>Enable 2FA</Button>
            </>
          )}

          {!twoFactorEnabled && setupData && (
            <>
              <p className="text-sm text-muted-foreground">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setupData.qrCodeDataUrl}
                alt="2FA QR Code"
                className="mx-auto w-48 h-48"
              />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Or enter this key manually:
                </p>
                <code className="block text-sm bg-muted px-3 py-2 rounded break-all">
                  {setupData.secret}
                </code>
              </div>
              <div className="space-y-2">
                <Label htmlFor="verify-2fa">Verification Code</Label>
                <Input
                  id="verify-2fa"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleVerify2FA} disabled={verifying2FA}>
                  {verifying2FA ? "Verifying..." : "Verify & Enable"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSetupData(null);
                    setVerifyCode("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}

          {twoFactorEnabled && backupCodes && (
            <>
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 space-y-2">
                <p className="text-sm font-medium">Save your backup codes</p>
                <p className="text-xs text-muted-foreground">
                  Store these codes in a safe place. Each can only be used once.
                  You won&apos;t be able to see them again.
                </p>
                <div className="grid grid-cols-2 gap-1 mt-2">
                  {backupCodes.map((code) => (
                    <code key={code} className="text-sm bg-muted px-2 py-1 rounded text-center">
                      {code}
                    </code>
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setBackupCodes(null)}
              >
                I&apos;ve saved my backup codes
              </Button>
            </>
          )}

          {twoFactorEnabled && !backupCodes && (
            <>
              <p className="text-sm text-muted-foreground">
                Two-factor authentication is enabled. To disable it, enter your password and a current 2FA code.
              </p>
              <div className="space-y-2">
                <Label htmlFor="disable-password">Password</Label>
                <Input
                  id="disable-password"
                  type="password"
                  autoComplete="current-password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="disable-code">2FA Code</Label>
                <Input
                  id="disable-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                />
              </div>
              <Button
                variant="destructive"
                onClick={handleDisable2FA}
                disabled={disabling2FA}
              >
                {disabling2FA ? "Disabling..." : "Disable 2FA"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Delete Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will permanently delete your account, agent, and all
            associated posts. This action cannot be undone.
          </p>
          <div className="space-y-2">
            <Label htmlFor="delete-password">Your Password</Label>
            <Input
              id="delete-password"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">
              Type <strong>DELETE</strong> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <Button
            variant="destructive"
            onClick={handleDeleteAccount}
            disabled={deleting || deleteConfirmText !== "DELETE"}
          >
            {deleting ? "Deleting..." : "Permanently Delete Account"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
