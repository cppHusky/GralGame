export type SoundEffect = 'advance' | 'chalk';

export interface AudioVolumes {
  masterVolume: number;
  bgmVolume: number;
  seVolume: number;
}

export class AudioController {
  private context?: AudioContext;
  private master?: GainNode;
  private bgm?: GainNode;
  private se?: GainNode;
  private oscillators: OscillatorNode[] = [];
  private bedGains: GainNode[] = [];
  private bgmId?: string;
  private volumes: AudioVolumes = {
    masterVolume: 0.7,
    bgmVolume: 0.18,
    seVolume: 0.45,
  };

  async activate() {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return;
    try {
      this.context ??= new AudioContext();
    } catch (error) {
      console.warn('WebAudio 不可用；本场景将以静音继续。', error);
      return;
    }
    if (!this.master) {
      this.master = this.context.createGain();
      this.bgm = this.context.createGain();
      this.se = this.context.createGain();
      this.master.connect(this.context.destination);
      this.bgm.connect(this.master);
      this.se.connect(this.master);
      this.applyVolumes();
      this.startPlaceholderBgm();
    }
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch (error) {
        console.warn('浏览器未允许启动 WebAudio。', error);
      }
    }
  }

  setVolumes(volumes: AudioVolumes) {
    this.volumes = {
      masterVolume: Math.max(0, Math.min(1, volumes.masterVolume)),
      bgmVolume: Math.max(0, Math.min(1, volumes.bgmVolume)),
      seVolume: Math.max(0, Math.min(1, volumes.seVolume)),
    };
    this.applyVolumes();
  }

  play(effect: SoundEffect) {
    const context = this.context;
    const destination = this.se;
    if (!context || !destination || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const now = context.currentTime;
    oscillator.type = effect === 'chalk' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(effect === 'chalk' ? 620 : 760, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      effect === 'chalk' ? 340 : 540,
      now + (effect === 'chalk' ? 0.11 : 0.07),
    );
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(
      effect === 'chalk' ? 0.08 : 0.045,
      now + 0.012,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(now);
    oscillator.stop(now + 0.15);
    oscillator.addEventListener(
      'ended',
      () => {
        oscillator.disconnect();
        envelope.disconnect();
      },
      { once: true },
    );
  }

  private applyVolumes() {
    if (!this.context || !this.master || !this.bgm || !this.se) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.masterVolume, now, 0.04);
    this.bgm.gain.setTargetAtTime(this.volumes.bgmVolume, now, 0.04);
    this.se.gain.setTargetAtTime(this.volumes.seVolume, now, 0.04);
  }

  /**
   * Placeholder ambience until the owner supplies BGM files. Each track id
   * maps to a soft synthetic chord; nothing here ships as recorded audio.
   */
  private startPlaceholderBgm(id = 'classroom_light') {
    if (!this.context || !this.bgm) return;
    this.stopPlaceholderBgm();
    const beds: Record<string, [number, number][]> = {
      classroom_light: [
        [130.81, 0.075],
        [196, 0.035],
        [261.63, 0.02],
      ],
      evening_lake: [
        [110, 0.08],
        [164.81, 0.03],
        [220, 0.018],
      ],
      chalk_quiet: [
        [98, 0.06],
        [146.83, 0.028],
        [196, 0.016],
      ],
    };
    const now = this.context.currentTime;
    for (const [frequency, level] of beds[id] ?? beds.classroom_light ?? []) {
      const oscillator = this.context.createOscillator();
      const tone = this.context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      tone.gain.value = level;
      oscillator.connect(tone);
      tone.connect(this.bgm);
      oscillator.start(now);
      this.oscillators.push(oscillator);
      this.bedGains.push(tone);
    }
  }

  private stopPlaceholderBgm() {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    for (const oscillator of this.oscillators) {
      try {
        oscillator.stop(now + 0.4);
        oscillator.disconnect(now + 0.45);
      } catch {
        // Already stopped by a previous transition.
      }
    }
    this.oscillators = [];
    for (const node of this.bedGains) {
      try {
        node.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    this.bedGains = [];
  }

  /** `id === undefined` fades the ambience out. */
  setBgm(id: string | undefined) {
    if (!this.context || !this.master) return;
    if (id === this.bgmId) return;
    this.bgmId = id;
    if (id) this.startPlaceholderBgm(id);
    else this.stopPlaceholderBgm();
  }

  playEffect(id: string) {
    const presets: Record<
      string,
      {
        type: OscillatorType;
        from: number;
        to: number;
        level: number;
        ms: number;
      }
    > = {
      advance: { type: 'sine', from: 760, to: 540, level: 0.045, ms: 70 },
      page: { type: 'triangle', from: 900, to: 520, level: 0.05, ms: 90 },
      chalk: { type: 'triangle', from: 620, to: 340, level: 0.08, ms: 110 },
      door_slide: {
        type: 'sawtooth',
        from: 220,
        to: 120,
        level: 0.06,
        ms: 260,
      },
      bell: { type: 'sine', from: 880, to: 660, level: 0.07, ms: 420 },
    };
    const preset = presets[id];
    if (preset) this.playPreset(preset);
    else console.info(`尚无音效素材：${id}，本次静默。`);
  }

  private playPreset(preset: {
    type: OscillatorType;
    from: number;
    to: number;
    level: number;
    ms: number;
  }) {
    const context = this.context;
    const destination = this.se;
    if (!context || !destination || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const now = context.currentTime;
    oscillator.type = preset.type;
    oscillator.frequency.setValueAtTime(preset.from, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      preset.to,
      now + preset.ms / 1000,
    );
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(preset.level, now + 0.012);
    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      now + preset.ms / 1000 + 0.05,
    );
    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(now);
    oscillator.stop(now + preset.ms / 1000 + 0.06);
    oscillator.addEventListener(
      'ended',
      () => {
        oscillator.disconnect();
        envelope.disconnect();
      },
      { once: true },
    );
  }
}

export const audio = new AudioController();
