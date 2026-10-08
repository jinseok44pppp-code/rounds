// Local persistence (everything stays on this device).

const KEY = 'rounds.v1';

const DEFAULT_SETTINGS = {
  apiKey: '',
  liveModel: 'gemini-3.8-live',
  textModel: 'gemini-3.8-flash',
  fastModel: 'gemini-3.5-flash-lite',
  voice: 'Aoede',
  accent: 'american',
  correctionStyle: 'natural',
  subtitles: true,
  liveFeedback: true,
  sessionMinutes: 10,
  speed: 0.85,
  speedAuto: true,
};

function fresh() {
  return { settings: { ...DEFAULT_SETTINGS }, profile: null, sessions: [], cards: [], levelTests: [] };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw);
    return { ...fresh(), ...s, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) } };
  } catch {
    return fresh();
  }
}

export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error(e);
    alert('저장 공간이 부족해요. 설정에서 백업 후 오래된 기록을 지워주세요.');
  }
}

export function exportData() {
  return JSON.stringify(state, null, 2);
}

export function importData(json) {
  const s = JSON.parse(json);
  if (!s || typeof s !== 'object' || !('settings' in s)) throw new Error('올바른 백업 파일이 아니에요.');
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, fresh(), s, { settings: { ...DEFAULT_SETTINGS, ...s.settings } });
  save();
}

export function resetAll() {
  localStorage.removeItem(KEY);
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, fresh());
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---- Spaced repetition (Leitner boxes) ----
const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35];
const DAY = 86400000;

export function addCards(list, sessionId) {
  const seen = new Set(state.cards.map((c) => c.back.toLowerCase()));
  for (const c of list) {
    if (!c.back || seen.has(c.back.toLowerCase())) continue;
    seen.add(c.back.toLowerCase());
    state.cards.push({ id: uid(), box: 0, due: Date.now(), created: Date.now(), sessionId, ...c });
  }
}

export function gradeCard(card, knew) {
  card.box = knew ? Math.min(card.box + 1, INTERVAL_DAYS.length - 1) : 0;
  card.due = Date.now() + (knew ? INTERVAL_DAYS[card.box] * DAY : 10 * 60 * 1000);
  card.reviewed = (card.reviewed || 0) + 1;
  save();
}

export const dueCards = () => state.cards.filter((c) => c.due <= Date.now());

// ---- Stats ----
export function stats() {
  const days = new Set(state.sessions.map((s) => new Date(s.date).toDateString()));
  let streak = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
  const weekAgo = Date.now() - 7 * DAY;
  const weekMin = Math.round(
    state.sessions.filter((s) => s.date >= weekAgo).reduce((a, s) => a + (s.durationSec || 0), 0) / 60,
  );
  const totalMin = Math.round(state.sessions.reduce((a, s) => a + (s.durationSec || 0), 0) / 60);
  return { streak, weekMin, totalMin, sessions: state.sessions.length };
}
