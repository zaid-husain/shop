import { getSoundPreferencesSync, type SoundPreferences } from "@/hooks/use-sound-preferences";

export type SoundType =
  "payment" | "success" | "sale" | "stock" | "notification" | "warning" | "error" | "completion";

class SoundManagerService {
  private unlocked = false;
  private audioContext: AudioContext | null = null;
  private buffers: Map<SoundType, AudioBuffer> = new Map();
  private lastPlayed: Map<SoundType, number> = new Map();

  // Deduplication interval (e.g. don't play same sound twice within 500ms)
  private readonly THROTTLE_MS = 500;

  constructor() {
    if (typeof window !== "undefined") {
      // Listen for preference changes from other parts of the app
      window.addEventListener("sound-preferences-changed", this.handlePreferencesChanged);

      // Setup interaction listeners to unlock audio context
      const unlock = () => this.unlockAudioContext();
      window.addEventListener("click", unlock, { once: true });
      window.addEventListener("touchstart", unlock, { once: true });
      window.addEventListener("keydown", unlock, { once: true });
    }
  }

  private handlePreferencesChanged = (e: Event) => {
    // We don't strictly need to do anything here because we read sync every time we play,
    // but this could be useful for active adjustments.
  };

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.audioContext) {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          this.audioContext = new AudioContextClass();
        }
      } catch (e) {
        console.warn("AudioContext not supported or blocked", e);
      }
    }
    return this.audioContext;
  }

  private async unlockAudioContext() {
    if (this.unlocked) return;

    const ctx = this.getAudioContext();
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
        this.unlocked = true;
        this.preloadSounds(); // Preload sounds once unlocked
      } catch (e) {
        console.warn("Failed to unlock AudioContext", e);
      }
    } else if (ctx && ctx.state === "running") {
      this.unlocked = true;
      this.preloadSounds();
    }
  }

  private preloadSounds() {
    // Only preload commonly used ones or all if they are very small
    const soundsToPreload: SoundType[] = ["payment", "success", "sale", "error", "stock"];
    soundsToPreload.forEach((s) => this.loadBuffer(s));
  }

  private async loadBuffer(type: SoundType): Promise<AudioBuffer | null> {
    if (this.buffers.has(type)) {
      return this.buffers.get(type)!;
    }

    const ctx = this.getAudioContext();
    if (!ctx) return null;

    try {
      // Assuming assets are in public/sounds/
      const response = await fetch(`/sounds/${type}.mp3`);
      if (!response.ok) throw new Error(`Failed to load ${type}`);

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      this.buffers.set(type, audioBuffer);
      return audioBuffer;
    } catch (error) {
      console.warn(`Error loading sound: ${type}`, error);
      return null;
    }
  }

  public async play(type: SoundType) {
    const prefs = getSoundPreferencesSync();

    if (!prefs.soundEnabled || prefs.volume === 0) {
      return;
    }

    // Deduplication logic
    const now = Date.now();
    const last = this.lastPlayed.get(type) || 0;
    if (now - last < this.THROTTLE_MS) {
      return; // Throttled
    }
    this.lastPlayed.set(type, now);

    const ctx = this.getAudioContext();
    if (!ctx) return;

    // Ensure it's running (might need to resume if it was suspended by browser)
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (e) {
        return; // blocked by browser
      }
    }

    try {
      const buffer = await this.loadBuffer(type);
      if (!buffer) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = ctx.createGain();
      // Linear to exponential volume curve roughly
      gainNode.gain.value = (prefs.volume / 100) * (prefs.volume / 100);

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      source.start(0);
    } catch (e) {
      console.warn(`Failed to play sound ${type}`, e);
    }
  }
}

export const SoundManager = new SoundManagerService();
