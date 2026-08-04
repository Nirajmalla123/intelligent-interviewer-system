import { InterviewRoom } from "@/components/interview/InterviewRoom";
import { AppShell } from "@/components/layout/AppShell";
import { getInterviewSession } from "@/lib/interview.functions";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/interview/$interviewId")({
  head: () => ({
    meta: [
      { title: "Interview room — Signal Room" },
      {
        name: "description",
        content:
          "Answer AI-generated interview questions on camera while vision, voice and language analysis run live.",
      },
      { property: "og:title", content: "Interview room — Signal Room" },
      {
        property: "og:description",
        content: "Answer AI-generated questions on camera with live multimodal analysis.",
      },
    ],
  }),
  component: InterviewPage,
});

function InterviewPage() {
  const { interviewId } = Route.useParams();
  const fetchSession = useServerFn(getInterviewSession);
  const session = useQuery({
    queryKey: ["interview-session", interviewId],
    queryFn: () => fetchSession({ data: { interviewId } }),
    staleTime: Infinity,
  });

  return (
    <AppShell
      title="Interview room"
      subtitle="Speak naturally. Each answer is transcribed, evaluated and scored before the next question."
    >
      {session.isLoading && <Loader2 className="size-6 animate-spin text-primary" />}
      {session.isError && (
        <p className="text-sm text-destructive">
          {session.error instanceof Error ? session.error.message : "Could not load this interview"}
        </p>
      )}
      {session.data && (
        <InterviewRoom
          interviewId={interviewId}
          jobRole={session.data.jobRole}
          questions={session.data.questions}
          answeredQuestionIds={session.data.answeredQuestionIds}
        />
      )}
    </AppShell>
  );
}
