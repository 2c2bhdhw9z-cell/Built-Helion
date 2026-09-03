export class AudioManager {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private src: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private element: HTMLAudioElement | null = null;
  private data: Uint8Array<ArrayBuffer> | null = null;

  public active = false;
  public mode: "off" | "mic" | "file" = "off";
  public bass = 0;
  public mid = 0;
  public energy = 0;
  public trackName = "";

  private async ensureAnalyser(): Promise<AudioContext> {
    if (this.ctx) return this.ctx;
    this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.7;
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    return this.ctx;
  }

  async start() {
    await this.startMic();
  }

  async startMic() {
    if (this.mode === "mic" && this.active) return;
    this.teardownSource();
    try {
      const ctx = await this.ensureAnalyser();
      if (ctx.state === "suspended") await ctx.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.src = ctx.createMediaStreamSource(this.stream);
      this.src.connect(this.analyser!);
      this.mode = "mic";
      this.trackName = "Microphone";
      this.active = true;
    } catch (e) {
      console.error("Audio init failed", e);
      this.active = false;
      this.mode = "off";
    }
  }

  async startFile(file: File) {
    this.teardownSource();
    try {
      const ctx = await this.ensureAnalyser();
      if (ctx.state === "suspended") await ctx.resume();
      const url = URL.createObjectURL(file);
      const el = new Audio();
      el.src = url;
      el.loop = true;
      el.crossOrigin = "anonymous";
      await el.play();
      this.element = el;
      this.src = ctx.createMediaElementSource(el);
      this.src.connect(this.analyser!);
      this.src.connect(ctx.destination);
      this.mode = "file";
      this.trackName = file.name.slice(0, 48);
      this.active = true;
    } catch (e) {
      console.error("Audio file init failed", e);
      this.active = false;
      this.mode = "off";
    }
  }

  private teardownSource() {
    if (this.src) {
      try {
        this.src.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.element) {
      const src = this.element.src;
      this.element.pause();
      this.element.src = "";
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
      this.element = null;
    }
    this.src = null;
    this.trackName = "";
  }

  stop() {
    this.active = false;
    this.mode = "off";
    this.teardownSource();
    if (this.ctx) {
      void this.ctx.close();
    }
    this.ctx = null;
    this.analyser = null;
    this.bass = 0;
    this.mid = 0;
    this.energy = 0;
  }

  update() {
    if (!this.active || !this.analyser || !this.data) return;
    this.analyser.getByteFrequencyData(this.data);

    let sumBass = 0;
    for (let i = 0; i < 10; i++) sumBass += this.data[i]!;
    this.bass = sumBass / (10 * 255.0);

    let sumMid = 0;
    for (let i = 10; i < 40; i++) sumMid += this.data[i]!;
    this.mid = sumMid / (30 * 255.0);

    let sumTotal = 0;
    for (let i = 0; i < this.data.length; i++) sumTotal += this.data[i]!;
    this.energy = sumTotal / (this.data.length * 255.0);
  }
}

export const audioManager = new AudioManager();
