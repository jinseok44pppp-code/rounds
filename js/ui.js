// Small UI helpers shared by all screens.
import { state } from './store.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12Z"/>',
  cards: '<rect x="3" y="6" width="14" height="14" rx="2.5"/><path d="M7 3h11.5A2.5 2.5 0 0 1 21 5.5V17"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  micOff: '<path d="M3 3l18 18"/><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3"/><path d="M5 11a7 7 0 0 0 11.9 5M19 11a7 7 0 0 1-.4 2.3M12 18v3"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  hangup: '<path d="M3.7 14.6a1.6 1.6 0 0 1-.4-2.1C5.7 9.6 8.7 8 12 8s6.3 1.6 8.7 4.5a1.6 1.6 0 0 1-.4 2.1l-1.9 1.4a1.6 1.6 0 0 1-2-.1l-1-1a1.6 1.6 0 0 1-.4-1.5l.2-.9a9 9 0 0 0-6.4 0l.2.9a1.6 1.6 0 0 1-.4 1.5l-1 1a1.6 1.6 0 0 1-2 .1Z"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z"/>',
  cc: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 10.5a2 2 0 1 0 0 3M16 10.5a2 2 0 1 0 0 3"/>',
  play: '<path d="M7 5v14l11-7Z"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  check: '<path d="M4 12.5 9 17.5 20 6.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1 2.5 2 3-.5-3 0-6 1-8.5Z"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  steth: '<path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M10 13v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11" r="2"/>',
  plane: '<path d="M10.5 13.5 3 11l1.5-1.5 8 1L17 6a2.1 2.1 0 0 1 3 3l-4.5 4.5 1 8L15 23l-2.5-7.5L9 19v2.5L7.5 23l-1-3.5L3 18.5 4.5 17H7l3.5-3.5Z"/>',
  coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
};

export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

export function toast(msg, ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

export function confirmDialog(title, body, okLabel = '확인', danger = false) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3><p>${esc(body)}</p>
      <div class="modal-actions"><button class="btn ghost" data-v="0">취소</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-v="1">${esc(okLabel)}</button></div></div>`;
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (b || e.target === wrap) { wrap.remove(); resolve(b ? b.dataset.v === '1' : false); }
    });
    document.body.appendChild(wrap);
  });
}

// Text-to-speech for review phrases (Web Speech API).
// iPad quirks handled here: silent mode mutes web speech unless the audio session is "playback";
// cancel() immediately followed by speak() can drop the utterance; "Enhanced/Premium" voices
// may be listed but not downloaded and then play nothing, so we only pick built-in compact voices.
let enVoice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const want = state.settings.accent === 'british' ? 'en-GB' : 'en-US';
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-') === want && v.localService !== false);
  enVoice = vs.find((v) => v.default) || vs.find((v) => /^(Samantha|Daniel|Karen|Moira)$/i.test(v.name)) ||
    vs.find((v) => !/enhanced|premium|siri|novelty|bells|bubbles|boing|whisper|zarvox|trinoids|organ|cellos|jester|superstar|bad news|good news|albert|fred|junior|ralph|kathy|wobble/i.test(v.name)) || null;
}
if ('speechSynthesis' in window) {
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
  pickVoice();
}

let speakTimer = null;
export function speak(text) {
  if (!('speechSynthesis' in window)) return toast('이 브라우저는 음성 읽기를 지원하지 않아요.');
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  const synth = window.speechSynthesis;
  const go = () => {
    if (!enVoice) pickVoice();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = state.settings.accent === 'british' ? 'en-GB' : 'en-US';
    if (enVoice) u.voice = enVoice;
    u.rate = Math.max(0.6, Math.min(1.1, state.settings.speed || 0.9));
    u.volume = 1;
    let started = false;
    u.onstart = () => { started = true; };
    u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') toast(`음성 재생 오류: ${e.error}`); };
    synth.speak(u);
    if (synth.paused) synth.resume();
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => {
      if (!started && !synth.speaking) toast('소리가 안 나면 무음 모드와 볼륨을 확인해주세요.', 3500);
    }, 2500);
  };
  if (synth.speaking || synth.pending) {
    synth.cancel();
    setTimeout(go, 120);
  } else {
    go();
  }
}

export const mmss = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

export function relDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const diff = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  const time = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  if (diff === 0) return `오늘 ${time}`;
  if (diff === 1) return `어제 ${time}`;
  if (diff < 7) return `${diff}일 전`;
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

export function scoreBars(sub, labels) {
  return `<div class="bars">${Object.entries(labels)
    .filter(([k]) => sub && sub[k] != null)
    .map(([k, label]) => {
      const v = Math.max(0, Math.min(10, Number(sub[k]) || 0));
      return `<div class="bar-row"><span>${label}</span><div class="bar"><i style="width:${v * 10}%"></i></div><b>${v}</b></div>`;
    }).join('')}</div>`;
}

export function ring(score, label = '') {
  const s = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  return `<div class="ring" style="--p:${s}"><div><b>${s}</b><small>${esc(label)}</small></div></div>`;
}
