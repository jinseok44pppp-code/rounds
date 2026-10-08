// Real-time voice session with the Gemini Live API over a raw WebSocket.

const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const MAX_VOICED_SAMPLES = 16000 * 60 * 6; // keep up to 6 min of the learner's voiced audio

function int16ToBase64(int16) {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToFloat32(b64) {
  const bin = atob(b64);
  const n = bin.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    out[i] = v / 0x8000;
  }
  return out;
}

export function pcm16ToWavBase64(chunks, rate = 16000) {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const buf = new ArrayBuffer(44 + total * 2);
  const dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + total * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, total * 2, true);
  let off = 44;
  for (const c of chunks) { new Int16Array(buf, off, c.length).set(c); off += c.length * 2; }
  return int16ToBase64(new Int16Array(buf, 0, buf.byteLength >> 1));
}

export class LiveSession {
  /**
   * @param {object} o
   * @param {string} o.apiKey
   * @param {string} o.model
   * @param {string} o.systemInstruction
   * @param {string} o.voice
   * @param {number} o.speed  playback speed factor (0.7–1.2)
   * @param {number} o.silenceMs  how long the learner can pause before the AI takes the turn
   * @param {string} [o.kickoff]  text sent right after setup so the AI speaks first
   * @param {(type:string, data?:any)=>void} o.onEvent
   */
  constructor(o) {
    this.o = o;
    this.onEvent = o.onEvent || (() => {});
    this.ws = null;
    this.ctx = null;
    this.ended = false;
    this.ready = false;
    this.muted = false;
    this.aiPlaying = false;
    this.resumeHandle = null;
    this.reconnects = 0;
    this.voiced = [];
    this.voicedLen = 0;
    this.hangover = 0;
  }

  // Must be called from a user gesture (iOS needs it to unlock audio).
  async start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const resumeP = this.ctx.resume();
    const micP = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    await resumeP;
    const base = new URL('./worklets/', import.meta.url);
    await this.ctx.audioWorklet.addModule(new URL('capture.js', base));
    await this.ctx.audioWorklet.addModule(new URL('playback.js', base));
    this.stream = await micP;
    if (this.ended) { this.stream.getTracks().forEach((t) => t.stop()); return; }

    this.player = new AudioWorkletNode(this.ctx, 'playback-processor', { numberOfInputs: 0, outputChannelCount: [1] });
    this.player.connect(this.ctx.destination);
    this.player.port.postMessage({ type: 'speed', value: this.o.speed });
    this.player.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'state') { this.aiPlaying = m.playing; this.onEvent('ai-playing', m.playing); }
      else if (m.type === 'level') this.onEvent('ai-level', m.rms);
    };

    this.micSrc = this.ctx.createMediaStreamSource(this.stream);
    this.capture = new AudioWorkletNode(this.ctx, 'capture-processor');
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.micSrc.connect(this.capture);
    this.capture.connect(sink).connect(this.ctx.destination);
    this.capture.port.onmessage = (e) => this.onMic(e.data.pcm, e.data.rms);

    this.connect();
  }

  connect() {
    this.ready = false;
    const ws = new WebSocket(`${WS_URL}?key=${encodeURIComponent(this.o.apiKey)}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ setup: this.setupMessage() }));
    ws.onmessage = (ev) => {
      const text = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      this.onServer(msg);
    };
    ws.onerror = () => {};
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ready = false;
      if (this.ended) return;
      if (this.resumeHandle && this.reconnects < 3 && ev.code !== 1007 && ev.code !== 1008) {
        this.reconnects++;
        this.onEvent('status', 'reconnecting');
        setTimeout(() => !this.ended && this.connect(), 400);
      } else {
        this.onEvent('closed', { code: ev.code, reason: ev.reason });
      }
    };
  }

  setupMessage() {
    const o = this.o;
    const setup = {
      model: `models/${o.model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: o.voice } } },
      },
      systemInstruction: { parts: [{ text: o.systemInstruction }] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
          silenceDurationMs: o.silenceMs || 900,
        },
      },
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
    };
    return setup;
  }

  onServer(msg) {
    if (msg.setupComplete) {
      const first = !this.everReady;
      this.ready = true;
      this.everReady = true;
      this.onEvent('status', 'live');
      if (first && this.o.kickoff) this.sendText(this.o.kickoff);
      return;
    }
    if (msg.sessionResumptionUpdate) {
      const u = msg.sessionResumptionUpdate;
      if (u.resumable && u.newHandle) this.resumeHandle = u.newHandle;
    }
    if (msg.goAway) this.onEvent('goaway', msg.goAway);
    const sc = msg.serverContent;
    if (!sc) return;
    if (sc.interrupted) {
      this.player.port.postMessage({ type: 'clear' });
      this.onEvent('interrupted');
    }
    if (sc.inputTranscription && sc.inputTranscription.text) this.onEvent('user-text', sc.inputTranscription.text);
    if (sc.outputTranscription && sc.outputTranscription.text) this.onEvent('ai-text', sc.outputTranscription.text);
    if (sc.modelTurn && sc.modelTurn.parts) {
      for (const p of sc.modelTurn.parts) {
        if (p.inlineData && p.inlineData.data && /audio/.test(p.inlineData.mimeType || 'audio')) {
          const f = base64ToFloat32(p.inlineData.data);
          this.player.port.postMessage({ type: 'audio', data: f }, [f.buffer]);
        }
      }
    }
    if (sc.turnComplete) {
      this.player.port.postMessage({ type: 'flush' });
      this.onEvent('turn-complete');
    }
  }

  onMic(pcm, rms) {
    this.onEvent('mic-level', this.muted ? 0 : rms);
    if (this.muted) pcm.fill(0);
    // Keep the learner's own voice (not silence, not the AI echo) for pronunciation feedback.
    if (!this.muted && !this.aiPlaying && this.voicedLen < MAX_VOICED_SAMPLES) {
      if (rms > 0.012) this.hangover = 8;
      if (this.hangover > 0) {
        this.hangover--;
        this.voiced.push(pcm.slice());
        this.voicedLen += pcm.length;
      }
    }
    if (this.ready && this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: int16ToBase64(pcm) } } }));
    }
  }

  sendText(text) {
    if (this.ready && this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ realtimeInput: { text } }));
    }
  }

  setSpeed(v) {
    this.o.speed = v;
    if (this.player) this.player.port.postMessage({ type: 'speed', value: v });
  }

  setMuted(m) { this.muted = m; }

  voicedSeconds() { return this.voicedLen / 16000; }

  userAudioWav() { return this.voicedLen > 16000 ? pcm16ToWavBase64(this.voiced) : null; }

  async stop() {
    this.ended = true;
    this.ready = false;
    try { this.ws && this.ws.close(); } catch {}
    try { this.stream && this.stream.getTracks().forEach((t) => t.stop()); } catch {}
    try { this.ctx && (await this.ctx.close()); } catch {}
  }
}
