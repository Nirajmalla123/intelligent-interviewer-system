import { AppShell } from "@/components/layout/AppShell";
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
import { listAllInterviews } from "@/lib/interview.functions";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

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
  const fetchAll = useServerFn(listAllInterviews);
  const all = useQuery({ queryKey: ["all-interviews"], queryFn: () => fetchAll({}) });

  return (
    <AppShell
      title="Recruiter overview"
      subtitle="Every interview assessed by the system, newest first."
      isAdmin
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Candidates</CardTitle>
        </CardHeader>
        <CardContent>
          {all.isLoading && <Loader2 className="size-5 animate-spin text-primary" />}
          {all.isError && (
            <p className="text-sm text-destructive">
              {all.error instanceof Error ? all.error.message : "Could not load interviews"}
            </p>
          )}
          {all.data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {all.data.map((row) => (
                  <TableRow key={row.interviewId}>
                    <TableCell>
                      <p className="font-medium text-foreground">{row.candidateName}</p>
                      <p className="text-xs text-muted-foreground">{row.candidateEmail}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.jobRole}
                      <span className="block text-xs text-muted-foreground">{row.seniority}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "completed" ? "default" : "secondary"}>
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
                        <Link to="/report/$interviewId" params={{ interviewId: row.interviewId }}>
                          Report
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
    </AppShell>
  );
}
