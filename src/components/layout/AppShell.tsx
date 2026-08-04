import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { BrainCircuit, LogOut } from "lucide-react";
import type { ReactNode } from "react";

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

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
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
          <Button variant="ghost" size="sm" className="ml-auto" onClick={signOut}>
            <LogOut className="mr-2 size-4" /> Sign out
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
