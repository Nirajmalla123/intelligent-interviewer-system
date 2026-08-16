import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BrainCircuit, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Signal Room AI Interviews" },
      {
        name: "description",
        content:
          "Sign in to run AI-assessed video interviews with vision, voice and language analysis.",
      },
      { property: "og:title", content: "Sign in — Signal Room AI Interviews" },
      {
        property: "og:description",
        content: "Access your AI video interview assessments and scored reports.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: "/dashboard", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      setSent(true);
      toast.success("Check your email to confirm your account");
  }

  async function signInWithGoogle() {
    setBusy(true);
    try {
      await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 font-semibold">
          <BrainCircuit className="size-5 text-primary" />
          Signal Room
        </Link>
        <Card>
          <CardContent className="pt-6">
            {sent ? (
              <p className="text-center text-sm text-muted-foreground">
                We sent a confirmation link to <strong>{email}</strong>. Confirm it, then sign in.
              </p>
            ) : (
              <Tabs defaultValue="signin">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Create account</TabsTrigger>
                </TabsList>

                <TabsContent value="signin">
                  <form className="space-y-4" onSubmit={signIn}>
                    <Field id="email" label="Email" type="email" value={email} onChange={setEmail} />
                    <Field
                      id="password"
                      label="Password"
                      type="password"
                      value={password}
                      onChange={setPassword}
                    />
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Sign in
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup">
                  <form className="space-y-4" onSubmit={signUp}>
                    <Field id="name" label="Full name" value={fullName} onChange={setFullName} />
                    <Field
                      id="email2"
                      label="Email"
                      type="email"
                      value={email}
                      onChange={setEmail}
                    />
                    <Field
                      id="password2"
                      label="Password"
                      type="password"
                      value={password}
                      onChange={setPassword}
                    />
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Create account
                    </Button>
                  </form>
                </TabsContent>

                <div className="relative my-5">
                  <div className="h-px w-full bg-border" />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs uppercase tracking-wide text-muted-foreground">
                    or
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={signInWithGoogle}
                >
                  Continue with Google
                </Button>

                <p className="mt-5 text-center text-xs text-muted-foreground">
                  Your recordings stay private to your account.
                </p>

              </Tabs>

            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        required
        autoComplete={type === "password" ? "current-password" : "on"}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
