import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { scoreTone } from "@/lib/domain/scoring";
import { getReport } from "@/lib/interview.functions";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/report/$interviewId")({
  head: () => ({
    meta: [
      { title: "Assessment report — Signal Room" },
      {
        name: "description",
        content:
          "Multimodal interview scorecard: technical depth, communication, confidence, expression, eye contact and voice.",
      },
      { property: "og:title", content: "Assessment report — Signal Room" },
      {
        property: "og:description",
        content: "Your multimodal AI interview scorecard with per-answer breakdowns.",
      },
    ],
  }),
  component: ReportPage,
});

const toneClass: Record<string, string> = {
  success: "text-emerald-400",
  primary: "text-primary",
  warning: "text-amber-400",
  destructive: "text-destructive",
};

function ReportPage() {
  const { interviewId } = Route.useParams();
  const fetchReport = useServerFn(getReport);
  const report = useQuery({
    queryKey: ["report", interviewId],
    queryFn: () => fetchReport({ data: { interviewId } }),
    staleTime: 60_000,
  });

  if (report.isLoading) {
    return (
      <AppShell title="Assessment report" subtitle="Compiling your multimodal scorecard…">
        <Loader2 className="size-6 animate-spin text-primary" />
      </AppShell>
    );
  }

  if (report.isError || !report.data) {
    return (
      <AppShell title="Assessment report">
        <p className="text-sm text-destructive">
          {report.error instanceof Error ? report.error.message : "Report unavailable"}
        </p>
      </AppShell>
    );
  }

  const data = report.data;
  const s = data.scores;
  const radar = [
    { axis: "Technical", value: s.technicalScore },
    { axis: "Communication", value: s.communicationScore },
    { axis: "Confidence", value: s.confidenceScore },
    { axis: "Expression", value: s.emotionScore },
    { axis: "Eye contact", value: s.eyeContactScore },
    { axis: "Voice", value: s.voiceScore },
    { axis: "Grammar", value: s.grammarScore },
  ];
  const perAnswer = data.answers.map((a, i) => ({
    name: `Q${i + 1}`,
    technical: a.llm?.technicalScore ?? 0,
    communication: a.llm?.communicationScore ?? 0,
  }));

  return (
    <AppShell
      title={`${data.jobRole} · ${data.seniority}`}
      subtitle={`${data.candidateName} · ${new Date(data.startedAt).toLocaleString()}`}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 size-4" /> Back to dashboard
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 size-4" /> Print / save as PDF
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Overall score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={`text-5xl font-semibold ${toneClass[scoreTone(s.overallScore)] ?? "text-foreground"}`}
              >
                {Math.round(s.overallScore)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">out of 100</p>
              <Badge className="mt-3" variant="secondary">
                {data.recommendation}
              </Badge>
            </CardContent>
          </Card>

          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Score breakdown</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {radar.map((row) => (
                <div key={row.axis}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{row.axis}</span>
                    <span className="font-medium text-foreground">{Math.round(row.value)}</span>
                  </div>
                  <Progress className="mt-1" value={row.value} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Competency profile</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radar} outerRadius="72%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "currentColor" }} />
                  <Radar
                    dataKey="value"
                    stroke="var(--color-primary)"
                    fill="var(--color-primary)"
                    fillOpacity={0.35}
                  />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per-answer performance</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perAnswer}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="technical" fill="var(--color-primary)" radius={4}>
                    {perAnswer.map((row) => (
                      <Cell key={row.name} />
                    ))}
                  </Bar>
                  <Bar dataKey="communication" fill="var(--color-accent)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recruiter summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="whitespace-pre-line text-muted-foreground">{data.summary}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="font-medium text-foreground">Strengths</p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {data.strengths.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground">Development areas</p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {data.weaknesses.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Answer-by-answer analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.answers.map((a, i) => (
              <div key={a.answerId} className="rounded-lg border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Question {i + 1} · {Math.round(a.durationSeconds)}s
                </p>
                <p className="mt-1 font-medium text-foreground">{a.questionText}</p>
                <p className="mt-2 text-sm text-muted-foreground">{a.transcript || "—"}</p>
                {a.llm && (
                  <p className="mt-2 text-sm text-foreground/80">{a.llm.evaluation}</p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <Stat label="Technical" value={a.llm ? Math.round(a.llm.technicalScore) : "—"} />
                  <Stat
                    label="Eye contact"
                    value={a.face ? `${Math.round(a.face.eyeContactRatio * 100)}%` : "—"}
                  />
                  <Stat label="Expression" value={a.emotion?.dominant ?? "—"} />
                  <Stat
                    label="Voice conf."
                    value={a.voice ? `${Math.round(a.voice.voiceConfidence * 100)}%` : "—"}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium capitalize text-foreground">{value}</p>
    </div>
  );
}
