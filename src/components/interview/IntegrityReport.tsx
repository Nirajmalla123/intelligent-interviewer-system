import type { AnswerAnalysisDto } from "@/lib/domain/types";
import type { SecurityEvent } from "@/lib/domain/integrity";

export function IntegrityReport({ answers, events }: { answers: AnswerAnalysisDto[]; events: SecurityEvent[] }) {
  const reviewed = answers.filter((answer) => answer.integrity);
  const scores = reviewed.map((answer) => answer.integrity?.suspicionScore).filter((score): score is number => typeof score === "number");
  return <section className="space-y-5 border-y border-border py-6">
    <div>
      <h2 className="text-lg font-semibold text-foreground">Interview integrity review</h2>
      <p className="mt-1 text-sm text-muted-foreground">{reviewed.length} of {answers.length} answers reviewed · {events.length} security observations</p>
      <p className="mt-2 text-sm text-foreground">Average suspicion: {scores.length ? `${Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)}/100` : "Not assessed"}</p>
      <p className="mt-2 text-sm text-muted-foreground">These are uncertain review signals, not cheating verdicts. AI-generated text cannot be reliably identified from transcripts. Gaze and microphone observations may have innocent explanations and do not identify background speakers. Human review is required; competency scores are unchanged.</p>
    </div>
    <div className="divide-y divide-border">
      {answers.map((answer, index) => <article key={answer.answerId} className="py-4">
        <h3 className="text-sm font-medium text-foreground">Question {index + 1} · Suspicion {answer.integrity?.suspicionScore == null ? "not assessed" : `${answer.integrity.suspicionScore}/100`}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{answer.questionText}</p>
        {answer.integrity ? <>
          <p className="mt-2 text-sm text-foreground">{answer.integrity.assessment}</p>
          <p className="mt-1 text-xs text-muted-foreground">Confidence: {answer.integrity.confidence} · {new Date(answer.integrity.assessedAt).toLocaleString()}</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{answer.integrity.evidence.map((evidence, i) => <li key={i}>{evidence}</li>)}</ul>
          <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Limitations</summary><ul className="mt-2 list-disc pl-5">{answer.integrity.limitations.map((limitation, i) => <li key={i}>{limitation}</li>)}</ul></details>
        </> : <p className="mt-2 text-sm text-muted-foreground">No AI integrity review is available for this answer.</p>}
      </article>)}
    </div>
    <div>
      <h3 className="text-sm font-semibold text-foreground">Security timeline</h3>
      {events.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No security observations recorded.</p> : <ol className="mt-3 divide-y divide-border">{events.map((event) => <li key={event.eventKey} className="py-3 text-sm">
        <div className="flex flex-wrap gap-x-3 gap-y-1"><time className="text-muted-foreground" dateTime={event.observedAt}>{new Date(event.observedAt).toLocaleString()}</time><span className={event.kind === "terminated" ? "font-medium text-destructive" : "font-medium text-foreground"}>{event.kind.replaceAll("_", " ")}</span></div>
        <p className="mt-1 text-muted-foreground">{event.details}</p>
        {event.questionId && <p className="mt-1 text-xs text-muted-foreground">Question reference: {event.questionId}</p>}
      </li>)}</ol>}
    </div>
  </section>;
}