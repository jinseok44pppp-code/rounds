// Mic capture: downsample to 16 kHz mono Int16 and post ~40 ms chunks to the main thread.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.phase = 0;
    this.sum = 0;
    this.cnt = 0;
    this.chunk = new Int16Array(640); // 40 ms @ 16 kHz
    this.idx = 0;
    this.energy = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.sum += ch[i];
      this.cnt++;
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        let v = this.sum / this.cnt;
        this.sum = 0;
        this.cnt = 0;
        if (v > 1) v = 1;
        else if (v < -1) v = -1;
        this.energy += v * v;
        this.chunk[this.idx++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.idx === this.chunk.length) {
          const rms = Math.sqrt(this.energy / this.chunk.length);
          const out = this.chunk;
          this.port.postMessage({ pcm: out, rms }, [out.buffer]);
          this.chunk = new Int16Array(640);
          this.idx = 0;
          this.energy = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
