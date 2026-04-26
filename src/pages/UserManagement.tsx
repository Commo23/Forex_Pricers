import React, { useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, UserPlus, UserRoundCog } from "lucide-react";

const ROLE_OPTIONS = [
  "Risk Manager",
  "Trader",
  "Treasury",
  "Controller",
  "Viewer",
] as const;

const UserManagement = () => {
  const { toast } = useToast();
  const { user, isLoading, updateProfile, resetPassword, signUp } = useSupabaseAuth();

  const userEmail = user?.email || "";

  const [profileName, setProfileName] = useState<string>(() => user?.name || "");
  const [profileRole, setProfileRole] = useState<string>(() => user?.role || "Risk Manager");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [pwResetEmail, setPwResetEmail] = useState<string>(() => userEmail);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<string>("Risk Manager");
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Keep fields coherent if auth user changes
  useMemo(() => {
    setProfileName(user?.name || "");
    setProfileRole(user?.role || "Risk Manager");
    setPwResetEmail(user?.email || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const canSubmitProfile = profileName.trim().length > 0 && profileRole.trim().length > 0;

  return (
    <Layout
      title="User Management"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "User Management" },
      ]}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRoundCog className="h-5 w-5" />
              My profile
            </CardTitle>
            <CardDescription>
              Update your display name and role metadata (stored in Supabase user metadata).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono">
                {userEmail || "—"}
              </Badge>
              {isLoading && <Badge variant="secondary">Loading…</Badge>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="e.g. Treasury Morocco"
              />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={profileRole} onValueChange={setProfileRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                disabled={!canSubmitProfile || isSavingProfile || isLoading}
                onClick={async () => {
                  setIsSavingProfile(true);
                  try {
                    const res = await updateProfile({ name: profileName.trim(), role: profileRole.trim() });
                    if (!res.success) {
                      toast({ title: "Update failed", description: res.error || "Could not update profile.", variant: "destructive" });
                    }
                  } finally {
                    setIsSavingProfile(false);
                  }
                }}
              >
                {isSavingProfile ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Password reset
            </CardTitle>
            <CardDescription>Send a reset email (Supabase Auth).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                value={pwResetEmail}
                onChange={(e) => setPwResetEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>
            <Button
              variant="outline"
              disabled={isSendingReset || !pwResetEmail.trim()}
              onClick={async () => {
                setIsSendingReset(true);
                try {
                  const res = await resetPassword(pwResetEmail.trim());
                  if (!res.success) {
                    toast({ title: "Reset failed", description: res.error || "Could not send reset email.", variant: "destructive" });
                  } else {
                    toast({ title: "Reset email sent", description: "Check your inbox." });
                  }
                } finally {
                  setIsSendingReset(false);
                }
              }}
            >
              {isSendingReset ? "Sending…" : "Send reset email"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Separator className="my-4" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Create a user
          </CardTitle>
          <CardDescription>
            Creates a Supabase Auth user (email/password). Use this for internal testing or controlled onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="new-email">Email</Label>
            <Input id="new-email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="new.user@company.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              placeholder="Min 6 chars"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-name">Name</Label>
            <Input id="new-name" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={newUserRole} onValueChange={setNewUserRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2 lg:col-span-4 flex items-center gap-2">
            <Button
              disabled={isCreatingUser || !newUserEmail.trim() || !newUserPassword.trim()}
              onClick={async () => {
                setIsCreatingUser(true);
                try {
                  const res = await signUp(newUserEmail.trim(), newUserPassword, {
                    name: newUserName.trim() || undefined,
                    role: newUserRole,
                  });
                  if (!res.success) {
                    toast({ title: "Create failed", description: res.error || "Could not create user.", variant: "destructive" });
                    return;
                  }
                  toast({ title: "User created", description: res.message });
                  setNewUserEmail("");
                  setNewUserPassword("");
                  setNewUserName("");
                  setNewUserRole("Risk Manager");
                } finally {
                  setIsCreatingUser(false);
                }
              }}
            >
              {isCreatingUser ? "Creating…" : "Create user"}
            </Button>
            <div className="text-xs text-muted-foreground">
              Note: email confirmation behavior depends on your Supabase project settings.
            </div>
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
};

export default UserManagement;