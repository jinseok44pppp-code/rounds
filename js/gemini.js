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

/**
 * Ask a model for a JSON object.
 * @param {object} o
 * @param {string} o.apiKey
 * @param {string} o.model
 * @param {string} o.system
 * @param {Array} o.parts  content parts ({text} or {inlineData})
 * @param {number} [o.temperature]
 * @param {AbortSignal} [o.signal]
 */
export async function generateJSON({ apiKey, model, system, parts, temperature = 0.4, signal }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', temperature },
  };
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${API}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal,
    });
    if (res.ok) {
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (!text) throw new Error('AI가 빈 응답을 보냈어요.');
      return parseJSON(text);
    }
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error.message || msg; } catch {}
    lastErr = new Error(msg);
    lastErr.status = res.status;
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw lastErr;
}
