import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrainCircuit, Eye, Gauge, Mic } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Signal Room — AI Video Interview Assessment" },
      {
        name: "description",
        content:
          "Practice role-based technical interviews on camera and get scored on content, speech, expression, eye contact and voice.",
      },
      { property: "og:title", content: "Signal Room — AI Video Interview Assessment" },
      {
        property: "og:description",
        content:
          "Role-based AI video interviews scored across language, vision and voice signals.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: BrainCircuit,
    title: "Adaptive questioning",
    body: "Question plans are generated for your target role and seniority, with follow-ups driven by what you actually said.",
  },
  {
    icon: Eye,
    title: "Vision signals",
    body: "In-browser face landmarking tracks eye contact, head stability and expression while you answer.",
  },
  {
    icon: Mic,
    title: "Speech & voice",
    body: "Answers are transcribed and analysed for pace, pauses, energy and vocal confidence.",
  },
  {
    icon: Gauge,
    title: "Scored reports",
    body: "A weighted scorecard with per-answer breakdowns, strengths, development areas and a recommendation.",
  },
];

function Landing() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  const primaryTo = signedIn ? "/dashboard" : "/auth";

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 font-semibold text-foreground">
          <BrainCircuit className="size-5 text-primary" />
          Signal Room
        </span>
        <Button asChild size="sm" variant={signedIn ? "default" : "outline"}>
          <Link to={primaryTo}>{signedIn ? "Go to dashboard" : "Sign in"}</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20">
        <section className="py-16 md:py-24">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
            Multimodal interview assessment
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
            Interviews scored on what you say, how you say it, and how you show up.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Signal Room runs a role-based technical interview on camera, then fuses language,
            speech, facial and vocal signals into one transparent scorecard.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to={primaryTo}>{signedIn ? "Continue to dashboard" : "Start an interview"}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how-it-works">See how scoring works</a>
            </Button>
          </div>
        </section>

        <section id="how-it-works" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-border bg-card p-5">
              <feature.icon className="size-5 text-primary" />
              <h2 className="mt-3 font-medium text-foreground">{feature.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
