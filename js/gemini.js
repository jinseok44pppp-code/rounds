// REST helpers for non-realtime Gemini calls (evaluation, reviews, live feedback).

const API = 'https://generativelanguage.googleapis.com/v1beta';

export async function checkApiKey(apiKey) {
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error.message || msg; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  return (data.models || []).map((m) => m.name.replace(/^models\//, ''));
}

function parseJSON(text) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('AI 응답을 해석하지 못했어요.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask a model for a JSON object. When a model is overloaded (429/5xx) or missing (404),
 * retries with backoff and then falls back to the next model in the list.
 * @param {object} o
 * @param {string} o.apiKey
 * @param {string|string[]} o.model  one model or a fallback chain
 * @param {string} o.system
 * @param {Array} o.parts  content parts ({text} or {inlineData})
 * @param {number} [o.temperature]
 * @param {number} [o.attempts]  tries per model
 * @param {(model:string, attempt:number)=>void} [o.onRetry]
 * @param {AbortSignal} [o.signal]
 */
export async function generateJSON({ apiKey, model, system, parts, temperature = 0.4, attempts = 2, onRetry, signal }) {
  const models = [...new Set([].concat(model).filter(Boolean))];
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', temperature },
  });
  let lastErr;
  for (const m of models) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0 || m !== models[0]) onRetry?.(m, attempt);
      let res;
      try {
        res = await fetch(`${API}/models/${m}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body,
          signal,
        });
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        lastErr = new Error('인터넷 연결을 확인해주세요.');
        await sleep(2000);
        continue;
      }
      if (res.ok) {
        const data = await res.json();
        const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
        if (text) {
          try { return parseJSON(text); } catch (e) { lastErr = e; continue; }
        }
        lastErr = new Error('AI가 빈 응답을 보냈어요.');
        continue;
      }
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).error.message || msg; } catch {}
      lastErr = new Error(msg);
      lastErr.status = res.status;
      if (res.status === 404) break; // model not available: try the next one
      if (res.status !== 429 && res.status < 500) throw lastErr; // bad key / bad request: no point retrying
      await sleep(2500 * (attempt + 1));
    }
  }
  if (lastErr && (lastErr.status === 503 || lastErr.status === 429 || /high demand|overloaded|quota/i.test(lastErr.message))) {
    const e = new Error('지금 Google AI 서버가 붐비거나 무료 사용량이 잠시 찼어요. 1~2분 뒤 다시 시도해주세요.');
    e.status = lastErr.status;
    e.detail = lastErr.message;
    throw e;
  }
  throw lastErr;
}
