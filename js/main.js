import { state, save, stats, dueCards, gradeCard, exportData, importData, resetAll } from './store.js';
import { checkApiKey } from './gemini.js';
import { SCENARIOS, CATEGORIES, LEVEL_INFO, VOICES, CEFR, START_SPEED } from './prompts.js';
import { renderCall, stopActiveCall, applyLevel, reviewSession, analyzeLevelTest } from './call.js';
import { esc, icon, toast, confirmDialog, speak, relDate, scoreBars, ring, mmss } from './ui.js';

const root = document.getElementById('view');
const nav = document.getElementById('nav');

const NAV = [
  ['home', '홈', 'home'],
  ['practice', '회화', 'chat'],
  ['review', '복습', 'cards'],
  ['history', '기록', 'clock'],
  ['settings', '설정', 'gear'],
];

const CAT_ICON = { daily: 'coffee', medical: 'steth', travel: 'plane' };
const SUB_LABELS = { fluency: '유창성', grammar: '문법', vocabulary: '어휘', pronunciation: '발음', naturalness: '자연스러움', comprehension: '이해력', interaction: '상호작용' };

function renderNav(current) {
  nav.innerHTML = `<div class="brand"><span class="logo">R</span><span>Rounds</span></div>` +
    NAV.map(([id, label, ic]) => {
      const badge = id === 'review' && dueCards().length ? `<i class="badge">${dueCards().length}</i>` : '';
      return `<a href="#/${id}" class="${current === id ? 'active' : ''}">${icon(ic)}<span>${label}</span>${badge}</a>`;
    }).join('');
}

function route() {
  stopActiveCall();
  speechSynthesis?.cancel?.();
  const hash = location.hash || '#/home';
  const [, name, arg] = hash.match(/^#\/([\w-]+)(?:\/([\w-]+))?/) || [];
  const ready = state.profile && state.settings.apiKey && state.profile.testedAt;
  if (!ready && name !== 'onboarding' && !(name === 'call' && arg === 'level-test') && name !== 'level') {
    location.replace(`#/onboarding/${state.profile ? (state.settings.apiKey ? 3 : 2) : 0}`);
    return;
  }
  const fullscreen = ['onboarding', 'call'].includes(name);
  document.body.classList.toggle('fullscreen', fullscreen);
  if (!fullscreen) renderNav(name);
  root.scrollTop = 0;
  window.scrollTo(0, 0);
  const views = { home, practice, review, history, session, settings, onboarding, level, call: (a) => renderCall(root, a) };
  (views[name] || home)(arg);
}

// ---------------- Home ----------------
function recommend() {
  const last = state.sessions[0];
  const goals = state.profile.goals || { medical: true, travel: true };
  let cat = 'medical';
  if (last) {
    const lastCat = SCENARIOS.find((s) => s.id === last.scenarioId)?.cat;
    cat = lastCat === 'medical' ? 'travel' : 'medical';
  }
  if (!goals[cat]) cat = goals.medical ? 'medical' : goals.travel ? 'travel' : 'daily';
  if (dueCards().length >= 8 && state.sessions.length % 3 === 2) return SCENARIOS.find((s) => s.id === 'review-talk');
  const done = new Set(state.sessions.slice(0, 6).map((s) => s.scenarioId));
  const pool = SCENARIOS.filter((s) => s.cat === cat);
  return pool.find((s) => !done.has(s.id)) || pool[state.sessions.length % pool.length];
}

function home() {
  const p = state.profile;
  const st = stats();
  const due = dueCards().length;
  const rec = recommend();
  const lastReview = state.sessions.find((s) => s.review)?.review;
  const sp = state.settings.speed;
  const spPct = Math.max(0, Math.min(100, ((sp - 0.8) / 0.2) * 100));
  root.innerHTML = `
  <div class="page">
    <header class="page-head">
      <div><p class="eyebrow">${new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}</p>
      <h1>안녕하세요, ${esc(p.name)} 님</h1></div>
    </header>

    <section class="hero-grid">
      <a class="card rec" href="#/call/${rec.id}">
        <div class="rec-top"><span class="chip">${icon(CAT_ICON[rec.cat])} 오늘의 추천</span></div>
        <h2>${esc(rec.title)}</h2>
        <p class="rec-en">${esc(rec.en)}</p>
        <p class="muted">${esc(rec.desc)}</p>
        <span class="btn call-start sm">${icon('phone')} 바로 통화하기</span>
      </a>
      <div class="card level-card">
        <p class="eyebrow">내 레벨</p>
        <div class="level-big"><b>${esc(p.cefr)}</b><span>${esc(LEVEL_INFO[p.cefr].name)}</span></div>
        <p class="muted small">${esc(LEVEL_INFO[p.cefr].desc)}</p>
        <div class="speed-meter">
          <div class="sm-head"><span>AI 말하기 속도</span><b>${sp.toFixed(2)}×</b></div>
          <div class="sm-track"><i style="width:${spPct}%"></i></div>
          <div class="sm-scale"><span>0.8×</span><span>원어민 1.0×</span></div>
        </div>
      </div>
    </section>

    <section class="stat-row">
      <div class="stat">${icon('flame')}<div><b>${st.streak}일</b><span>연속 학습</span></div></div>
      <div class="stat">${icon('clock')}<div><b>${st.weekMin}분</b><span>이번 주 대화</span></div></div>
      <a class="stat link" href="#/review">${icon('cards')}<div><b>${due}개</b><span>복습할 표현</span></div></a>
    </section>

    ${lastReview?.next_focus_ko ? `<section class="card focus">${icon('target')}<div><p class="eyebrow">다음 목표</p><p>${esc(lastReview.next_focus_ko)}</p></div></section>` : ''}

    <section>
      <div class="sec-head"><h3>상황별 회화</h3><a href="#/practice" class="link-btn">전체 보기 ${icon('arrow')}</a></div>
      <div class="cat-grid">
        ${CATEGORIES.map((c) => `<a class="card cat ${c.id}" href="#/practice?cat=${c.id}">${icon(CAT_ICON[c.id])}<b>${c.title}</b><span>${c.desc}</span></a>`).join('')}
      </div>
    </section>

    ${state.sessions.length ? `<section>
      <div class="sec-head"><h3>최근 대화</h3><a href="#/history" class="link-btn">기록 ${icon('arrow')}</a></div>
      <div class="list">${state.sessions.slice(0, 3).map(sessionRow).join('')}</div>
    </section>` : ''}
  </div>`;
}

function sessionRow(s) {
  const sc = SCENARIOS.find((x) => x.id === s.scenarioId);
  const score = s.review?.score;
  return `<a class="row" href="#/session/${s.id}">
    <span class="row-ic ${sc?.cat || ''}">${icon(CAT_ICON[sc?.cat] || 'chat')}</span>
    <div class="row-main"><b>${esc(sc?.title || '대화')}</b><span>${relDate(s.date)} · ${mmss(s.durationSec)}</span></div>
    ${score != null ? `<span class="score-pill">${Math.round(score)}</span>` : '<span class="chip warn">분석 전</span>'}
  </a>`;
}

// ---------------- Practice ----------------
function practice() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const focus = q.get('cat');
  const s = state.settings;
  root.innerHTML = `
  <div class="page">
    <header class="page-head"><div><p class="eyebrow">Conversation</p><h1>어떤 상황을 연습할까요?</h1></div></header>
    <div class="seg-row">
      <span class="muted small">대화 길이</span>
      <div class="seg" data-el="len">${[5, 10, 15].map((m) => `<button data-m="${m}" class="${s.sessionMinutes === m ? 'on' : ''}">${m}분</button>`).join('')}</div>
    </div>
    ${CATEGORIES.map((c) => `
      <section id="cat-${c.id}">
        <div class="sec-head"><h3>${icon(CAT_ICON[c.id])} ${c.title}</h3><span class="muted small">${c.desc}</span></div>
        <div class="sc-grid">
          ${SCENARIOS.filter((x) => x.cat === c.id).map((x) => `
            <a class="card sc ${c.id}" href="#/call/${x.id}">
              <b>${esc(x.title)}</b><span class="sc-en">${esc(x.en)}</span><p>${esc(x.desc)}</p>
            </a>`).join('')}
        </div>
      </section>`).join('')}
  </div>`;
  root.querySelector('[data-el=len]').onclick = (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    s.sessionMinutes = Number(b.dataset.m);
    save();
    root.querySelectorAll('[data-el=len] button').forEach((x) => x.classList.toggle('on', x === b));
  };
  if (focus) document.getElementById(`cat-${focus}`)?.scrollIntoView({ block: 'start' });
}

// ---------------- Review ----------------
function review(arg) {
  if (arg === 'study') return study();
  const due = dueCards();
  const filter = new URLSearchParams(location.hash.split('?')[1] || '').get('f') || 'all';
  const cards = state.cards.filter((c) => filter === 'all' || c.type === filter).slice().reverse();
  root.innerHTML = `
  <div class="page">
    <header class="page-head"><div><p class="eyebrow">Review</p><h1>복습</h1></div></header>
    <section class="card study-cta">
      <div><h2>${due.length ? `오늘 복습할 표현 ${due.length}개` : '오늘 복습은 끝났어요'}</h2>
      <p class="muted">대화에서 나온 교정과 표현을 간격 반복으로 외워요. 소리 내서 말해보는 게 핵심이에요.</p></div>
      <div class="row-btns">
        ${due.length ? `<a class="btn primary" href="#/review/study">${icon('play')} 복습 시작</a>` : ''}
        <a class="btn ghost" href="#/call/review-talk">${icon('phone')} 대화로 복습하기</a>
      </div>
    </section>
    <div class="seg-row"><div class="seg">
      ${[['all', '전체'], ['fix', '교정'], ['phrase', '표현']].map(([k, l]) => `<a href="#/review?f=${k}" class="${filter === k ? 'on' : ''}">${l}</a>`).join('')}
    </div><span class="muted small">${state.cards.length}개</span></div>
    <div class="cards-list">
      ${cards.length ? cards.map((c) => `
        <div class="card item" data-id="${c.id}">
          <div class="item-main">
            ${c.type === 'fix'
              ? `<p class="orig">${esc(c.front)}</p><p class="better">${esc(c.back)}</p>`
              : `<p class="better">${esc(c.back)}</p><p class="ko">${esc(c.front)}</p>`}
            ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
          </div>
          <div class="item-side">
            <button class="icon-btn" data-act="say" aria-label="듣기">${icon('volume')}</button>
            <button class="icon-btn" data-act="del" aria-label="삭제">${icon('trash')}</button>
            <span class="box-dots">${'●'.repeat(c.box)}${'○'.repeat(5 - c.box)}</span>
          </div>
        </div>`).join('') : '<p class="empty muted">아직 카드가 없어요. 회화를 한 번 하면 자동으로 만들어져요.</p>'}
    </div>
  </div>`;
  root.querySelector('.cards-list').onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    const c = state.cards.find((x) => x.id === id);
    if (b.dataset.act === 'say') speak(c.back);
    if (b.dataset.act === 'del' && (await confirmDialog('카드 삭제', '이 카드를 삭제할까요?', '삭제', true))) {
      state.cards = state.cards.filter((x) => x.id !== id);
      save();
      review();
    }
  };
}

function study() {
  const queue = dueCards().sort((a, b) => a.box - b.box || a.due - b.due).slice(0, 20);
  let i = 0, done = 0;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const show = () => {
    if (i >= queue.length) {
      root.innerHTML = `<div class="page narrow"><div class="card done-card">${icon('check', 'big-ic')}<h1>복습 완료!</h1><p class="muted">${done}개를 복습했어요. 오늘 배운 표현을 대화에서 써보면 훨씬 오래 기억나요.</p>
        <div class="row-btns"><a class="btn ghost" href="#/review">복습 목록</a><a class="btn primary" href="#/call/review-talk">${icon('phone')} 대화로 써보기</a></div></div></div>`;
      renderNav('review');
      return;
    }
    const c = queue[i];
    root.innerHTML = `<div class="page narrow">
      <div class="study-top"><a href="#/review" class="icon-btn">${icon('x')}</a><div class="prog"><i style="width:${(i / queue.length) * 100}%"></i></div><span class="muted small">${i + 1}/${queue.length}</span></div>
      <div class="card flash">
        <p class="eyebrow">${c.type === 'fix' ? '더 자연스럽게 고쳐 말해보세요' : '영어로 말해보세요'}</p>
        <p class="flash-front ${c.type === 'fix' ? 'orig' : ''}">${esc(c.front)}</p>
        <div class="said" data-el="said"></div>
        <div class="flash-back" data-el="back" hidden>
          <p class="flash-answer">${esc(c.back)} <button class="icon-btn" data-act="say">${icon('volume')}</button></p>
          ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
          ${c.example ? `<p class="example">“${esc(c.example)}”</p>` : ''}
        </div>
        <div class="flash-actions" data-el="front-actions">
          ${SR ? `<button class="btn ghost" data-act="listen">${icon('mic')} 말해보기</button>` : ''}
          <button class="btn primary" data-act="reveal">정답 보기</button>
        </div>
        <div class="flash-actions" data-el="grade" hidden>
          <button class="btn ghost" data-act="again">다시 볼래요</button>
          <button class="btn primary" data-act="good">${icon('check')} 기억났어요</button>
        </div>
      </div></div>`;
    const $ = (k) => root.querySelector(`[data-el=${k}]`);
    root.querySelector('.flash').onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'reveal') { $('back').hidden = false; $('front-actions').hidden = true; $('grade').hidden = false; speak(c.back); }
      else if (act === 'say') speak(c.back);
      else if (act === 'again' || act === 'good') { gradeCard(c, act === 'good'); done++; i++; show(); }
      else if (act === 'listen') {
        const rec = new SR();
        rec.lang = 'en-US';
        rec.interimResults = true;
        b.disabled = true;
        b.innerHTML = `${icon('mic')} 듣는 중…`;
        rec.onresult = (ev) => {
          const t = Array.from(ev.results).map((r) => r[0].transcript).join(' ');
          $('said').innerHTML = `<span class="tiny muted">내가 말한 것</span><p>${esc(t)}</p>`;
        };
        rec.onend = () => { b.disabled = false; b.innerHTML = `${icon('mic')} 다시 말하기`; };
        rec.onerror = () => toast('음성 인식을 사용할 수 없어요.');
        rec.start();
      }
    };
  };
  if (!queue.length) { location.hash = '#/review'; return; }
  show();
}

// ---------------- History / Session ----------------
function history() {
  const tests = state.levelTests.slice().reverse();
  root.innerHTML = `
  <div class="page">
    <header class="page-head"><div><p class="eyebrow">History</p><h1>대화 기록</h1></div></header>
    ${state.sessions.length ? `<div class="list">${state.sessions.map(sessionRow).join('')}</div>` : '<p class="empty muted">아직 대화 기록이 없어요.</p>'}
    ${tests.length ? `<section><div class="sec-head"><h3>레벨 테스트</h3></div><div class="list">
      ${tests.map((t) => `<a class="row" href="#/level/${t.id}"><span class="row-ic">${icon('target')}</span><div class="row-main"><b>레벨 테스트 · ${esc(t.result.cefr)}</b><span>${relDate(t.date)}</span></div><span class="score-pill">${Math.round(t.result.score || 0)}</span></a>`).join('')}
    </div></section>` : ''}
  </div>`;
}

function session(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) { location.hash = '#/history'; return; }
  const sc = SCENARIOS.find((x) => x.id === s.scenarioId);
  const r = s.review;
  const ch = s.changes;
  const changeNote = ch ? [
    ch.cefrFrom !== ch.cefrTo ? `레벨이 <b>${ch.cefrFrom} → ${ch.cefrTo}</b>로 바뀌었어요.` : '',
    ch.speedTo !== ch.speedFrom ? `다음 대화부터 AI 속도가 <b>${ch.speedFrom.toFixed(2)}× → ${ch.speedTo.toFixed(2)}×</b>로 ${ch.speedTo > ch.speedFrom ? '빨라져요' : '느려져요'}.` : '',
  ].filter(Boolean).join(' ') : '';

  root.innerHTML = `
  <div class="page">
    <header class="page-head"><div><p class="eyebrow">${relDate(s.date)} · ${mmss(s.durationSec)}</p><h1>${esc(sc?.title || '대화')}</h1></div>
      <a class="btn ghost sm" href="#/call/${s.scenarioId}">${icon('refresh')} 다시 하기</a></header>
    ${!r ? `<div class="card"><p>아직 분석되지 않은 대화예요.</p><button class="btn primary" data-act="analyze">분석하기</button></div>` : `
    ${changeNote ? `<div class="card change">${icon('sparkle')}<p>${changeNote}</p></div>` : ''}
    <section class="result-top card">
      ${ring(r.score, '점')}
      <div class="result-sum"><p>${esc(r.summary_ko)}</p>${scoreBars(r.subscores, SUB_LABELS)}</div>
    </section>
    ${r.corrections?.length ? `<section><div class="sec-head"><h3>교정할 표현</h3><span class="muted small">복습 카드에 추가됐어요</span></div>
      <div class="fix-list">${r.corrections.map((c) => `<div class="card fix">
        <p class="orig">${esc(c.original)}</p><p class="better">${esc(c.better)} <button class="icon-btn" data-say="${esc(c.better)}">${icon('volume')}</button></p>
        <p class="note">${esc(c.explanation_ko)}</p></div>`).join('')}</div></section>` : ''}
    ${r.expressions?.length ? `<section><div class="sec-head"><h3>익혀두면 좋은 표현</h3></div>
      <div class="expr-grid">${r.expressions.map((x) => `<div class="card expr">
        <p class="better">${esc(x.phrase)} <button class="icon-btn" data-say="${esc(x.phrase)}">${icon('volume')}</button></p>
        <p class="ko">${esc(x.meaning_ko)}</p>${x.example ? `<p class="example">“${esc(x.example)}”</p>` : ''}${x.tip_ko ? `<p class="note">${esc(x.tip_ko)}</p>` : ''}</div>`).join('')}</div></section>` : ''}
    ${r.pronunciation?.length ? `<section><div class="sec-head"><h3>발음 포인트</h3></div><div class="card"><ul class="plain">
      ${r.pronunciation.map((x) => `<li><b>${esc(x.word)}</b> <button class="icon-btn" data-say="${esc(x.word)}">${icon('volume')}</button> — ${esc(x.tip_ko)}</li>`).join('')}</ul></div></section>` : ''}
    <section class="two-col">
      <div class="card"><h3>잘한 점</h3><ul class="plain">${(r.strengths_ko || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="card"><h3>보완할 점</h3><ul class="plain">${(r.weak_points_ko || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    </section>
    ${r.next_focus_ko ? `<div class="card focus">${icon('target')}<div><p class="eyebrow">다음 목표</p><p>${esc(r.next_focus_ko)}</p></div></div>` : ''}
    `}
    <details class="card transcript"><summary>전체 대화 보기</summary>
      ${s.transcript.map((t) => `<div class="msg ${t.role}"><div class="bubble">${esc(t.text)}</div>${t.fb ? `<div class="fb"><p class="fb-better">${esc(t.fb.better)}</p></div>` : ''}</div>`).join('')}
    </details>
    <div class="row-btns end"><button class="btn ghost danger-text" data-act="delete">${icon('trash')} 기록 삭제</button><a class="btn primary" href="#/review">${icon('cards')} 복습하러 가기</a></div>
  </div>`;
  root.querySelector('.page').onclick = async (e) => {
    const say = e.target.closest('[data-say]');
    if (say) return speak(say.dataset.say);
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'analyze') {
      b.disabled = true;
      b.textContent = '분석 중…';
      try { await reviewSession(s); session(id); } catch (err) { toast(err.message); b.disabled = false; b.textContent = '분석하기'; }
    } else if (b.dataset.act === 'delete' && (await confirmDialog('기록 삭제', '이 대화 기록을 삭제할까요? 복습 카드는 남아요.', '삭제', true))) {
      state.sessions = state.sessions.filter((x) => x.id !== id);
      save();
      location.hash = '#/history';
    }
  };
}

function level(id) {
  const t = state.levelTests.find((x) => x.id === id) || state.levelTests[state.levelTests.length - 1];
  if (!t) { location.hash = '#/home'; return; }
  const r = t.result;
  const info = LEVEL_INFO[r.cefr];
  const isLatest = t === state.levelTests[state.levelTests.length - 1];
  document.body.classList.add('fullscreen');
  root.innerHTML = `
  <div class="page narrow">
    <section class="card level-result">
      <p class="eyebrow">레벨 테스트 결과</p>
      <div class="cefr-ladder">${CEFR.map((c) => `<span class="${c === r.cefr ? 'on' : ''}">${c}</span>`).join('')}</div>
      <h1>${esc(r.cefr)} · ${esc(info.name)}</h1>
      <p class="muted">${esc(info.desc)}</p>
      <p>${esc(r.summary_ko)}</p>
      ${scoreBars(r.subscores, SUB_LABELS)}
      ${isLatest ? `<div class="card inset"><b>수업은 이렇게 맞춰져요</b>
        <ul class="plain"><li>AI 말하기 속도 <b>${START_SPEED[r.cefr].toFixed(2)}×</b>로 시작해서, 잘 알아들으면 원어민 속도(1.0×)까지 조금씩 올려요.</li>
        <li>${esc(r.cefr)} 수준에 맞는 어휘와 문장 길이로 대화해요.</li>
        <li>매 대화가 끝나면 레벨과 속도가 자동으로 조정돼요.</li></ul></div>` : ''}
    </section>
    <section class="two-col">
      <div class="card"><h3>강점</h3><ul class="plain">${(r.strengths_ko || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="card"><h3>먼저 연습할 것</h3><ul class="plain">${(r.focus_ko || r.weaknesses_ko || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    </section>
    ${r.examples?.length ? `<section><div class="sec-head"><h3>이렇게 말하면 더 자연스러워요</h3></div><div class="fix-list">
      ${r.examples.map((c) => `<div class="card fix"><p class="orig">${esc(c.original)}</p><p class="better">${esc(c.better)}</p><p class="note">${esc(c.explanation_ko)}</p></div>`).join('')}</div></section>` : ''}
    <div class="row-btns end"><a class="btn primary big" href="#/home">${icon('arrow')} 회화 수업 시작하기</a></div>
  </div>`;
}

// ---------------- Settings ----------------
function settings() {
  const s = state.settings;
  const p = state.profile;
  const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  root.innerHTML = `
  <div class="page narrow">
    <header class="page-head"><div><p class="eyebrow">Settings</p><h1>설정</h1></div></header>
    <section class="card form">
      <h3>프로필</h3>
      <label>이름<input data-k="p.name" value="${esc(p.name)}"></label>
      <label>상태<input data-k="p.status" value="${esc(p.status || '')}" placeholder="예: 의대생, 내과 전공의"></label>
      <div class="field"><span>현재 레벨</span><div class="inline">
        <select data-k="p.cefr">${CEFR.map((c) => opt(c, p.cefr, `${c} · ${LEVEL_INFO[c].name}`)).join('')}</select>
        <a class="btn ghost sm" href="#/call/level-test">레벨 테스트 다시 보기</a></div></div>
    </section>

    <section class="card form">
      <h3>대화 방식</h3>
      <div class="field"><span>AI 말하기 속도 <b data-el="spv">${s.speed.toFixed(2)}×</b></span>
        <input type="range" min="0.7" max="1.2" step="0.025" value="${s.speed}" data-k="s.speed">
        <div class="sm-scale"><span>0.7×</span><span>원어민 1.0×</span><span>1.2×</span></div></div>
      <label class="switch"><input type="checkbox" data-k="s.speedAuto" ${s.speedAuto ? 'checked' : ''}><span>실력에 따라 속도 자동 조정</span></label>
      <label>교정 방식<select data-k="s.correctionStyle">
        ${opt('natural', s.correctionStyle, '자연스럽게 — 대화 흐름 속에서 바꿔 말해주기')}
        ${opt('active', s.correctionStyle, '적극적으로 — 틀리면 바로 짚어주기')}</select></label>
      <label class="switch"><input type="checkbox" data-k="s.liveFeedback" ${s.liveFeedback ? 'checked' : ''}><span>통화 중 화면에 실시간 교정 표시</span></label>
      <label class="switch"><input type="checkbox" data-k="s.subtitles" ${s.subtitles ? 'checked' : ''}><span>자막 기본으로 켜기</span></label>
      <label>목소리<select data-k="s.voice">${VOICES.map((v) => opt(v.id, s.voice, `${v.label} — ${v.desc}`)).join('')}</select></label>
      <label>억양<select data-k="s.accent">${opt('american', s.accent, '미국식')}${opt('british', s.accent, '영국식')}${opt('any', s.accent, '상황에 맞게')}</select></label>
    </section>

    <section class="card form">
      <h3>Gemini API</h3>
      <label>API 키<div class="inline"><input type="password" data-k="s.apiKey" value="${esc(s.apiKey)}" autocomplete="off"><button class="btn ghost sm" data-act="test">확인</button></div></label>
      <p class="tiny muted">키는 이 기기에만 저장되고 Google 서버로만 전송돼요.</p>
      <details><summary class="small">고급: 모델 이름</summary>
        <label>실시간 대화<input data-k="s.liveModel" value="${esc(s.liveModel)}"></label>
        <label>분석·복습 노트<input data-k="s.textModel" value="${esc(s.textModel)}"></label>
        <label>실시간 교정·힌트<input data-k="s.fastModel" value="${esc(s.fastModel)}"></label>
      </details>
    </section>

    <section class="card form">
      <h3>데이터</h3>
      <p class="tiny muted">기록은 이 기기의 브라우저에 저장돼요. 홈 화면에 추가해서 쓰고, 가끔 백업해두세요.</p>
      <div class="row-btns"><button class="btn ghost" data-act="export">백업 내보내기</button>
      <label class="btn ghost">백업 불러오기<input type="file" accept="application/json" data-act="import" hidden></label>
      <button class="btn ghost danger-text" data-act="reset">전체 초기화</button></div>
    </section>
  </div>`;

  root.querySelectorAll('[data-k]').forEach((el) => {
    el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
      const [scope, key] = el.dataset.k.split('.');
      const target = scope === 'p' ? p : s;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'range') { v = Number(v); root.querySelector('[data-el=spv]').textContent = `${v.toFixed(2)}×`; }
      if (key === 'cefr') applyLevel(v, false);
      else target[key] = typeof v === 'string' ? v.trim() : v;
      save();
    });
  });
  root.querySelector('.page').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'test') {
      try { const models = await checkApiKey(s.apiKey); toast(models.includes(s.liveModel) ? 'API 키가 정상이에요.' : `키는 정상인데 ${s.liveModel} 모델을 찾지 못했어요.`); }
      catch (err) { toast(`확인 실패: ${err.message}`); }
    } else if (act === 'export') {
      const blob = new Blob([exportData()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `rounds-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } else if (act === 'reset' && (await confirmDialog('전체 초기화', '모든 기록, 카드, 설정이 삭제돼요. 되돌릴 수 없어요.', '초기화', true))) {
      resetAll();
      location.hash = '#/onboarding/0';
    }
  });
  root.querySelector('[data-act=import]').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { importData(await f.text()); toast('불러왔어요.'); route(); } catch (err) { toast(err.message); }
  });
}

// ---------------- Onboarding ----------------
function onboarding(stepArg) {
  const step = Number(stepArg || 0);
  const dots = `<div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('')}</div>`;
  const wrap = (inner) => { root.innerHTML = `<div class="onb">${dots}<div class="card onb-card">${inner}</div></div>`; };

  if (step === 0) {
    wrap(`<div class="logo big">R</div>
      <h1>Rounds</h1>
      <p class="lead">원어민과 통화하듯 연습하는<br>나만의 영어회화 코치</p>
      <ul class="feat">
        <li>${icon('phone')}<div><b>실시간 음성 대화</b><span>Gemini와 진짜 전화하듯 말해요</span></div></li>
        <li>${icon('target')}<div><b>레벨 맞춤 수업</b><span>테스트 결과에 맞춰 속도와 난이도를 조절해요</span></div></li>
        <li>${icon('steth')}<div><b>의사 · 여행 상황</b><span>학회, 문진, 공항, 호텔까지</span></div></li>
        <li>${icon('cards')}<div><b>자동 복습 노트</b><span>어색했던 표현과 꼭 알아둘 표현을 정리해요</span></div></li>
      </ul>
      <a class="btn primary big" href="#/onboarding/1">시작하기 ${icon('arrow')}</a>`);
    return;
  }
  if (step === 1) {
    const p = state.profile || { goals: { medical: true, travel: true } };
    wrap(`<h2>반가워요! 몇 가지만 알려주세요</h2>
      <div class="form">
        <label>이름 (AI가 부를 이름)<input data-el="name" value="${esc(p.name || '')}" placeholder="예: Jinseok"></label>
        <label>지금 상태<input data-el="status" value="${esc(p.status || '')}" placeholder="예: 의대생, 내과 전공의"></label>
        <div class="field"><span>영어를 배우는 이유</span>
          <label class="check"><input type="checkbox" data-el="medical" ${p.goals?.medical ? 'checked' : ''}> 의사로서 비즈니스·전문 상황 소통</label>
          <label class="check"><input type="checkbox" data-el="travel" ${p.goals?.travel ? 'checked' : ''}> 해외여행에서 현지인과 대화</label>
        </div>
      </div>
      <button class="btn primary big" data-act="next">다음 ${icon('arrow')}</button>`);
    root.querySelector('[data-act=next]').onclick = () => {
      const v = (k) => root.querySelector(`[data-el=${k}]`);
      const name = v('name').value.trim();
      if (!name) return toast('이름을 입력해주세요.');
      state.profile = { cefr: 'B1', levelNum: 3, createdAt: Date.now(), ...(state.profile || {}), name, status: v('status').value.trim(), goals: { medical: v('medical').checked, travel: v('travel').checked } };
      save();
      location.hash = '#/onboarding/2';
    };
    return;
  }
  if (step === 2) {
    if (!state.profile) { location.replace('#/onboarding/1'); return; }
    wrap(`<h2>Gemini API 키 연결</h2>
      <p class="muted">Gemini Pro 구독과는 별개로, 앱에서 Gemini를 쓰려면 API 키가 필요해요. <b>무료</b>로 받을 수 있어요.</p>
      <ol class="steps">
        <li><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>에 구글 계정으로 로그인</li>
        <li><b>Create API key</b>를 눌러 키를 만들고 복사</li>
        <li>아래에 붙여넣기</li>
      </ol>
      <div class="form"><label>API 키<input type="password" data-el="key" value="${esc(state.settings.apiKey)}" placeholder="AIza..." autocomplete="off"></label></div>
      <p class="tiny muted">키는 이 기기에만 저장돼요. 무료 사용량에서는 대화 내용이 Google 서비스 개선에 쓰일 수 있어요.</p>
      <button class="btn primary big" data-act="check">연결 확인 ${icon('arrow')}</button>`);
    root.querySelector('[data-act=check]').onclick = async (e) => {
      const key = root.querySelector('[data-el=key]').value.trim();
      if (!key) return toast('API 키를 붙여넣어 주세요.');
      e.target.disabled = true;
      e.target.textContent = '확인 중…';
      try {
        const models = await checkApiKey(key);
        state.settings.apiKey = key;
        if (!models.includes(state.settings.liveModel)) {
          const alt = models.find((m) => /live/.test(m) && !/translate|transcribe/.test(m));
          if (alt) state.settings.liveModel = alt;
        }
        save();
        location.hash = '#/onboarding/3';
      } catch (err) {
        toast(`연결 실패: ${err.message}`, 4000);
        e.target.disabled = false;
        e.target.innerHTML = `연결 확인 ${icon('arrow')}`;
      }
    };
    return;
  }
  // step 3
  if (!state.settings.apiKey) { location.replace('#/onboarding/2'); return; }
  wrap(`<h2>레벨 테스트</h2>
    <p class="muted">시험관 <b>Alex</b>와 6분 정도 영어로 통화해요. 결과에 맞춰 대화 난이도와 AI 말하기 속도가 정해져요.</p>
    <ul class="feat compact">
      <li>${icon('mic')}<div><b>조용한 곳에서, 이어폰을 끼면 좋아요</b><span>마이크 권한을 허용해주세요</span></div></li>
      <li>${icon('chat')}<div><b>틀려도 괜찮아요</b><span>최대한 길게, 많이 말할수록 정확해요</span></div></li>
      <li>${icon('bulb')}<div><b>막히면 '말문 막힘' 버튼</b><span>말할 거리를 추천해줘요</span></div></li>
    </ul>
    ${state.pendingTest ? `<div class="card inset pending"><b>분석하지 못한 테스트가 있어요</b>
      <p class="tiny muted">${relDate(state.pendingTest.date)}에 본 테스트예요. 다시 볼 필요 없이 분석만 다시 할 수 있어요.</p>
      <button class="btn primary" data-act="reanalyze">${icon('refresh')} 지난 테스트 분석하기</button></div>` : ''}
    <a class="btn ${state.pendingTest ? 'ghost' : 'primary'} big" href="#/call/level-test">${icon('phone')} 레벨 테스트 ${state.pendingTest ? '새로 보기' : '시작'}</a>
    <details class="skip"><summary>테스트 없이 레벨 직접 고르기</summary>
      <div class="level-pick">${CEFR.map((c) => `<button class="btn ghost" data-c="${c}"><b>${c}</b> ${LEVEL_INFO[c].name}</button>`).join('')}</div>
    </details>`);
  const re = root.querySelector('[data-act=reanalyze]');
  if (re) re.onclick = async () => {
    re.disabled = true;
    re.textContent = '분석 중… (최대 1분)';
    const pt = state.pendingTest;
    try {
      const test = await analyzeLevelTest(pt.transcript, null, pt.durationSec, () => { re.textContent = '서버가 붐벼서 다시 시도하는 중…'; });
      location.hash = `#/level/${test.id}`;
    } catch (err) {
      toast(err.message, 4000);
      re.disabled = false;
      re.innerHTML = `${icon('refresh')} 지난 테스트 분석하기`;
    }
  };
  root.querySelector('.level-pick').onclick = (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    applyLevel(b.dataset.c, true);
    save();
    location.hash = '#/home';
  };
}

window.addEventListener('hashchange', route);
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
route();
