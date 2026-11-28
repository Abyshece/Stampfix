// Generated ambience: wind for the tornado, a low drone and rushing air for the tunnel.
// Nothing is downloaded; it is all made with the Web Audio API.

export class Ambience {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.world = 'tornado';
  }

  init() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown noise
      d[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;

    this.band = ctx.createBiquadFilter();
    this.band.type = 'bandpass';
    this.band.frequency.value = 420;
    this.band.Q.value = 0.7;
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.13;
    const sweepAmt = ctx.createGain();
    sweepAmt.gain.value = 180;
    sweep.connect(sweepAmt).connect(this.band.frequency);

    this.wind = ctx.createGain();
    this.wind.gain.value = 0.6;
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.07;
    const gustAmt = ctx.createGain();
    gustAmt.gain.value = 0.22;
    gust.connect(gustAmt).connect(this.wind.gain);

    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 260;
    [55, 55.4, 82.6].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(low);
      o.start();
    });
    low.connect(this.drone);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    noise.connect(this.band).connect(this.wind).connect(this.master);
    this.drone.connect(this.master);
    this.master.connect(ctx.destination);
    noise.start();
    sweep.start();
    gust.start();
    this.setWorld(this.world);
  }

  async toggle() {
    try {
      if (!this.ctx) this.init();
      const now = this.ctx.currentTime;
      this.on = !this.on;
      if (this.on) await this.ctx.resume();
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.on ? 0.5 : 0, now, 0.4);
    } catch {
      this.on = false;
    }
    return this.on;
  }

  setWorld(name) {
    this.world = name;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.wind.gain.setTargetAtTime(name === 'tornado' ? 0.6 : 0.25, now, 0.6);
    this.drone.gain.setTargetAtTime(name === 'tornado' ? 0 : 0.05, now, 0.6);
  }

  setSpeed(v) {
    if (!this.ctx || !this.on) return;
    const f = this.world === 'tunnel' ? 300 + Math.min(v, 24) * 55 : 420;
    this.band.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.3);
  }
}
