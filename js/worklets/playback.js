// Streaming playback of 24 kHz PCM from Gemini with pitch-preserving speed control (WSOLA),
// then linear resampling to the AudioContext rate.

class Queue {
  constructor(cap) {
    this.buf = new Float32Array(cap);
    this.start = 0; // absolute index of buf[0]
    this.len = 0;
  }
  get end() { return this.start + this.len; }
  push(arr) {
    if (this.len + arr.length > this.buf.length) {
      const next = new Float32Array(Math.max(this.buf.length * 2, this.len + arr.length));
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
    }
    this.buf.set(arr, this.len);
    this.len += arr.length;
  }
  at(abs) { return this.buf[abs - this.start]; }
  // drop everything before absolute index `abs`
  drop(abs) {
    const n = abs - this.start;
    if (n <= 0) return;
    if (n >= this.len) { this.start = abs; this.len = 0; return; }
    this.buf.copyWithin(0, n, this.len);
    this.len -= n;
    this.start = abs;
  }
  clear() { this.start = 0; this.len = 0; }
}

const N = 960;          // 40 ms frame @ 24 kHz
const H = N / 2;        // output hop
const TOL = 240;        // ±10 ms search
const WIN = new Float32Array(N);
for (let i = 0; i < N; i++) WIN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.speed = 1;
    this.step = 24000 / sampleRate;
    this.src = new Queue(24000 * 10);
    this.mid = new Queue(24000 * 4);
    this.olap = new Float32Array(H);
    this.reset();
    this.playing = false;
    this.levelAcc = 0;
    this.levelN = 0;
    this.idleFrames = 0;
    this.port.onmessage = (e) => this.onMsg(e.data);
  }

  reset() {
    this.src.clear();
    this.mid.clear();
    this.olap.fill(0);
    this.aPos = 0;      // nominal analysis position (float, absolute in src)
    this.prevPos = -1;  // actual start of previous frame
    this.rPos = 0;      // read position in mid (float, absolute)
  }

  onMsg(m) {
    if (m.type === 'audio') this.src.push(m.data);
    else if (m.type === 'speed') this.speed = Math.max(0.5, Math.min(1.5, m.value));
    else if (m.type === 'clear') this.reset();
    else if (m.type === 'flush') this.src.push(new Float32Array(N + 2 * TOL));
  }

  // Run WSOLA frames while enough input is available.
  synth() {
    const src = this.src;
    while (true) {
      const nominal = Math.round(this.aPos);
      if (nominal + TOL + N > src.end) break;
      let best = nominal;
      if (this.prevPos >= 0) {
        const target = this.prevPos + H;
        if (Math.abs(nominal - target) >= 1) {
          let bestScore = -Infinity;
          const lo = Math.max(src.start, nominal - TOL);
          const hi = nominal + TOL;
          for (let c = lo; c <= hi; c += 2) {
            let dot = 0, en = 1e-9;
            for (let k = 0; k < H; k += 2) {
              const a = src.at(c + k);
              dot += a * src.at(target + k);
              en += a * a;
            }
            const score = dot / Math.sqrt(en);
            if (score > bestScore) { bestScore = score; best = c; }
          }
        } else {
          best = target;
        }
      }
      const out = new Float32Array(H);
      for (let i = 0; i < H; i++) out[i] = this.olap[i] + src.at(best + i) * WIN[i];
      for (let i = 0; i < H; i++) this.olap[i] = src.at(best + H + i) * WIN[H + i];
      this.mid.push(out);
      this.prevPos = best;
      this.aPos += H * this.speed;
      const keep = Math.min(this.prevPos + H, Math.round(this.aPos) - TOL) - 64;
      if (keep - src.start > 24000) src.drop(keep);
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    this.synth();
    const mid = this.mid;
    let produced = 0;
    for (let i = 0; i < out.length; i++) {
      const p = Math.floor(this.rPos);
      if (p + 1 >= mid.end) { out[i] = 0; continue; }
      const f = this.rPos - p;
      const v = mid.at(p) * (1 - f) + mid.at(p + 1) * f;
      out[i] = v;
      this.levelAcc += v * v;
      produced++;
      this.rPos += this.step;
    }
    if (this.rPos - mid.start > 24000) mid.drop(Math.floor(this.rPos) - 1);
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);

    if (produced > 0) {
      this.idleFrames = 0;
      if (!this.playing) { this.playing = true; this.port.postMessage({ type: 'state', playing: true }); }
    } else if (this.playing && ++this.idleFrames > 40) { // ~100 ms of silence
      this.playing = false;
      this.port.postMessage({ type: 'state', playing: false });
    }
    this.levelN += out.length;
    if (this.levelN >= 2048) {
      this.port.postMessage({ type: 'level', rms: Math.sqrt(this.levelAcc / this.levelN) });
      this.levelAcc = 0;
      this.levelN = 0;
    }
    return true;
  }
}
registerProcessor('playback-processor', PlaybackProcessor);
