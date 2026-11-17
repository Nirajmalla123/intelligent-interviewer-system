import type { EmotionMetrics, FaceMetrics } from "@/lib/domain/types";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

interface Sample {
  detected: boolean;
  yaw: number;
  pitch: number;
  blinking: boolean;
  emotion: { happy: number; sad: number; angry: number; surprise: number; fear: number };
  mouthOpen?: number;
  gazeAway?: boolean;
}

const rad2deg = (r: number) => (r * 180) / Math.PI;

function poseFrom(matrix: number[]): { yaw: number; pitch: number } {
  // Column-major 4x4; r02 = m[8], r12 = m[9], r22 = m[10]
  const r02 = matrix[8] ?? 0;
  const r12 = matrix[9] ?? 0;
  const r22 = matrix[10] ?? 1;
  return {
    yaw: rad2deg(Math.atan2(r02, r22)),
    pitch: rad2deg(Math.asin(Math.max(-1, Math.min(1, -r12)))),
  };
}

const score = (map: Map<string, number>, key: string) => map.get(key) ?? 0;

/**
 * Runs MediaPipe FaceLandmarker on the live video element, sampling ~8 fps.
 * Blendshape channels are mapped to a coarse emotion distribution — the
 * browser-side stand-in for a server DeepFace model.
 */
export class FaceAnalyzer {
  private landmarker: import("@mediapipe/tasks-vision").FaceLandmarker | null = null;
  private samples: Sample[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastBlink = false;
  private blinks = 0;
  private startedAt = 0;
  private faceCount = 0;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private lastTs = 0;

  private detect(video: HTMLVideoElement) {
    if (!this.landmarker || video.readyState < 2) return null;
    const ts = Math.max(performance.now(), this.lastTs + 1);
    this.lastTs = ts;
    const result = this.landmarker.detectForVideo(video, ts);
    this.faceCount = result.faceLandmarks?.length ?? 0;
    return result;
  }

  /** Continuous face-count monitoring (~5 fps), independent of answer sampling. */
  monitor(video: HTMLVideoElement, onCount: (count: number) => void) {
    this.stopMonitor();
    this.monitorTimer = setInterval(() => {
      if (!this.timer) {
        try {
          this.detect(video);
        } catch {
          return;
        }
      }
      onCount(this.faceCount);
    }, 200);
  }

  stopMonitor() {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    this.monitorTimer = null;
  }

  async init() {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 4,
      minFaceDetectionConfidence: 0.6,
      minFacePresenceConfidence: 0.6,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
  }

  /** One-off on-device face count for a single frame (-1 if unavailable). */
  countFaces(video: HTMLVideoElement): number {
    try {
      return this.detect(video) ? this.faceCount : -1;
    } catch {
      return -1;
    }
  }

  start(video: HTMLVideoElement) {
    this.samples = [];
    this.blinks = 0;
    this.lastBlink = false;
    this.startedAt = performance.now();
    this.timer = setInterval(() => this.sample(video), 125);
  }

  private sample(video: HTMLVideoElement) {
    let result: import("@mediapipe/tasks-vision").FaceLandmarkerResult | null;
    try {
      result = this.detect(video);
    } catch {
      return;
    }
    if (!result) return;
    const shapes = result.faceBlendshapes?.[0]?.categories;
    const matrix = result.facialTransformationMatrixes?.[0]?.data;
    if (!shapes || !matrix) {
      this.samples.push({
        detected: false,
        yaw: 0,
        pitch: 0,
        blinking: false,
        emotion: { happy: 0, sad: 0, angry: 0, surprise: 0, fear: 0 },
      });
      return;
    }
    const map = new Map(shapes.map((c) => [c.categoryName, c.score]));
    const { yaw, pitch } = poseFrom(Array.from(matrix));
    const blink =
      (score(map, "eyeBlinkLeft") + score(map, "eyeBlinkRight")) / 2 > 0.5;
    if (blink && !this.lastBlink) this.blinks += 1;
    this.lastBlink = blink;

    const happy = (score(map, "mouthSmileLeft") + score(map, "mouthSmileRight")) / 2;
    const sad =
      (score(map, "mouthFrownLeft") + score(map, "mouthFrownRight")) / 2 * 0.7 +
      score(map, "browInnerUp") * 0.3;
    const angry = (score(map, "browDownLeft") + score(map, "browDownRight")) / 2;
    const surprise =
      (score(map, "browOuterUpLeft") + score(map, "browOuterUpRight")) / 2 * 0.5 +
      score(map, "jawOpen") * 0.5;
    const fear =
      (score(map, "eyeWideLeft") + score(map, "eyeWideRight")) / 2 * 0.6 +
      score(map, "browInnerUp") * 0.4;

    this.samples.push({
      detected: true,
      yaw,
      pitch,
      blinking: blink,
      mouthOpen: score(map, "jawOpen"),
      gazeAway: Math.abs(yaw) > 25 || Math.abs(pitch) > 25 || Math.max(score(map, "eyeLookOutLeft"), score(map, "eyeLookOutRight"), score(map, "eyeLookDownLeft"), score(map, "eyeLookDownRight")) > 0.65,
      emotion: { happy, sad, angry, surprise, fear },
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  close() {
    this.stop();
    this.stopMonitor();
    this.landmarker?.close();
    this.landmarker = null;
  }

  /** Live preview value: share of recent frames with the face looking forward. */
  liveEyeContact(): number {
    const recent = this.samples.slice(-40).filter((s) => s.detected);
    if (recent.length === 0) return 0;
    return (
      recent.filter((s) => Math.abs(s.yaw) < 18 && Math.abs(s.pitch) < 18).length / recent.length
    );
  }

  liveDominantEmotion(): string {
    const recent = this.samples.slice(-40).filter((s) => s.detected);
    if (recent.length === 0) return "neutral";
    const totals = { happy: 0, sad: 0, angry: 0, surprise: 0, fear: 0 };
    for (const s of recent) {
      totals.happy += s.emotion.happy;
      totals.sad += s.emotion.sad;
      totals.angry += s.emotion.angry;
      totals.surprise += s.emotion.surprise;
      totals.fear += s.emotion.fear;
    }
    const best = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
    if (!best || best[1] / recent.length < 0.12) return "neutral";
    return best[0];
  }

  liveIntegritySignals() {
    const recent = this.samples.slice(-4).filter((sample) => sample.detected);
    return {
      facePresent: recent.length >= 3,
      gazeAway: recent.length >= 3 && recent.every((sample) => sample.gazeAway),
      mouthStill: recent.length >= 3 && recent.every((sample) => (sample.mouthOpen ?? 0) < 0.04),
    };
  }

  results(): { face: FaceMetrics; emotion: EmotionMetrics } {
    const total = this.samples.length || 1;
    const detected = this.samples.filter((s) => s.detected);
    const elapsedMin = Math.max((performance.now() - this.startedAt) / 60000, 1 / 60);

    const yaws = detected.map((s) => s.yaw);
    const pitches = detected.map((s) => s.pitch);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const std = (xs: number[]) => {
      if (xs.length < 2) return 0;
      const m = avg(xs);
      return Math.sqrt(avg(xs.map((x) => (x - m) ** 2)));
    };

    const face: FaceMetrics = {
      faceDetectedRatio: detected.length / total,
      eyeContactRatio: detected.length
        ? detected.filter((s) => Math.abs(s.yaw) < 18 && Math.abs(s.pitch) < 18).length /
          detected.length
        : 0,
      headStability: Math.max(0, 1 - (std(yaws) + std(pitches)) / 40),
      blinkRatePerMin: this.blinks / elapsedMin,
      yawAvg: avg(yaws),
      pitchAvg: avg(pitches),
      landmarkSamples: detected.length,
    };

    const sums = { happy: 0, sad: 0, angry: 0, surprise: 0, fear: 0 };
    for (const s of detected) {
      sums.happy += s.emotion.happy;
      sums.sad += s.emotion.sad;
      sums.angry += s.emotion.angry;
      sums.surprise += s.emotion.surprise;
      sums.fear += s.emotion.fear;
    }
    const n = detected.length || 1;
    const raw = {
      happy: sums.happy / n,
      sad: sums.sad / n,
      angry: sums.angry / n,
      surprise: sums.surprise / n,
      fear: sums.fear / n,
    };
    const expressive = Math.min(
      1,
      raw.happy + raw.sad + raw.angry + raw.surprise + raw.fear,
    );
    const neutral = Math.max(0, 1 - expressive);
    const dist = { ...raw, neutral };
    const dominant =
      Object.entries(dist).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";

    return { face, emotion: { ...dist, dominant } };
  }
}
