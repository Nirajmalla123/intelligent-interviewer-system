import { Button } from "@/components/ui/button";
import { checkMyIdentity, getMyIdentityStatus, verifyMyIdentity } from "@/lib/interview.functions";
import type { FaceAnalyzer } from "@/lib/capture/face-analyzer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, ScanFace, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Live face verification: captures a webcam frame, confirms one real live face,
 * and stores it as the reference checked continuously during the interview.
 * In "login" mode, a candidate who already has a live photo is compared against it.
 */
export function IdentityCheck({
  onChange,
  allowRetake = false,
  mode = "enroll",
}: {
  onChange?: (verified: boolean) => void;
  allowRetake?: boolean;
  mode?: "enroll" | "login";
}) {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getMyIdentityStatus);
  const verify = useServerFn(verifyMyIdentity);
  const compare = useServerFn(checkMyIdentity);
  const status = useQuery({
    queryKey: ["identity-status"],
    queryFn: () => fetchStatus(),
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyzerRef = useRef<FaceAnalyzer | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loginPassed, setLoginPassed] = useState(false);

  const compareMode = mode === "login" && (status.data?.hasReference ?? false);
  const verified = mode === "login" ? loginPassed : (status.data?.verified ?? false);
  useEffect(() => onChange?.(verified), [verified, onChange]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };
  useEffect(
    () => () => {
      stopCamera();
      analyzerRef.current?.close();
    },
    [],
  );

  async function openCamera() {
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      setCameraOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      });
      // On-device face counter, used when the AI check is unavailable.
      if (!analyzerRef.current) {
        void import("@/lib/capture/face-analyzer").then(async ({ FaceAnalyzer }) => {
          const analyzer = new FaceAnalyzer();
          await analyzer.init();
          analyzerRef.current = analyzer;
        }).catch(() => undefined);
      }
    } catch {
      setMessage("Camera access is required to verify your identity.");
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    setBusy(true);
    setMessage(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/jpeg", 0.85);
      const localFaceCount = analyzerRef.current?.countFaces(video) ?? -1;
      const result = compareMode
        ? await compare({ data: { image } })
        : await verify({ data: { image, localFaceCount } });
      setMessage(result.reason);
      if (result.verified) {
        stopCamera();
        if (mode === "login") setLoginPassed(true);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["identity-status"] }),
          queryClient.invalidateQueries({ queryKey: ["account"] }),
        ]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  if (status.isLoading) return <Loader2 className="size-4 animate-spin text-primary" />;

  if (verified && !cameraOn) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-primary/40 p-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex-1 space-y-2">
          <p>Identity verified — your live face is registered as your profile picture.</p>
          {allowRetake && (
            <Button size="sm" variant="outline" onClick={() => void openCamera()}>
              <Camera className="mr-2 size-4" /> Capture/Update Profile Photo
            </Button>
          )}
        </div>
      </div>
    );
  }

  const prompt = verified
    ? "Look at the camera and capture a new live photo to update your profile picture."
    : compareMode
      ? "Look at the camera. Your face is compared with your registered live photo."
      : "Capture a live photo of your face. It becomes your profile picture and is used to verify you.";

  return (
    <div className={`space-y-3 rounded-md border p-3 text-sm ${verified ? "border-primary/40" : "border-destructive/50"}`}>
      <div className={`flex items-start gap-2 ${verified ? "" : "text-destructive"}`}>
        {verified ? <Camera className="mt-0.5 size-4 shrink-0 text-primary" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0" />}
        <p>{prompt}</p>
      </div>
      {cameraOn && (
        <video
          ref={videoRef}
          muted
          playsInline
          className="aspect-video w-full scale-x-[-1] rounded-md border border-border bg-muted object-cover"
        />
      )}
      {cameraOn ? (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => void capture()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ScanFace className="mr-2 size-4" />}
            {busy
              ? "Verifying your face…"
              : compareMode
                ? "Capture & verify my face"
                : verified
                  ? "Capture & update photo"
                  : "Capture & save photo"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={stopCamera}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => void openCamera()}>
          <Camera className="mr-2 size-4" />{" "}
          {compareMode ? "Open camera to verify my face" : "Capture/Update Profile Photo"}
        </Button>
      )}
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
