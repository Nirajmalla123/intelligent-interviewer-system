import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import type { QuestionDto } from "@/lib/domain/types";
import { checkMyIdentity, completeInterview, processAnswer, terminateInterview } from "@/lib/interview.functions";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, ShieldAlert, Square, Video, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** Interview machine states, driven automatically end to end. */
type Phase =
  | "idle"
  | "arming"
  | "question_speaking"
  | "recording"
  | "next_question"
  | "generating_report"
  | "completed"
  | "error"
  | "terminated";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Ready when you are",
  arming: "Enabling camera and microphone…",
  question_speaking: "AI is asking a question…",
  recording: "Recording your answer — just speak naturally",
  next_question: "Preparing the next question…",
  generating_report: "Building your detailed final report…",
  completed: "Interview completed",
  error: "Something went wrong",
  terminated: "Interview terminated",
};

const MIN_ANSWER_SECONDS = 3;
const MAX_ANSWER_SECONDS = 150;
const SILENCE_LEVEL = 0.035;
const SILENCE_TO_STOP_MS = 2500;
const TICK_MS = 250;
/** Multiple faces must persist this long before the interview is terminated. */
const MULTI_FACE_CONFIRM_MS = 2000;
/** How often the live face is re-compared with the verified reference face. */
const IDENTITY_CHECK_MS = 20000;
const TERMINATED_MESSAGE = "Multiple Faces Detected — Interview Terminated for Security Reasons.";


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
  const terminate = useServerFn(terminateInterview);
  const [multiFaceWarning, setMultiFaceWarning] = useState(false);
  const multiSinceRef = useRef<number | null>(null);
  const clearFramesRef = useRef(0);
  const terminatedRef = useRef(false);
  const checkIdentity = useServerFn(checkMyIdentity);
  const pausedRef = useRef(false);
  const identityBusyRef = useRef(false);
  const identityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [identityPause, setIdentityPause] = useState<string | null>(null);
  const [reverifying, setReverifying] = useState(false);

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
  const speakingRef = useRef(false);
  const finishingRef = useRef(false);
  const abandonedRef = useRef(false);
  const secondsRef = useRef(0);
  const submittedRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Promise<void>[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null);

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
    speakingRef.current = false;
  }, []);

  const teardown = useCallback(() => {
    abandonedRef.current = true;
    clearTick();
    if (identityTimerRef.current) clearInterval(identityTimerRef.current);
    identityTimerRef.current = null;
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

  /** Speaks one question and resolves when playback has finished. Never overlaps. */
  const speak = useCallback(
    async (text: string) => {
      if (speakingRef.current) return;
      speakingRef.current = true;
      stopSpeech();
      speakingRef.current = true;
      try {
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
      } finally {
        speakingRef.current = false;
      }
    },
    [stopSpeech],
  );

  /**
   * Uploads and analyses one answer *in the background* so the camera, mic and
   * the next question are never blocked. Metrics are snapshotted by the caller.
   */
  const analyseInBackground = useCallback(
    (
      question: QuestionDto,
      blob: Blob,
      durationSeconds: number,
      face: unknown,
      emotionMetrics: unknown,
      voice: unknown,
    ) => {
      if (submittedRef.current.has(question.id)) return;
      submittedRef.current.add(question.id);
      setPendingCount((n) => n + 1);

      const task = (async () => {
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
          form.set("durationSeconds", String(durationSeconds));
          if (videoPath) form.set("videoPath", videoPath);
          form.set("face", JSON.stringify(face));
          form.set("emotion", JSON.stringify(emotionMetrics));
          form.set("voice", JSON.stringify(voice));
          form.set("media", new File([blob], "answer.webm", { type: "video/webm" }));

          const result = await submitAnswer({ data: form });
          if (abandonedRef.current) return;
          setFeedback({
            transcript: result.transcript,
            evaluation: result.evaluation,
            strengths: result.strengths,
            weaknesses: result.weaknesses,
          });
          if (result.followUpQuestion) {
            const followUp = result.followUpQuestion as QuestionDto;
            setQueue((prev) =>
              prev.some((q) => q.id === followUp.id) ? prev : [...prev, followUp],
            );
          }
        } catch (error) {
          setAnalysisWarning(
            error instanceof Error
              ? `One answer could not be analysed: ${error.message}`
              : "One answer could not be analysed",
          );
        } finally {
          setPendingCount((n) => Math.max(0, n - 1));
        }
      })();

      pendingRef.current.push(task);
    },
    [interviewId, submitAnswer],
  );

  const finalise = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setPhase("generating_report");
    try {
      // Detailed/final analysis only after every background answer has landed.
      await Promise.allSettled(pendingRef.current);
      pendingRef.current = [];
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
   * One question cycle: speak → auto-record → auto-stop on 2.5s of silence →
   * hand the answer to background analysis → straight on to the next question.
   */
  const runQuestion = useCallback(
    async (question: QuestionDto) => {
      const stream = streamRef.current;
      if (!stream || !videoRef.current) return;

      setPhase("question_speaking");
      try {
        await speak(question.text);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "The question could not be read aloud",
        );
      }
      while (pausedRef.current && !abandonedRef.current) {
        await new Promise((res) => setTimeout(res, 300));
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
        let elapsedMs = 0;
        clearTick();
        tickRef.current = setInterval(() => {
          if (pausedRef.current) return;
          elapsedMs += TICK_MS;
          secondsRef.current = Math.floor(elapsedMs / 1000);
          const live = voiceRef.current?.liveLevel() ?? 0;
          setSeconds(secondsRef.current);
          setLevel(live);
          setEyeContact(faceRef.current?.liveEyeContact() ?? 0);
          setEmotion(faceRef.current?.liveDominantEmotion() ?? "neutral");

          silentMs = live < SILENCE_LEVEL ? silentMs + TICK_MS : 0;
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
        }, TICK_MS);
      });
      clearTick();
      if (abandonedRef.current) return;

      // Snapshot per-answer metrics, then keep the camera/mic running.
      faceRef.current?.stop();
      voiceRef.current?.stop();
      const vision = faceRef.current?.results() ?? null;
      const voice = voiceRef.current?.results() ?? null;

      setAnswered((prev) => (prev.includes(question.id) ? prev : [...prev, question.id]));
      if (vision && voice) {
        analyseInBackground(
          question,
          blob,
          secondsRef.current,
          vision.face,
          vision.emotion,
          voice,
        );
      }
      setPhase("next_question");
    },
    [analyseInBackground, speak],
  );

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = Math.round(480 * ((video.videoHeight || 720) / (video.videoWidth || 1280)));
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  }, []);

  const pauseForIdentity = useCallback((reason: string) => {
    pausedRef.current = true;
    setIdentityPause(reason);
    audioRef.current?.pause();
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") rec.pause();
  }, []);

  const resumeAfterIdentity = useCallback(() => {
    pausedRef.current = false;
    setIdentityPause(null);
    const audio = audioRef.current;
    if (audio && audio.src && audio.paused && !audio.ended) void audio.play().catch(() => undefined);
    const rec = recorderRef.current;
    if (rec && rec.state === "paused") rec.resume();
  }, []);

  /** Compares the current frame with the verified face; pauses on mismatch. */
  const runIdentityCheck = useCallback(
    async (manual: boolean) => {
      if (identityBusyRef.current || terminatedRef.current || abandonedRef.current) return;
      if (!manual && pausedRef.current) return;
      const image = captureFrame();
      if (!image) return;
      identityBusyRef.current = true;
      if (manual) setReverifying(true);
      try {
        const video = videoRef.current;
        const localFaceCount = video && faceRef.current ? faceRef.current.countFaces(video) : -1;
        const result = await checkIdentity({ data: { image, localFaceCount } });
        if (terminatedRef.current || abandonedRef.current) return;
        if (result.verified) {
          if (pausedRef.current) {
            resumeAfterIdentity();
            toast.success("Identity confirmed — interview resumed");
          }
        } else {
          pauseForIdentity(result.reason);
        }
      } catch (error) {
        // Network/AI hiccups never pause the interview; only explicit mismatches do.
        if (manual) toast.error(error instanceof Error ? error.message : "Verification failed");
      } finally {
        identityBusyRef.current = false;
        if (manual) setReverifying(false);
      }
    },
    [captureFrame, checkIdentity, pauseForIdentity, resumeAfterIdentity],
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
      if (videoRef.current) {
        const video = videoRef.current;
        face.monitor(video, (count) => {
          if (terminatedRef.current) return;
          const now = performance.now();
          if (count > 1) {
            clearFramesRef.current = 0;
            multiSinceRef.current ??= now;
            setMultiFaceWarning(true);
            if (now - multiSinceRef.current >= MULTI_FACE_CONFIRM_MS) {
              terminatedRef.current = true;
              finishingRef.current = true;
              teardown();
              setPhase("terminated");
              void terminate({ data: { interviewId, reason: "multiple_faces" } }).catch(() => undefined);
            }
          } else {
            // Require two clean frames in a row before dismissing a detection.
            clearFramesRef.current += 1;
            if (clearFramesRef.current >= 2) {
              multiSinceRef.current = null;
              setMultiFaceWarning(false);
            }
          }
        });
      }
      voiceRef.current = new VoiceAnalyzer();
      // Unlock audio playback within this user gesture.
      audioRef.current = new Audio();
      if (identityTimerRef.current) clearInterval(identityTimerRef.current);
      identityTimerRef.current = setInterval(() => void runIdentityCheck(false), IDENTITY_CHECK_MS);
      setTimeout(() => void runIdentityCheck(false), 4000);
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
  }, [interviewId, runIdentityCheck, teardown, terminate]);

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
    phase === "question_speaking" || phase === "next_question" || phase === "generating_report";


  if (phase === "terminated") {
    return <TerminatedNotice />;
  }

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

            {multiFaceWarning && (
              <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-destructive p-2 text-destructive-foreground">
                <ShieldAlert className="size-4" />
                <p className="text-xs font-medium">Multiple faces detected — only you may be in view.</p>
              </div>
            )}

            {identityPause && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/90 p-6 text-center">
                <ShieldAlert className="size-8 text-destructive" />
                <p className="text-sm font-semibold text-destructive">Interview paused — identity check failed</p>
                <p className="text-xs text-muted-foreground">{identityPause}</p>
                <Button onClick={() => void runIdentityCheck(true)} disabled={reverifying}>
                  {reverifying && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {reverifying ? "Verifying…" : "Verify my face again"}
                </Button>
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

            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin text-primary" />
                Analysing {pendingCount} answer{pendingCount > 1 ? "s" : ""} in the background
              </span>
            )}
          </div>

          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
          {analysisWarning && <p className="text-xs text-muted-foreground">{analysisWarning}</p>}


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

export function TerminatedNotice() {
  return (
    <Card className="border-destructive bg-destructive/10">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <ShieldAlert className="size-10 text-destructive" />
        <p className="text-lg font-semibold text-destructive">{TERMINATED_MESSAGE}</p>
        <p className="text-sm text-muted-foreground">
          This interview has been closed and cannot be continued.
        </p>
      </CardContent>
    </Card>
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
