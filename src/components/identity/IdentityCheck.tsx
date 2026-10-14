import { Button } from "@/components/ui/button";
import { getMyIdentityStatus, verifyMyIdentity } from "@/lib/interview.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, ScanFace, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Live face verification: captures a webcam frame, confirms one real live face,
 * and stores it as the reference checked continuously during the interview.
 */
export function IdentityCheck({ onChange }: { onChange: (verified: boolean) => void }) {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getMyIdentityStatus);
  const verify = useServerFn(verifyMyIdentity);
  const status = useQuery({
    queryKey: ["identity-status"],
    queryFn: () => fetchStatus(),
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const verified = status.data?.verified ?? false;
  useEffect(() => onChange(verified), [verified, onChange]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };
  useEffect(() => stopCamera, []);

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
      const result = await verify({ data: { image } });
      setMessage(result.reason);
      if (result.verified) {
        stopCamera();
        await queryClient.invalidateQueries({ queryKey: ["identity-status"] });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  if (status.isLoading) return <Loader2 className="size-4 animate-spin text-primary" />;

  if (verified) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-primary/40 p-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>Identity verified — your live face is registered for this interview.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-destructive/50 p-3 text-sm">
      <div className="flex items-start gap-2 text-destructive">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          Verify your identity with a live face check before starting.
        </p>
      </div>
      {(
        <>
          {cameraOn && (
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-video w-full scale-x-[-1] rounded-md border border-border bg-muted object-cover"
            />
          )}
          {cameraOn ? (
            <Button className="w-full" onClick={() => void capture()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ScanFace className="mr-2 size-4" />}
              {busy ? "Verifying your face…" : "Capture & verify"}
            </Button>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => void openCamera()}>
              <Camera className="mr-2 size-4" /> Start face verification
            </Button>
          )}
        </>
      )}
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
