export class AudioManager {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private data: Uint8Array | null = null;

  public active = false;
  public bass = 0;
  public energy = 0;

  async start() {
    if (this.active) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.7;
      this.src = this.ctx.createMediaStreamSource(stream);
      this.src.connect(this.analyser);
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
      this.active = true;
    } catch (e) {
      console.error("Audio init failed", e);
      this.active = false;
    }
  }

  stop() {
    this.active = false;
    if (this.src) {
      this.src.mediaStream.getTracks().forEach(t => t.stop());
      this.src.disconnect();
    }
    if (this.ctx) {
      this.ctx.close();
    }
    this.src = null;
    this.ctx = null;
    this.analyser = null;
    this.bass = 0;
    this.energy = 0;
  }

  update() {
    if (!this.active || !this.analyser || !this.data) return;
    this.analyser.getByteFrequencyData(this.data);
    
    // Bass is roughly first 10 bins (out of 128)
    let sumBass = 0;
    for (let i = 0; i < 10; i++) {
      sumBass += this.data[i];
    }
    this.bass = sumBass / (10 * 255.0); // 0 to 1

    // Overall energy
    let sumTotal = 0;
    for (let i = 0; i < this.data.length; i++) {
      sumTotal += this.data[i];
    }
    this.energy = sumTotal / (this.data.length * 255.0); // 0 to 1
  }
}

export const audioManager = new AudioManager();
