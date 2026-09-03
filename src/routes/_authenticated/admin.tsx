import { AppShell } from "@/components/layout/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { initialsOf, signedAvatarUrl } from "@/lib/avatar";
import { getAdminOverview } from "@/lib/interview.functions";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Recruiter overview — Signal Room" },
      {
        name: "description",
        content: "Compare every completed AI interview assessment across candidates and roles.",
      },
      { property: "og:title", content: "Recruiter overview — Signal Room" },
      {
        property: "og:description",
        content: "Compare candidate interview scores and recommendations in one place.",
      },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const fetchOverview = useServerFn(getAdminOverview);
  const overview = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview({}),
    retry: false,
  });

  const data = overview.data;

  return (
    <AppShell
      title="Recruiter overview"
      subtitle="Every candidate, interview volume per day, and full assessments."
      isAdmin
    >
      {overview.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" /> Loading recruiter data…
        </div>
      )}

      {overview.isError && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-destructive">
              {overview.error instanceof Error
                ? overview.error.message
                : "Could not load recruiter data"}
            </p>
            <Button variant="outline" size="sm" onClick={() => void overview.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Candidates" value={String(data.totals.candidates)} />
            <Stat label="Interviews" value={String(data.totals.interviews)} />
            <Stat label="Completed" value={String(data.totals.completed)} />
            <Stat
              label="Average score"
              value={data.totals.averageScore === null ? "—" : String(data.totals.averageScore)}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Interviews per day (last 14 days)</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void overview.refetch()}
                disabled={overview.isFetching}
              >
                <RefreshCw
                  className={`mr-2 size-4 ${overview.isFetching ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v: string) => v.slice(5)}
                    fontSize={12}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <YAxis
                    allowDecimals={false}
                    fontSize={12}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" name="Interviews" fill="var(--color-primary)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Tabs defaultValue="candidates">
            <TabsList>
              <TabsTrigger value="candidates">Interviewees</TabsTrigger>
              <TabsTrigger value="interviews">Interviews</TabsTrigger>
            </TabsList>

            <TabsContent value="candidates" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    All interviewees ({data.candidates.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.candidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No candidates have signed up.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Candidate</TableHead>
                          <TableHead>Target role</TableHead>
                          <TableHead>Interviews</TableHead>
                          <TableHead>Completed</TableHead>
                          <TableHead>Avg score</TableHead>
                          <TableHead>Last activity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.candidates.map((c) => (
                          <TableRow key={c.userId}>
                            <TableCell className="flex items-center gap-3">
                              <CandidateAvatar path={c.avatarUrl} name={c.fullName} />
                              <span>
                                <span className="block font-medium text-foreground">
                                  {c.fullName}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {c.email}
                                </span>
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {c.targetRole ?? "—"}
                              {c.location && (
                                <span className="block text-xs text-muted-foreground">
                                  {c.location}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>{c.interviewCount}</TableCell>
                            <TableCell>{c.completedCount}</TableCell>
                            <TableCell className="font-semibold">
                              {c.averageScore ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {c.lastInterviewAt
                                ? new Date(c.lastInterviewAt).toLocaleDateString()
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="interviews" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    All interviews ({data.interviews.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.interviews.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No interviews have been recorded yet.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Candidate</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Recommendation</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.interviews.map((row) => (
                          <TableRow key={row.interviewId}>
                            <TableCell>
                              <p className="font-medium text-foreground">{row.candidateName}</p>
                              <p className="text-xs text-muted-foreground">
                                {row.candidateEmail}
                              </p>
                            </TableCell>
                            <TableCell className="text-sm">
                              {row.jobRole}
                              <span className="block text-xs text-muted-foreground">
                                {row.seniority}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(row.startedAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={row.status === "completed" ? "default" : "secondary"}
                              >
                                {row.status.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-semibold">
                              {row.overallScore === null ? "—" : Math.round(row.overallScore)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {row.recommendation ?? "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button asChild size="sm" variant="outline">
                                <Link
                                  to="/report/$interviewId"
                                  params={{ interviewId: row.interviewId }}
                                >
                                  Analysis
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function CandidateAvatar({ path, name }: { path: string | null; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void signedAvatarUrl(path).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [path]);
  return (
    <Avatar className="size-9">
      {url && <AvatarImage src={url} alt={name} />}
      <AvatarFallback>{initialsOf(name)}</AvatarFallback>
    </Avatar>
  );
}
