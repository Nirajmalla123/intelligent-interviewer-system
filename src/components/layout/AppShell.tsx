import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { BrainCircuit, Loader2, LogOut } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/profile", label: "Profile" },
] as const;

export function AppShell({
  children,
  title,
  subtitle,
  isAdmin = false,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  isAdmin?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate({ to: "/auth", replace: true });
    } catch (error) {
      setSigningOut(false);
      toast.error(error instanceof Error ? error.message : "Could not sign out");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-foreground">
            <BrainCircuit className="size-5 text-primary" />
            Signal Room
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{ className: "bg-accent text-foreground" }}
              >
                {item.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{ className: "bg-accent text-foreground" }}
              >
                Admin
              </Link>
            )}
          </nav>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            disabled={signingOut}
            onClick={() => void signOut()}
          >
            {signingOut ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <LogOut className="mr-2 size-4" />
            )}
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
