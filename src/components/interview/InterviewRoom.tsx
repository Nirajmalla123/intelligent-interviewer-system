import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import type { QuestionDto } from "@/lib/domain/types";
import { completeInterview, processAnswer } from "@/lib/interview.functions";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Square, Video, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** Interview machine states, driven automatically end to end. */
type Phase =
  | "idle"
  | "arming"
  | "question_speaking"
  | "recording"
  | "uploading"
  | "analysing"
  | "next_question"
  | "generating_report"
  | "completed"
  | "error";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Ready when you are",
  arming: "Enabling camera and microphone…",
  question_speaking: "AI is asking a question…",
  recording: "Recording your answer — just speak naturally",
  uploading: "Uploading your answer…",
  analysing: "Analysing your answer…",
  next_question: "Preparing the next question…",
  generating_report: "Generating your final report…",
  completed: "Interview completed",
  error: "Something went wrong",
};

const MIN_ANSWER_SECONDS = 6;
const MAX_ANSWER_SECONDS = 150;
const SILENCE_LEVEL = 0.035;
const SILENCE_TO_STOP_MS = 3500;

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Duplicate-execution guards (React re-renders / StrictMode safe).
  const armedRef = useRef(false);
  const runningQuestionRef = useRef<string | null>(null);
  const stoppingRef = useRef(false);
  const finishingRef = useRef(false);
  const abandonedRef = useRef(false);
  const secondsRef = useRef(0);

  const current = queue.find((q) => !answered.includes(q.id)) ?? null;
  const progress = queue.length ? (answered.length / queue.length) * 100 : 0;

  const clearTick = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  };

  const stopSpeech = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = "";
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    abandonedRef.current = true;
    clearTick();
    stopSpeech();
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch {
      /* recorder already gone */
    }
    faceRef.current?.close();
    voiceRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [stopSpeech]);

  useEffect(() => teardown, [teardown]);

  /** Speaks one question and resolves when playback has finished. */
  const speak = useCallback(
    async (text: string) => {
      stopSpeech();
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        throw new Error(
          (await response.text().catch(() => "")) || "The interviewer voice is unavailable",
        );
      }
      const blob = await response.blob();
      if (abandonedRef.current) return;
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = url;
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Could not play the question audio"));
        audio.play().catch(reject);
      });
    },
    [stopSpeech],
  );

  const uploadAndAnalyse = useCallback(
    async (question: QuestionDto, blob: Blob, durationSeconds: number) => {
      faceRef.current?.stop();
      voiceRef.current?.stop();
      const vision = faceRef.current?.results() ?? null;
      const voice = voiceRef.current?.results() ?? null;
      if (!vision || !voice) throw new Error("Analysis modules did not initialise");

      setPhase("uploading");
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
      form.set("durationSeconds", String(durationSeconds));
      if (videoPath) form.set("videoPath", videoPath);
      form.set("face", JSON.stringify(vision.face));
      form.set("emotion", JSON.stringify(vision.emotion));
      form.set("voice", JSON.stringify(voice));
      form.set("media", new File([blob], "answer.webm", { type: "video/webm" }));

      // Backend does speech-to-text, multimodal evaluation and scoring.
      setPhase("analysing");
      return submitAnswer({ data: form });
    },
    [interviewId, submitAnswer],
  );

  const finalise = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setPhase("generating_report");
    try {
      await finish({ data: { interviewId } });
      teardown();
      setPhase("completed");
      toast.success("Interview complete — opening your report");
      navigate({ to: "/report/$interviewId", params: { interviewId } });
    } catch (error) {
      finishingRef.current = false;
      setErrorMessage(
        error instanceof Error ? error.message : "Could not generate the final report",
      );
      setPhase("error");
    }
  }, [finish, interviewId, navigate, teardown]);

  /**
   * Runs one full question cycle: speak → record → auto-stop → upload →
   * backend analysis → next question (or final report).
   */
  const runQuestion = useCallback(
    async (question: QuestionDto) => {
      const stream = streamRef.current;
      if (!stream || !videoRef.current) return;

      setFeedback(null);
      setPhase("question_speaking");
      try {
        await speak(question.text);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "The question could not be read aloud",
        );
      }
      if (abandonedRef.current) return;

      // ---- recording ----
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: mime });
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Recording is not supported in this browser",
        );
        setPhase("error");
        return;
      }
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      stoppingRef.current = false;
      recorder.start(1000);
      faceRef.current?.start(videoRef.current);
      voiceRef.current?.start(stream);
      secondsRef.current = 0;
      setSeconds(0);
      setPhase("recording");

      const blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: "video/webm" }));
        let silentMs = 0;
        clearTick();
        tickRef.current = setInterval(() => {
          secondsRef.current += 1;
          const live = voiceRef.current?.liveLevel() ?? 0;
          setSeconds(secondsRef.current);
          setLevel(live);
          setEyeContact(faceRef.current?.liveEyeContact() ?? 0);
          setEmotion(faceRef.current?.liveDominantEmotion() ?? "neutral");

          silentMs = live < SILENCE_LEVEL ? silentMs + 1000 : 0;
          const enoughSilence =
            secondsRef.current >= MIN_ANSWER_SECONDS && silentMs >= SILENCE_TO_STOP_MS;
          if (
            !stoppingRef.current &&
            (enoughSilence || secondsRef.current >= MAX_ANSWER_SECONDS || abandonedRef.current)
          ) {
            stoppingRef.current = true;
            clearTick();
            if (recorder.state !== "inactive") recorder.stop();
          }
        }, 1000);
      });
      clearTick();
      if (abandonedRef.current) return;

      try {
        const result = await uploadAndAnalyse(question, blob, secondsRef.current);
        if (abandonedRef.current) return;
        setAnswered((prev) => (prev.includes(question.id) ? prev : [...prev, question.id]));
        setFeedback({
          transcript: result.transcript,
          evaluation: result.evaluation,
          strengths: result.strengths,
          weaknesses: result.weaknesses,
        });
        if (result.followUpQuestion) {
          const followUp = result.followUpQuestion as QuestionDto;
          setQueue((prev) => (prev.some((q) => q.id === followUp.id) ? prev : [...prev, followUp]));
        }
        if (result.interviewComplete) {
          await finalise();
          return;
        }
        setPhase("next_question");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not analyse that answer",
        );
        setPhase("error");
      }
    },
    [finalise, speak, uploadAndAnalyse],
  );

  const arm = useCallback(async () => {
    if (armedRef.current) return;
    armedRef.current = true;
    abandonedRef.current = false;
    setErrorMessage(null);
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
      // Unlock audio playback within this user gesture.
      audioRef.current = new Audio();
      setPhase("next_question");
    } catch (error) {
      armedRef.current = false;
      setErrorMessage(
        error instanceof Error
          ? `Camera/microphone unavailable: ${error.message}`
          : "Camera and microphone access is required",
      );
      setPhase("error");
    }
  }, []);

  // Single driver: whenever the next question is due, run exactly one cycle.
  useEffect(() => {
    if (phase !== "next_question") return;
    if (!current) {
      void finalise();
      return;
    }
    if (runningQuestionRef.current === current.id) return;
    runningQuestionRef.current = current.id;
    void runQuestion(current);
  }, [current, finalise, phase, runQuestion]);

  const retry = useCallback(() => {
    setErrorMessage(null);
    runningQuestionRef.current = null;
    finishingRef.current = false;
    abandonedRef.current = false;
    setPhase(armedRef.current ? "next_question" : "idle");
  }, []);

  const endEarly = useCallback(() => {
    void finalise();
  }, [finalise]);

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const busy =
    phase === "question_speaking" ||
    phase === "uploading" ||
    phase === "analysing" ||
    phase === "next_question" ||
    phase === "generating_report";

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
                  The interviewer will read each question aloud and recording starts on its own.
                  Just answer, then pause when you are done.
                </p>
                <Button onClick={() => void arm()}>Start interview</Button>
              </div>
            )}

            {phase === "arming" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80">
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">{PHASE_LABEL.arming}</p>
              </div>
            )}

            {phase === "question_speaking" && (
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-background/80 p-3">
                <Volume2 className="size-4 animate-pulse text-primary" />
                <p className="text-xs text-muted-foreground">{PHASE_LABEL.question_speaking}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <Metric label="Voice level" value={`${Math.round(level * 100)}%`} bar={level} />
            <Metric label="Eye contact" value={`${Math.round(eyeContact * 100)}%`} bar={eyeContact} />
            <Metric label="Expression" value={emotion} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
              {busy && <Loader2 className="size-4 animate-spin text-primary" />}
              {phase === "recording" && (
                <span className="size-2 animate-pulse rounded-full bg-destructive" />
              )}
              {PHASE_LABEL[phase]}
            </span>

            {phase === "recording" && (
              <Button
                variant="destructive"
                onClick={() => {
                  if (stoppingRef.current) return;
                  stoppingRef.current = true;
                  clearTick();
                  if (recorderRef.current && recorderRef.current.state !== "inactive") {
                    recorderRef.current.stop();
                  }
                }}
              >
                <Square className="mr-2 size-4" /> I&apos;m done answering
              </Button>
            )}

            {phase === "error" && (
              <Button onClick={retry}>Try again</Button>
            )}

            {(phase === "recording" || phase === "error" || phase === "next_question") && (
              <Button variant="outline" onClick={endEarly}>
                <CheckCircle2 className="mr-2 size-4" /> End &amp; view report
              </Button>
            )}

            <span className="text-xs text-muted-foreground">
              {answered.length} of {queue.length} answered
            </span>
          </div>

          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

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
