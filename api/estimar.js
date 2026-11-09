// Le pide a Claude (modelo más barato) que estime el costo en USD de una actividad.
const MODEL = process.env.MODEL || "claude-haiku-5-5";

function prompt(actividad, ciudad) {
  return `Sos un tasador de gastos con humor rioplatense. Un amigo le debe plata a otro y dice que "no tiene para pagar", pero en Instagram se lo ve gastando.
Estimá cuánto le costó al deudor la siguiente actividad, a precios de mercado típicos en ${ciudad}, en dólares estadounidenses (si los precios locales están en otra moneda, convertí al tipo de cambio aproximado que usa la gente en la calle).
Contá solo lo que razonablemente pagó él (su parte, o todo si invitó). Sé realista, ni inflado ni regalado.

Actividad: "${actividad}"

Respondé SOLO con JSON válido, sin texto extra:
{"costo_usd": número entero, "desglose": [{"item": "texto corto", "usd": número}], "comentario": "una sola línea graciosa, estilo amigo argentino cargando, sin insultos fuertes"}
El desglose tiene entre 1 y 4 ítems y suma costo_usd.`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Falta la API key en Vercel" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const actividad = String(body.actividad || "").trim().slice(0, 200);
  const ciudad = String(body.ciudad || "Buenos Aires").slice(0, 60);
  if (!actividad) return res.status(400).json({ error: "Falta la actividad" });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: "Respondés únicamente con un objeto JSON válido. Sin markdown, sin explicaciones, sin texto antes ni después.",
        messages: [{ role: "user", content: prompt(actividad, ciudad) }]
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: (data.error && data.error.message) || "Error de la IA" });

    const text = (data.content || [])
      .filter(c => c.type === "text")
      .map(c => c.text || "")
      .join("")
      .replace(/```(json)?/gi, "");
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    let out;
    try {
      if (start === -1 || end <= start) throw new Error();
      out = JSON.parse(text.slice(start, end + 1));
    } catch {
      return res.status(502).json({
        error: `Respuesta rara de la IA [${data.stop_reason || "?"}]: ${text.slice(0, 120) || "(vacía)"}`
      });
    }
    res.status(200).json({
      costo_usd: Math.round(Number(out.costo_usd) || 0),
      desglose: Array.isArray(out.desglose) ? out.desglose.slice(0, 4) : [],
      comentario: String(out.comentario || "").slice(0, 240)
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Error" });
  }
};
