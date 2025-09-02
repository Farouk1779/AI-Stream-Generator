// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

// CORS: allow origins from ALLOWED_ORIGINS (comma-separated) or allow all if not set (for testing)
const allowed = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim()) : null;
app.use(cors({
  origin: (origin, callback) => {
    if (!allowed || !origin) return callback(null, true); // allow non-browser (curl), or all if not configured
    if (allowed.includes(origin)) return callback(null, true);
    return callback(new Error("CORS not allowed"), false);
  }
}));

// Simple client authentication: front-end must send x-api-key header that matches CLIENT_API_KEY env var
app.use((req, res, next) => {
  const clientKey = process.env.CLIENT_API_KEY;
  // if no CLIENT_API_KEY set we allow (useful for testing). For production set it.
  if (!clientKey) return next();
  const incoming = req.headers["x-api-key"];
  if (!incoming || incoming !== clientKey) {
    return res.status(401).json({ error: "Missing or invalid x-api-key header" });
  }
  next();
});

// Helper to call OpenAI Chat Completions
async function callOpenAI(prompt, maxTokens = 150) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY missing in env");

  const body = {
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: "You are a helpful creative assistant." }, { role: "user", content: prompt }],
    temperature: 0.8,
    max_tokens: maxTokens
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${text}`);
  }
  const j = await resp.json();
  return j.choices?.[0]?.message?.content ?? "";
}

// ==== AI endpoints ====

app.post("/generate-title", async (req, res) => {
  try {
    const { game = "", keywords = "", voice = "friendly" } = req.body;
    const prompt = `Generate 10 short catchy stream titles (max 70 chars). Game: ${game}. Keywords: ${keywords}. Voice: ${voice}. Output one per line.`;
    const out = await callOpenAI(prompt, 160);
    const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    res.json({ titles: lines.slice(0, 10), raw: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/generate-name", async (req, res) => {
  try {
    const { keywords = "", style = "short" } = req.body;
    const prompt = `Generate 15 creative Twitch usernames. Keywords: ${keywords}. Style: ${style}. One per line.`;
    const out = await callOpenAI(prompt, 200);
    const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    res.json({ names: lines.slice(0, 15), raw: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/generate-bio", async (req, res) => {
  try {
    const { vibe = "friendly", length = "short" } = req.body;
    const prompt = `Write 5 Twitch bio lines with vibe: ${vibe}. Length: ${length}. Output one per line.`;
    const out = await callOpenAI(prompt, 160);
    const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    res.json({ bios: lines.slice(0, 5), raw: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Calculators (fast & local — no AI)
app.post("/calc-subs", (req, res) => {
  const { subs = 0, tier = 1 } = req.body;
  const tierRates = { 1: 2.5, 2: 5, 3: 12.5 }; // example: after typical split (approx)
  const earnings = Number(subs) * (tierRates[tier] ?? tierRates[1]);
  res.json({ subs: Number(subs), tier, earnings });
});

app.post("/calc-ads", (req, res) => {
  const { adMinutes = 0, viewers = 0, cpm = 3 } = req.body; // cpm per 1000 viewers per ad-minute (example)
  const earnings = (Number(viewers) / 1000) * Number(cpm) * Number(adMinutes);
  res.json({ adMinutes: Number(adMinutes), viewers: Number(viewers), cpm: Number(cpm), earnings });
});

// health
app.get("/health", (req, res) => res.send("OK"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
