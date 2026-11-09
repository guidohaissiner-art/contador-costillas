// Guarda y lee la deuda compartida en Upstash Redis (plan gratis).
const KEY = "costillas";
const DEFAULT_STATE = {
  config: { deudor: "Sebas", acreedor: "Iván", deuda: 1000, ciudad: "Buenos Aires" },
  entries: []
};

function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Falta conectar la base (Upstash) en Vercel");
  return { url, token };
}

async function load() {
  const { url, token } = redisEnv();
  const r = await fetch(`${url}/get/${KEY}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json();
  if (!data.result) return structuredClone(DEFAULT_STATE);
  try { return JSON.parse(data.result); } catch { return structuredClone(DEFAULT_STATE); }
}

async function save(state) {
  const { url, token } = redisEnv();
  await fetch(`${url}/set/${KEY}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(state)
  });
}

const clip = (s, n) => String(s || "").slice(0, n);

module.exports = async (req, res) => {
  try {
    const state = await load();
    if (req.method === "GET") return res.status(200).json(state);
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    if (body.type === "add") {
      const e = body.entry || {};
      const usd = Math.round(Number(e.usd));
      if (!(usd > 0) || usd > 1000000) return res.status(400).json({ error: "Monto inválido" });
      state.entries.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        actividad: clip(e.actividad, 200),
        usd,
        comentario: clip(e.comentario, 240),
        autor: clip(e.autor, 30),
        ts: Date.now()
      });
      if (state.entries.length > 500) state.entries = state.entries.slice(-500);
    } else if (body.type === "delete") {
      state.entries = state.entries.filter(x => x.id !== body.id);
    } else if (body.type === "config") {
      const c = body.config || {};
      state.config = {
        deudor: clip(c.deudor, 40) || state.config.deudor,
        acreedor: clip(c.acreedor, 40) || state.config.acreedor,
        deuda: Math.max(0, Math.min(10000000, Math.round(Number(c.deuda) || 0))),
        ciudad: clip(c.ciudad, 60) || state.config.ciudad
      };
    } else {
      return res.status(400).json({ error: "Acción desconocida" });
    }

    await save(state);
    res.status(200).json(state);
  } catch (err) {
    res.status(500).json({ error: err.message || "Error" });
  }
};
