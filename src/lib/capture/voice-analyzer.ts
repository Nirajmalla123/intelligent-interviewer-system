import type { VoiceMetrics } from "@/lib/domain/types";

const SILENCE_RMS = 0.012;

/**
 * Web Audio prosody analysis: RMS energy, autocorrelation pitch, and pause
 * segmentation from the live microphone stream (browser stand-in for Librosa).
 */
export class VoiceAnalyzer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private buffer: Float32Array = new Float32Array(2048);
  private timer: ReturnType<typeof setInterval> | null = null;

  private rms: number[] = [];
  private pitches: number[] = [];
  private frames = 0;
  private silentFrames = 0;
  private pauseCount = 0;
  private inPause = false;
  private readonly frameMs = 50;

  start(stream: MediaStream) {
    const Ctx: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    this.reset();
    this.timer = setInterval(() => this.sample(), this.frameMs);
  }

  private reset() {
    this.rms = [];
    this.pitches = [];
    this.frames = 0;
    this.silentFrames = 0;
    this.pauseCount = 0;
    this.inPause = false;
  }

  private sample() {
    if (!this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.buffer as unknown as Float32Array<ArrayBuffer>);
    const buf = this.buffer;
    let sum = 0;
    for (let i = 0; i < buf.length; i += 1) sum += (buf[i] ?? 0) ** 2;
    const rms = Math.sqrt(sum / buf.length);
    this.frames += 1;
    this.rms.push(rms);

    if (rms < SILENCE_RMS) {
      this.silentFrames += 1;
      if (!this.inPause) {
        this.inPause = true;
        this.pauseCount += 1;
      }
    } else {
      this.inPause = false;
      const pitch = this.detectPitch(buf, this.ctx?.sampleRate ?? 48000);
      if (pitch > 60 && pitch < 400) this.pitches.push(pitch);
    }
  }

  /** Normalised autocorrelation over the 60–400 Hz band. */
  private detectPitch(buf: Float32Array, sampleRate: number): number {
    const minLag = Math.floor(sampleRate / 400);
    const maxLag = Math.floor(sampleRate / 60);
    let bestLag = -1;
    let bestCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let corr = 0;
      for (let i = 0; i < buf.length - lag; i += 2) {
        corr += (buf[i] ?? 0) * (buf[i + lag] ?? 0);
      }
      corr /= buf.length - lag;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    return bestLag > 0 ? sampleRate / bestLag : 0;
  }

  liveLevel(): number {
    const recent = this.rms.slice(-10);
    if (recent.length === 0) return 0;
    return Math.min(1, (recent.reduce((a, b) => a + b, 0) / recent.length) * 12);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.source?.disconnect();
    this.analyser?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.source = null;
  }

  /** `wordCount` comes from the transcript when available, else 0. */
  results(wordCount = 0): VoiceMetrics {
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const energyRms = avg(this.rms);
    const pitchHz = avg(this.pitches);
    const pitchVar = this.pitches.length > 1 ? avg(this.pitches.map((p) => (p - pitchHz) ** 2)) : 0;
    const totalSeconds = (this.frames * this.frameMs) / 1000;
    const pauseSeconds = (this.silentFrames * this.frameMs) / 1000;
    const speakingSeconds = Math.max(totalSeconds - pauseSeconds, 0.5);
    const volumeDb = energyRms > 0 ? 20 * Math.log10(energyRms) : -90;

    const steadyPitch = pitchVar > 0 ? Math.max(0, 1 - Math.sqrt(pitchVar) / 60) : 0.5;
    const loudEnough = Math.min(1, energyRms / 0.08);
    const fluency = Math.max(0, 1 - pauseSeconds / Math.max(totalSeconds, 1));

    return {
      pitchHz,
      pitchVariance: pitchVar,
      energyRms,
      volumeDb,
      speechRateWpm: wordCount > 0 ? (wordCount / speakingSeconds) * 60 : 0,
      pauseCount: this.pauseCount,
      totalPauseSeconds: pauseSeconds,
      voiceConfidence: Math.max(
        0,
        Math.min(1, steadyPitch * 0.35 + loudEnough * 0.35 + fluency * 0.3),
      ),
    };
  }
}
