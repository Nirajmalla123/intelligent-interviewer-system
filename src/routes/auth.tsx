import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BrainCircuit, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IdentityCheck } from "@/components/identity/IdentityCheck";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const [enrolling, setEnrolling] = useState(false);
  const enrollingRef = useRef(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && !enrollingRef.current) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !enrollingRef.current) navigate({ to: "/dashboard", replace: true });
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
    enrollingRef.current = true;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    if (error) {
      enrollingRef.current = false;
      setBusy(false);
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      // Accounts are confirmed automatically — sign straight in.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        enrollingRef.current = false;
        setBusy(false);
        setSent(true);
        toast.success("Account created — you can sign in now");
        return;
      }
    }
    setBusy(false);
    setEnrolling(true);
  }

  const finishEnrollment = () => {
    enrollingRef.current = false;
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 font-semibold">
          <BrainCircuit className="size-5 text-primary" />
          Signal Room
        </Link>
        <Card>
          <CardContent className="pt-6">
            {enrolling ? (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold">Capture your live photo</h2>
                  <p className="text-sm text-muted-foreground">
                    Look at the camera. This live photo becomes your profile picture and is used to
                    verify your identity during interviews.
                  </p>
                </div>
                <IdentityCheck onChange={(ok) => ok && finishEnrollment()} />
                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground underline"
                  onClick={finishEnrollment}
                >
                  Do this later (required before any interview)
                </button>
              </div>
            ) : sent ? (
              <p className="text-center text-sm text-muted-foreground">
                Your account for <strong>{email}</strong> is ready. Switch to the sign in tab to
                continue.
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
