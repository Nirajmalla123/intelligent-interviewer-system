import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JOB_ROLES, SENIORITY_LEVELS, type Seniority } from "@/lib/domain/types";
import { getMyAccount, listMyInterviews, startInterview } from "@/lib/interview.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Interview dashboard — Signal Room" },
      {
        name: "description",
        content: "Start a role-based AI video interview and review your scored assessments.",
      },
      { property: "og:title", content: "Interview dashboard — Signal Room" },
      {
        property: "og:description",
        content: "Start a role-based AI video interview and review your scored assessments.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getMyAccount);
  const fetchInterviews = useServerFn(listMyInterviews);
  const begin = useServerFn(startInterview);

  const account = useQuery({ queryKey: ["account"], queryFn: () => fetchAccount({}) });
  const interviews = useQuery({ queryKey: ["my-interviews"], queryFn: () => fetchInterviews({}) });

  const [jobRole, setJobRole] = useState<string>(JOB_ROLES[0]);
  const [seniority, setSeniority] = useState<Seniority>("mid");

  const start = useMutation({
    mutationFn: () => begin({ data: { jobRole, seniority } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["my-interviews"] });
      navigate({ to: "/interview/$interviewId", params: { interviewId: result.interviewId } });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not start the interview"),
  });

  return (
    <AppShell
      title={`Welcome${account.data?.profile?.fullName ? `, ${account.data.profile.fullName}` : ""}`}
      subtitle="Role-based interviews assessed across content, speech, expression and voice."
      isAdmin={account.data?.isAdmin ?? false}
    >
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Start a new interview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">Target role</p>
              <Select value={jobRole} onValueChange={setJobRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">Seniority</p>
              <Select
                value={seniority}
                onValueChange={(v) => setSeniority(v as Seniority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SENIORITY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => start.mutate()}
              disabled={start.isPending}
            >
              {start.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Play className="mr-2 size-4" />
              )}
              Generate questions &amp; begin
            </Button>
            {!account.data?.resumeText && (
              <p className="text-xs text-muted-foreground">
                Tip: add your resume in{" "}
                <Link to="/profile" className="text-primary underline">
                  Profile
                </Link>{" "}
                so questions are tailored to your experience.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your interviews</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {interviews.isLoading && <Loader2 className="size-5 animate-spin text-primary" />}
            {interviews.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No interviews yet — start your first one on the left.
              </p>
            )}
            {interviews.data?.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-40 flex-1">
                  <p className="font-medium text-foreground">{item.jobRole}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.seniority} · {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <Badge variant={item.status === "completed" ? "default" : "secondary"}>
                  {item.status.replace("_", " ")}
                </Badge>
                {item.overallScore !== null && (
                  <span className="text-sm font-semibold text-foreground">
                    {Math.round(item.overallScore)}/100
                  </span>
                )}
                {item.status === "completed" || item.overallScore !== null ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/report/$interviewId" params={{ interviewId: item.id }}>
                      View report
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="sm">
                    <Link to="/interview/$interviewId" params={{ interviewId: item.id }}>
                      Resume
                    </Link>
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
