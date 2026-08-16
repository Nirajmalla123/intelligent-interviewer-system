import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import type { QuestionDto } from "@/lib/domain/types";
import { completeInterview, processAnswer } from "@/lib/interview.functions";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, Square, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Phase = "idle" | "arming" | "ready" | "recording" | "analysing" | "done";

interface Props {
  interviewId: string;
  jobRole: string;
  questions: QuestionDto[];
  answeredQuestionIds: string[];
}

interface Feedback {
  transcript: string;
  evaluation: string;
  strengths: string[];
  weaknesses: string[];
}

export function InterviewRoom({ interviewId, jobRole, questions, answeredQuestionIds }: Props) {
  const navigate = useNavigate();
  const submitAnswer = useServerFn(processAnswer);
  const finish = useServerFn(completeInterview);

  const [queue, setQueue] = useState<QuestionDto[]>(() =>
    [...questions].sort((a, b) => a.orderIndex - b.orderIndex),
  );
  const [answered, setAnswered] = useState<string[]>(answeredQuestionIds);
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [eyeContact, setEyeContact] = useState(0);
  const [emotion, setEmotion] = useState("neutral");
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const faceRef = useRef<import("@/lib/capture/face-analyzer").FaceAnalyzer | null>(null);
  const voiceRef = useRef<import("@/lib/capture/voice-analyzer").VoiceAnalyzer | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = queue.find((q) => !answered.includes(q.id)) ?? null;
  const progress = queue.length ? (answered.length / queue.length) * 100 : 0;

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      faceRef.current?.close();
      voiceRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const arm = useCallback(async () => {
    setPhase("arming");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      const [{ FaceAnalyzer }, { VoiceAnalyzer }] = await Promise.all([
        import("@/lib/capture/face-analyzer"),
        import("@/lib/capture/voice-analyzer"),
      ]);
      const face = new FaceAnalyzer();
      await face.init();
      faceRef.current = face;
      voiceRef.current = new VoiceAnalyzer();
      setPhase("ready");
    } catch (error) {
      setPhase("idle");
      toast.error(
        error instanceof Error
          ? `Camera/mic unavailable: ${error.message}`
          : "Camera and microphone access is required",
      );
    }
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !videoRef.current) return;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;
    recorder.start(1000);

    faceRef.current?.start(videoRef.current);
    voiceRef.current?.start(stream);
    setSeconds(0);
    setFeedback(null);
    setPhase("recording");
    tickRef.current = setInterval(() => {
      setSeconds((s) => s + 1);
      setLevel(voiceRef.current?.liveLevel() ?? 0);
      setEyeContact(faceRef.current?.liveEyeContact() ?? 0);
      setEmotion(faceRef.current?.liveDominantEmotion() ?? "neutral");
    }, 1000);
  }, []);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    const question = current;
    if (!recorder || !question) return;
    if (tickRef.current) clearInterval(tickRef.current);
    setPhase("analysing");

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: "video/webm" }));
      recorder.stop();
    });

    faceRef.current?.stop();
    voiceRef.current?.stop();
    const vision = faceRef.current?.results() ?? null;
    const voice = voiceRef.current?.results() ?? null;
    if (!vision || !voice) {
      toast.error("Analysis modules did not initialise");
      setPhase("ready");
      return;
    }

    try {
      const { data: auth } = await supabase.auth.getUser();
      let videoPath: string | null = null;
      if (auth.user) {
        const path = `${auth.user.id}/${interviewId}/${question.id}.webm`;
        const { error } = await supabase.storage
          .from("interview-videos")
          .upload(path, blob, { contentType: "video/webm", upsert: true });
        if (!error) videoPath = path;
      }

      const form = new FormData();
      form.set("interviewId", interviewId);
      form.set("questionId", question.id);
      form.set("durationSeconds", String(seconds));
      if (videoPath) form.set("videoPath", videoPath);
      form.set("face", JSON.stringify(vision.face));
      form.set("emotion", JSON.stringify(vision.emotion));
      form.set("voice", JSON.stringify(voice));
      form.set("media", new File([blob], "answer.webm", { type: "video/webm" }));

      const result = await submitAnswer({ data: form });

      setAnswered((prev) => [...prev, question.id]);
      setFeedback({
        transcript: result.transcript,
        evaluation: result.evaluation,
        strengths: result.strengths,
        weaknesses: result.weaknesses,
      });
      if (result.followUpQuestion) {
        setQueue((prev) => [...prev, result.followUpQuestion as QuestionDto]);
      }

      if (result.interviewComplete) {
        await finish({ data: { interviewId } });
        setPhase("done");
        toast.success("Interview complete — building your report");
        navigate({ to: "/report/$interviewId", params: { interviewId } });
        return;
      }
      setPhase("ready");
    } catch (error) {
      setPhase("ready");
      toast.error(error instanceof Error ? error.message : "Could not analyse that answer");
    }
  }, [current, finish, interviewId, navigate, seconds, submitAnswer]);

  const finishNow = useCallback(async () => {
    setPhase("analysing");
    try {
      await finish({ data: { interviewId } });
      faceRef.current?.close();
      voiceRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setPhase("done");
      toast.success("Interview closed — opening your report");
      navigate({ to: "/report/$interviewId", params: { interviewId } });
    } catch (error) {
      setPhase("ready");
      toast.error(error instanceof Error ? error.message : "Could not finish the interview");
    }
  }, [finish, interviewId, navigate]);

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;


  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Interview room · {jobRole}</CardTitle>
          {phase === "recording" && (
            <Badge className="animate-pulse bg-destructive text-destructive-foreground">
              REC {mmss}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-video w-full scale-x-[-1] object-cover"
            />
            {phase === "idle" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 p-6 text-center">
                <Video className="size-8 text-primary" />
                <p className="text-sm text-muted-foreground">
                  {current
                    ? "Your camera and microphone power the vision and voice analysis. Nothing is recorded until you press start."
                    : "You have answered every question. Finish up to generate your report."}
                </p>
                {current ? (
                  <Button onClick={arm}>Enable camera &amp; mic</Button>
                ) : (
                  <Button onClick={() => void finishNow()}>
                    <CheckCircle2 className="mr-2 size-4" /> Finish &amp; view report
                  </Button>
                )}
              </div>
            )}

            {phase === "arming" && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <Metric label="Voice level" value={`${Math.round(level * 100)}%`} bar={level} />
            <Metric label="Eye contact" value={`${Math.round(eyeContact * 100)}%`} bar={eyeContact} />
            <Metric label="Expression" value={emotion} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {phase === "ready" && (
              <Button onClick={startRecording} disabled={!current}>
                <Mic className="mr-2 size-4" />
                {answered.length === 0 ? "Start answering" : "Record next answer"}
              </Button>
            )}
            {phase === "recording" && (
              <Button variant="destructive" onClick={stopRecording}>
                <Square className="mr-2 size-4" /> Stop &amp; analyse
              </Button>
            )}
            {phase === "analysing" && (
              <Button disabled>
                <Loader2 className="mr-2 size-4 animate-spin" /> Analysing answer…
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {answered.length} of {queue.length} answered
            </span>
          </div>
          <Progress value={progress} />
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {current ? `Question ${answered.length + 1}` : "All questions answered"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {current ? (
              <>
                <p className="text-lg leading-relaxed text-foreground">{current.text}</p>
                <div className="flex gap-2">
                  <Badge variant="secondary">{current.category}</Badge>
                  {current.isFollowup && <Badge variant="outline">follow-up</Badge>}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your report is being compiled from every answer.
              </p>
            )}
          </CardContent>
        </Card>

        {feedback && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live feedback on your last answer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{feedback.evaluation}</p>
              {feedback.strengths.length > 0 && (
                <div>
                  <p className="font-medium text-foreground">Strengths</p>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {feedback.strengths.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {feedback.weaknesses.length > 0 && (
                <div>
                  <p className="font-medium text-foreground">To improve</p>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {feedback.weaknesses.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {feedback.transcript && (
                <details className="rounded-md border border-border p-3">
                  <summary className="cursor-pointer text-xs uppercase tracking-wide text-muted-foreground">
                    Transcript
                  </summary>
                  <p className="mt-2 text-muted-foreground">{feedback.transcript}</p>
                </details>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, bar }: { label: string; value: string; bar?: number }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium capitalize text-foreground">{value}</p>
      {bar !== undefined && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, bar * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
