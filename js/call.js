// Call screen: pre-call card, live conversation, and post-call analysis.
import { state, save, uid, addCards, dueCards } from './store.js';
import { LiveSession } from './live.js';
import { generateJSON } from './gemini.js';
import {
  SCENARIOS, START_SPEED, SILENCE_MS, LEVEL_INFO, cefrToNum, levelNumToCefr,
  buildConversationPrompt, buildLevelTestPrompt, CALL_KICKOFF, LEVEL_TEST_KICKOFF, WRAP_UP,
  levelEvalRequest, sessionReviewRequest, liveFeedbackRequest, hintRequest,
} from './prompts.js';
import { esc, icon, toast, confirmDialog, mmss, speak } from './ui.js';

let active = null; // the running call controller

export function stopActiveCall() {
  if (active) { active.abort(); active = null; }
}

const LEVEL_TEST = {
  id: 'level-test', title: '레벨 테스트', en: 'Speaking placement interview',
  desc: '시험관 Alex와 6분 정도 영어로 대화해요. 일상 질문부터 시작해서 점점 어려워져요. 틀려도 괜찮으니 편하게, 최대한 많이 말해보세요.',
  aiName: 'Alex', aiSub: 'Speaking examiner',
};

function scenarioMeta(sc) {
  const m = sc.ai.match(/^(Dr\. [A-Z][a-z]+ [A-Z][a-z]+|[A-Z][a-z]+(?: [A-Z][a-z]+)?)/);
  let name = m ? m[1] : 'Partner';
  if (/^(First|A |An )/.test(sc.ai)) name = sc.cat === 'travel' ? 'Staff' : 'Partner';
  return { aiName: name, aiSub: sc.en };
}

const initials = (n) => n.replace(/^Dr\. /, '').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function renderCall(root, scenarioId) {
  const isTest = scenarioId === 'level-test';
  const sc = isTest ? LEVEL_TEST : SCENARIOS.find((s) => s.id === scenarioId);
  if (!sc) { location.hash = '#/practice'; return; }
  const meta = isTest ? LEVEL_TEST : scenarioMeta(sc);
  const s = state.settings;
  const minutes = isTest ? 7 : s.sessionMinutes;
  const reviewItems = sc.review ? [...new Set(dueCards().concat(state.cards).map((c) => c.back))].slice(0, 8) : [];

  root.innerHTML = `
  <div class="call precall">
    <button class="icon-btn back-btn" data-act="back" aria-label="뒤로">${icon('back')}</button>
    <div class="precall-card">
      <div class="avatar big">${esc(initials(meta.aiName))}</div>
      <p class="eyebrow">${esc(sc.en)}</p>
      <h1>${esc(sc.title)}</h1>
      <p class="muted">${esc(sc.desc)}</p>
      ${sc.review && !reviewItems.length ? '<p class="note warn">아직 복습 카드가 없어요. 대화를 몇 번 하고 나면 이 모드가 더 유용해져요.</p>' : ''}
      <ul class="precall-facts">
        <li>${icon('clock')}<span>${minutes}분 대화</span></li>
        <li>${icon('volume')}<span>AI 말하기 속도 ${s.speed.toFixed(2)}×</span></li>
        <li>${icon('target')}<span>${isTest ? '결과로 수업 난이도를 정해요' : `${esc(state.profile.cefr)} 수준에 맞춰 대화`}</span></li>
      </ul>
      <button class="btn call-start" data-act="start">${icon('phone')} 통화 시작</button>
      <p class="tiny muted">이어폰을 쓰면 AI 목소리가 마이크로 다시 들어가지 않아 더 정확해요.</p>
    </div>
  </div>`;

  root.querySelector('[data-act=back]').onclick = () => history.back();
  root.querySelector('[data-act=start]').onclick = () => {
    active = new CallController(root, sc, meta, isTest, minutes, reviewItems);
    active.start();
  };
}

class CallController {
  constructor(root, sc, meta, isTest, minutes, reviewItems) {
    Object.assign(this, { root, sc, meta, isTest, minutes, reviewItems });
    this.tx = [];
    this.startedAt = 0;
    this.wrapSent = false;
    this.ended = false;
    this.feedbackBusy = false;
    this.slowerTaps = 0;
    this.hints = 0;
    this.closing = false;
    this.levels = { ai: 0, mic: 0 };
  }

  start() {
    const s = state.settings;
    const profile = state.profile;
    this.speed = s.speed;
    const system = this.isTest
      ? buildLevelTestPrompt(profile, s)
      : buildConversationPrompt(this.sc, profile, s, this.reviewItems);
    this.renderShell();
    this.live = new LiveSession({
      apiKey: s.apiKey,
      model: s.liveModel,
      systemInstruction: system,
      voice: s.voice,
      speed: this.speed,
      silenceMs: this.isTest ? 1300 : SILENCE_MS[profile.cefr] || 1000,
      kickoff: this.isTest ? LEVEL_TEST_KICKOFF : CALL_KICKOFF,
      onEvent: (t, d) => this.onEvent(t, d),
    });
    this.live.start().catch((e) => this.fail(e));
    this.raf = requestAnimationFrame(() => this.animate());
  }

  renderShell() {
    const s = state.settings;
    this.subs = s.subtitles;
    this.root.innerHTML = `
    <div class="call live ${this.subs ? '' : 'nosubs'}">
      <header class="call-top">
        <div><p class="eyebrow">${esc(this.sc.en)}</p><h2>${esc(this.sc.title)}</h2></div>
        <div class="call-meta"><span class="chip status" data-el="status">연결 중…</span><span class="timer" data-el="timer">0:00 / ${this.minutes}:00</span></div>
      </header>
      <div class="call-body">
        <section class="stage">
          <div class="orb-wrap" data-el="orbwrap">
            <div class="orb-glow"></div>
            <div class="avatar orb">${esc(initials(this.meta.aiName))}</div>
          </div>
          <p class="who">${esc(this.meta.aiName)}</p>
          <p class="state-label" data-el="state">연결하는 중이에요</p>
          <p class="caption" data-el="caption"></p>
          <div class="hint-sheet" data-el="hints" hidden></div>
          <div class="controls">
            <button class="ctl" data-act="mute" aria-label="마이크 끄기">${icon('mic')}<span>음소거</span></button>
            <div class="ctl speed">
              <button data-act="slower" aria-label="느리게">${icon('minus')}</button>
              <div><b data-el="speed">${this.speed.toFixed(2)}×</b><span>속도</span></div>
              <button data-act="faster" aria-label="빠르게">${icon('plus')}</button>
            </div>
            <button class="ctl" data-act="hint">${icon('bulb')}<span>말문 막힘</span></button>
            <button class="ctl ${this.subs ? 'on' : ''}" data-act="subs">${icon('cc')}<span>자막</span></button>
            <button class="ctl end" data-act="end" aria-label="통화 종료">${icon('hangup')}<span>종료</span></button>
          </div>
        </section>
        <aside class="side">
          <div class="side-head"><h3>대화 기록</h3>${s.liveFeedback && !this.isTest ? '<span class="tiny muted">어색한 표현은 바로 아래에 교정돼요</span>' : ''}</div>
          <div class="tx" data-el="tx"><p class="empty muted">대화가 시작되면 여기에 표시돼요.</p></div>
        </aside>
      </div>
    </div>`;
    const $ = (k) => this.root.querySelector(`[data-el=${k}]`);
    this.el = { status: $('status'), timer: $('timer'), state: $('state'), caption: $('caption'), tx: $('tx'), speed: $('speed'), hints: $('hints'), orb: $('orbwrap') };
    this.root.querySelector('.call').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.onAction(b.dataset.act, b);
    });
  }

  onAction(act, btn) {
    if (act === 'mute') {
      this.muted = !this.muted;
      this.live.setMuted(this.muted);
      btn.classList.toggle('on', this.muted);
      btn.innerHTML = `${icon(this.muted ? 'micOff' : 'mic')}<span>${this.muted ? '음소거됨' : '음소거'}</span>`;
    } else if (act === 'slower' || act === 'faster') {
      const d = act === 'slower' ? -0.05 : 0.05;
      this.speed = Math.round(Math.max(0.7, Math.min(1.2, this.speed + d)) * 100) / 100;
      if (act === 'slower') this.slowerTaps++;
      this.live.setSpeed(this.speed);
      this.el.speed.textContent = `${this.speed.toFixed(2)}×`;
      state.settings.speed = this.speed;
      save();
    } else if (act === 'subs') {
      this.subs = !this.subs;
      btn.classList.toggle('on', this.subs);
      this.root.querySelector('.call').classList.toggle('nosubs', !this.subs);
    } else if (act === 'hint') {
      this.showHints();
    } else if (act === 'end') {
      this.finish();
    } else if (act === 'close-hints') {
      this.el.hints.hidden = true;
    }
  }

  onEvent(type, d) {
    if (this.ended) return;
    if (type === 'status') {
      if (d === 'live') {
        if (!this.startedAt) {
          this.startedAt = Date.now();
          this.tick = setInterval(() => this.onTick(), 500);
        }
        this.setStatus('통화 중', 'live');
        this.el.state.textContent = '상대가 말을 시작해요…';
      } else if (d === 'reconnecting') this.setStatus('재연결 중…', 'warn');
    } else if (type === 'ai-text') {
      this.append('ai', d);
      if (this.isTest && /end of the test/i.test(this.lastAi())) this.closing = true;
    } else if (type === 'user-text') {
      this.append('user', d);
    } else if (type === 'ai-playing') {
      this.el.state.textContent = d ? `${this.meta.aiName} 님이 말하는 중` : '듣고 있어요. 편하게 말해보세요';
      this.root.querySelector('.call')?.classList.toggle('ai-speaking', d);
      if (!d && this.closing) setTimeout(() => this.finish(true), 1200);
    } else if (type === 'ai-level') this.levels.ai = d;
    else if (type === 'mic-level') this.levels.mic = d;
    else if (type === 'interrupted') this.el.caption.textContent = '';
    else if (type === 'goaway') this.setStatus('곧 재연결돼요', 'warn');
    else if (type === 'closed') {
      if (this.tx.some((t) => t.role === 'user')) {
        toast('연결이 끊어졌어요. 지금까지의 대화를 분석할게요.');
        this.finish(true);
      } else {
        this.fail(new Error(d.reason || `연결이 종료됐어요 (코드 ${d.code})`));
      }
    }
  }

  setStatus(text, cls) {
    this.el.status.textContent = text;
    this.el.status.className = `chip status ${cls || ''}`;
  }

  onTick() {
    const el = (Date.now() - this.startedAt) / 1000;
    this.el.timer.textContent = `${mmss(el)} / ${this.minutes}:00`;
    const limit = this.minutes * 60;
    if (!this.wrapSent && el >= limit - 60) {
      this.wrapSent = true;
      this.live.sendText(this.isTest ? '(App: Time is up. Close the interview now with the closing line.)' : WRAP_UP);
      this.el.timer.classList.add('ending');
    }
    if (el >= limit + 120) this.finish(true);
  }

  animate() {
    if (this.ended) return;
    const a = Math.min(1, this.levels.ai * 6);
    const m = Math.min(1, this.levels.mic * 8);
    const orb = this.el.orb;
    if (orb) {
      orb.style.setProperty('--ai', a.toFixed(3));
      orb.style.setProperty('--mic', m.toFixed(3));
    }
    this.raf = requestAnimationFrame(() => this.animate());
  }

  lastAi() {
    for (let i = this.tx.length - 1; i >= 0; i--) if (this.tx[i].role === 'ai') return this.tx[i].text;
    return '';
  }

  append(role, delta) {
    const now = Date.now();
    let last = this.tx[this.tx.length - 1];
    // Late-arriving learner transcription right after the AI started: merge into the learner's previous line.
    if (role === 'user' && last && last.role === 'ai' && now - last.t < 1800) {
      const prev = this.tx[this.tx.length - 2];
      if (prev && prev.role === 'user' && !prev.checked) { prev.text += delta; this.renderTx(); return; }
    }
    if (!last || last.role !== role) {
      last = { role, text: '', t: now };
      this.tx.push(last);
      if (role === 'ai') {
        const prev = this.tx[this.tx.length - 2];
        if (prev && prev.role === 'user') setTimeout(() => this.checkUtterance(prev), 2000);
        this.el.caption.textContent = '';
      }
    }
    last.text += delta;
    if (role === 'ai') this.el.caption.textContent = last.text.trim();
    this.renderTx();
  }

  renderTx() {
    const box = this.el.tx;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = this.tx
      .filter((t) => t.text.trim())
      .map((t) => {
        const fb = t.fb && !t.fb.ok
          ? `<div class="fb"><span class="fb-tag">${icon('sparkle')} 더 자연스럽게</span><p class="fb-better">${esc(t.fb.better)}</p>${t.fb.note_ko ? `<p class="fb-note">${esc(t.fb.note_ko)}</p>` : ''}</div>`
          : '';
        return `<div class="msg ${t.role}"><div class="bubble">${esc(t.text.trim())}</div>${fb}</div>`;
      })
      .join('');
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }

  async checkUtterance(entry) {
    entry.checked = true;
    const s = state.settings;
    if (this.isTest || !s.liveFeedback || this.ended) return;
    const text = entry.text.trim();
    if (text.split(/\s+/).length < 3 || this.feedbackBusy) return;
    this.feedbackBusy = true;
    try {
      const idx = this.tx.indexOf(entry);
      let prevAi = '';
      for (let i = idx - 1; i >= 0; i--) if (this.tx[i].role === 'ai') { prevAi = this.tx[i].text.trim(); break; }
      const { system, prompt } = liveFeedbackRequest(prevAi, text, state.profile);
      const fb = await generateJSON({ apiKey: s.apiKey, model: s.fastModel, system, parts: [{ text: prompt }], temperature: 0.2 });
      if (fb && fb.ok === false && fb.better) { entry.fb = fb; if (!this.ended) this.renderTx(); }
    } catch (e) {
      console.warn('live feedback', e);
    } finally {
      this.feedbackBusy = false;
    }
  }

  async showHints() {
    const box = this.el.hints;
    box.hidden = false;
    box.innerHTML = `<div class="hint-head"><b>${icon('bulb')} 이렇게 말해볼 수 있어요</b><button class="icon-btn" data-act="close-hints" aria-label="닫기">${icon('x')}</button></div><p class="muted tiny">만드는 중…</p>`;
    this.hints++;
    const s = state.settings;
    try {
      const { system, prompt } = hintRequest(this.tx.slice(-6), this.isTest ? null : this.sc, state.profile);
      const r = await generateJSON({ apiKey: s.apiKey, model: s.fastModel, system, parts: [{ text: prompt }], temperature: 0.7 });
      if (box.hidden || this.ended) return;
      box.innerHTML = `<div class="hint-head"><b>${icon('bulb')} 이렇게 말해볼 수 있어요</b><button class="icon-btn" data-act="close-hints" aria-label="닫기">${icon('x')}</button></div>
        ${(r.replies || []).map((x) => `<div class="hint"><p>${esc(x.en)}</p><span>${esc(x.ko)}</span></div>`).join('')}`;
    } catch (e) {
      box.innerHTML = `<div class="hint-head"><b>힌트를 못 만들었어요</b><button class="icon-btn" data-act="close-hints">${icon('x')}</button></div><p class="tiny muted">${esc(e.message)}</p>`;
    }
  }

  fail(e) {
    if (this.ended) return;
    this.ended = true;
    this.cleanup();
    let msg = e && e.message ? e.message : String(e);
    if (e && e.name === 'NotAllowedError') msg = '마이크 권한이 거부됐어요. Safari 설정 > 웹사이트 > 마이크에서 허용해주세요.';
    if (e && e.name === 'NotFoundError') msg = '마이크를 찾지 못했어요. 마이크가 연결돼 있는지 확인해주세요.';
    this.root.innerHTML = `<div class="call precall"><div class="precall-card">
      <h1>통화를 시작하지 못했어요</h1><p class="muted">${esc(msg)}</p>
      <p class="tiny muted">API 키, 인터넷 연결, 설정의 모델 이름을 확인해주세요.</p>
      <div class="row-btns"><button class="btn ghost" onclick="history.back()">돌아가기</button>
      <a class="btn primary" href="#/settings">설정 열기</a></div></div></div>`;
  }

  cleanup() {
    clearInterval(this.tick);
    cancelAnimationFrame(this.raf);
    if (this.live) this.live.stop();
  }

  abort() {
    if (this.ended) return;
    this.ended = true;
    this.cleanup();
  }

  async finish(auto = false) {
    if (this.ended) return;
    const userTurns = this.tx.filter((t) => t.role === 'user' && t.text.trim());
    const words = userTurns.reduce((a, t) => a + t.text.trim().split(/\s+/).length, 0);
    if (!auto) {
      const ok = await confirmDialog('통화를 끝낼까요?', words < 15 ? '아직 대화가 짧아서 분석 없이 종료돼요.' : '대화를 분석해서 복습 노트를 만들어 드릴게요.', '종료');
      if (!ok || this.ended) return;
    }
    this.ended = true;
    const durationSec = this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0;
    const audio = this.live ? this.live.userAudioWav() : null;
    this.cleanup();
    active = null;

    const transcript = this.tx.filter((t) => t.text.trim()).map((t) => ({ role: t.role, text: t.text.trim(), fb: t.fb && !t.fb.ok ? t.fb : undefined }));
    if (words < 15) {
      toast('대화가 너무 짧아서 저장하지 않았어요.');
      location.hash = this.isTest ? '#/onboarding/3' : '#/home';
      return;
    }
    this.root.innerHTML = `<div class="call precall"><div class="precall-card analyzing">
      <div class="spinner"></div><h1>${this.isTest ? '레벨을 분석하고 있어요' : '복습 노트를 만들고 있어요'}</h1>
      <p class="muted" data-el="anamsg">대화 내용${audio ? '과 발음' : ''}을 꼼꼼히 살펴보는 중이에요. 20~40초 정도 걸려요.</p></div></div>`;

    if (this.isTest) await this.processLevelTest(transcript, audio, durationSec);
    else await this.processSession(transcript, audio, durationSec);
  }

  onRetry() {
    const el = this.root.querySelector('[data-el=anamsg]');
    if (el) el.textContent = '서버가 붐벼서 잠시 후 다시 시도하는 중이에요. 조금만 기다려주세요…';
  }

  async processLevelTest(transcript, audio, durationSec) {
    try {
      const test = await analyzeLevelTest(transcript, audio, durationSec, () => this.onRetry());
      location.hash = `#/level/${test.id}`;
    } catch (e) {
      // Keep the transcript so the test can be re-analyzed later even if this screen is closed.
      state.pendingTest = { transcript, durationSec, date: Date.now() };
      save();
      this.showRetry(e, () => this.processLevelTest(transcript, audio, durationSec), null, true);
    }
  }

  async processSession(transcript, audio, durationSec) {
    const s = state.settings;
    const session = {
      id: uid(), date: Date.now(), durationSec, scenarioId: this.sc.id, transcript,
      slowerTaps: this.slowerTaps, hints: this.hints, speedUsed: this.speed, cefrAtTime: state.profile.cefr, review: null,
    };
    state.sessions.unshift(session);
    save();
    try {
      await reviewSession(session, audio, () => this.onRetry());
      location.hash = `#/session/${session.id}`;
    } catch (e) {
      this.showRetry(e, () => this.processSession(transcript, audio, durationSec), session.id);
    }
  }

  showRetry(e, retry, sessionId, isTest) {
    this.root.innerHTML = `<div class="call precall"><div class="precall-card">
      <h1>분석에 실패했어요</h1><p class="muted">${esc(e.message)}</p>
      ${sessionId ? '<p class="tiny muted">대화 기록은 저장됐어요. 나중에 기록 탭에서 다시 분석할 수 있어요.</p>' : ''}
      ${isTest ? '<p class="tiny muted">테스트 대화는 저장해뒀어요. 이 화면을 닫아도 나중에 다시 분석할 수 있어요.</p>' : ''}
      <div class="row-btns"><a class="btn ghost" href="#/home">홈으로</a><button class="btn primary" data-act="retry">다시 시도</button></div></div></div>`;
    this.root.querySelector('[data-act=retry]').onclick = () => {
      if (sessionId) state.sessions = state.sessions.filter((x) => x.id !== sessionId);
      this.root.innerHTML = '<div class="call precall"><div class="precall-card analyzing"><div class="spinner"></div><h1>다시 분석하는 중…</h1><p class="muted" data-el="anamsg">잠시만 기다려주세요.</p></div></div>';
      retry();
    };
  }
}

const analysisModels = () => [state.settings.textModel, state.settings.fastModel];

export async function analyzeLevelTest(transcript, audio, durationSec, onRetry) {
  const s = state.settings;
  const { system, prompt } = levelEvalRequest(transcript, !!audio);
  const parts = [{ text: prompt }];
  if (audio) parts.push({ inlineData: { mimeType: 'audio/wav', data: audio } });
  const r = await generateJSON({ apiKey: s.apiKey, model: analysisModels(), system, parts, attempts: 3, onRetry });
  const cefr = LEVEL_INFO[r.cefr] ? r.cefr : 'B1';
  const test = { id: uid(), date: Date.now(), durationSec, transcript, result: { ...r, cefr } };
  state.levelTests.push(test);
  delete state.pendingTest;
  applyLevel(cefr, true);
  save();
  return test;
}

export function applyLevel(cefr, fromTest) {
  const p = state.profile;
  p.cefr = cefr;
  p.levelNum = cefrToNum(cefr);
  if (fromTest) {
    p.testedAt = Date.now();
    state.settings.speed = START_SPEED[cefr];
  }
}

// Runs the post-call review; also used by "다시 분석" in history (without audio).
export async function reviewSession(session, audio = null, onRetry) {
  const s = state.settings;
  const sc = SCENARIOS.find((x) => x.id === session.scenarioId) || SCENARIOS[0];
  const { system, prompt } = sessionReviewRequest(session.transcript, sc, state.profile, !!audio);
  const parts = [{ text: prompt }];
  if (audio) parts.push({ inlineData: { mimeType: 'audio/wav', data: audio } });
  const r = await generateJSON({ apiKey: s.apiKey, model: analysisModels(), system, parts, attempts: 3, onRetry });
  session.review = r;

  const cards = [];
  for (const c of r.corrections || []) {
    if (c.original && c.better) cards.push({ type: 'fix', front: c.original, back: c.better, note: c.explanation_ko || '' });
  }
  for (const x of r.expressions || []) {
    if (x.phrase) cards.push({ type: 'phrase', front: x.meaning_ko || '', back: x.phrase, note: x.tip_ko || '', example: x.example || '' });
  }
  addCards(cards, session.id);

  // Gradually adapt level and AI speaking speed.
  const p = state.profile;
  const before = { cefr: p.cefr, speed: s.speed };
  if (r.estimated_cefr && LEVEL_INFO[r.estimated_cefr]) {
    p.levelNum = Math.round((p.levelNum * 0.85 + cefrToNum(r.estimated_cefr) * 0.15) * 100) / 100;
    p.cefr = levelNumToCefr(p.levelNum);
  }
  if (s.speedAuto) {
    let d = Number(r.speed_adjust) || 0;
    if (r.comprehension === 'hard') d = Math.min(d, -1);
    if (session.slowerTaps > 0) d = Math.min(d, 0);
    if (d === 0 && r.comprehension === 'easy' && (r.score || 0) >= 80) d = 1;
    const step = 0.025 * Math.sign(d);
    let next = s.speed + step;
    if (step > 0) next = Math.min(next, Math.max(s.speed, 1.0));
    if (step < 0) next = Math.max(next, Math.min(s.speed, 0.8));
    s.speed = Math.round(next * 1000) / 1000;
  }
  session.changes = { cefrFrom: before.cefr, cefrTo: p.cefr, speedFrom: before.speed, speedTo: s.speed };
  save();
  return session;
}

export { speak };
