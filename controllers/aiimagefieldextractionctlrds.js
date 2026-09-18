const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");

const clean = (value) => String(value ?? "").trim();

const modelOptions = {
  Gemini: [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-pro",
    "gemini-1.5-flash"
  ],
  ChatGPT: ["gpt-5.1", "gpt-5", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"],
  Claude: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"],
  Ollama: ["llama3.2-vision", "llava", "qwen2.5vl", "gemma3"]
};

const normalizeProvider = (provider) => {
  const text = clean(provider).toLowerCase();
  if (text.includes("ollama")) return "Ollama";
  if (text.includes("claude") || text.includes("anthropic")) return "Claude";
  if (text.includes("openai") || text.includes("chatgpt")) return "ChatGPT";
  return "Gemini";
};

const stripDataUrl = (value = "") => String(value).replace(/^data:[^;]+;base64,/i, "");

const readGeminiText = (payload = {}) => (
  payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || ""
);

const extractJson = (value) => {
  const raw = clean(value).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
  }
  return {};
};

const getAiConfig = async (colid, pattern) => {
  const query = { active: "Yes", type: pattern };
  if (colid !== undefined && colid !== null && colid !== "") query.colid = Number(colid);
  const defaultConfig = await AiConfiguration.findOne({ ...query, default: "Yes" }).lean();
  if (defaultConfig) return defaultConfig;
  return AiConfiguration.findOne(query).lean();
};

const getOllamaConfig = async (colid, ollamaConfigId) => {
  if (ollamaConfigId) {
    const config = await OllamaConfiguration.findOne({ _id: ollamaConfigId, colid: Number(colid) }).lean();
    if (config) return config;
  }
  const defaultConfig = await OllamaConfiguration.findOne({ colid: Number(colid), active: "Yes", default: "Yes" }).lean();
  if (defaultConfig) return defaultConfig;
  return OllamaConfiguration.findOne({ colid: Number(colid), active: "Yes" }).lean();
};

const buildPrompt = ({ fields, context }) => `Extract user/student form data from the attached image(s).

Return ONLY valid JSON in this exact shape:
{
  "fields": {
    "fieldName": "extracted value"
  },
  "confidence": {
    "fieldName": 0.0
  },
  "notes": ["short notes about uncertain or missing fields"]
}

Use only these target field names:
${fields.map((field) => `- ${field.name}: ${field.label || field.name}`).join("\n")}

Rules:
- Keep field names exactly as provided.
- If a value is not visible or uncertain, return an empty string for that field.
- Do not invent missing values.
- Dates should use YYYY-MM-DD if the image gives enough information.
- Preserve names and addresses exactly as visible.
- For program/programcode/regulation/semester/section/email/phone/regno, extract the closest visible value.

Page context: ${clean(context) || "Student/User data upload form"}`;

const callGeminiVision = async ({ colid, model, prompt, images }) => {
  const config = await getAiConfig(colid, /^(gemini|google)$/i);
  if (!config?.apikey) throw new Error("Gemini API key is missing in AI configuration");
  const parts = [{ text: prompt }, ...images.map((image) => ({
    inline_data: { mime_type: image.mime || "image/png", data: stripDataUrl(image.data) }
  }))];
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || "gemini-2.5-flash")}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Gemini image extraction failed");
  return readGeminiText(data);
};

const callOpenAiVision = async ({ colid, model, prompt, images }) => {
  const config = await getAiConfig(colid, /^(openai|chatgpt)$/i);
  if (!config?.apikey) throw new Error("OpenAI API key is missing in AI configuration");
  const content = [
    { type: "text", text: prompt },
    ...images.map((image) => ({
      type: "image_url",
      image_url: { url: image.data?.startsWith("data:") ? image.data : `data:${image.mime || "image/png"};base64,${image.data}` }
    }))
  ];
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apikey}` },
    body: JSON.stringify({
      model: model || "gpt-4.1-mini",
      messages: [{ role: "user", content }],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI image extraction failed");
  return data?.choices?.[0]?.message?.content || "";
};

const callClaudeVision = async ({ colid, model, prompt, images }) => {
  const config = await getAiConfig(colid, /^(claude|anthropic)$/i);
  if (!config?.apikey) throw new Error("Claude API key is missing in AI configuration");
  const content = [
    { type: "text", text: prompt },
    ...images.map((image) => ({
      type: "image",
      source: { type: "base64", media_type: image.mime || "image/png", data: stripDataUrl(image.data) }
    }))
  ];
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apikey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({ model: model || "claude-3-5-sonnet-latest", max_tokens: 3000, messages: [{ role: "user", content }] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Claude image extraction failed");
  return (data?.content || []).map((part) => part.text || "").join("\n").trim();
};

const callOllamaVision = async ({ colid, ollamaConfigId, model, prompt, images }) => {
  const config = await getOllamaConfig(colid, ollamaConfigId);
  if (!config) throw new Error("Active Ollama configuration is missing");
  const server = clean(config.serveraddress || "http://localhost:11434").replace(/\/+$/, "");
  const selectedModel = clean(model) || clean(config.modelname) || "llama3.2-vision";
  const response = await fetch(`${server}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: selectedModel,
      stream: false,
      format: "json",
      messages: [{ role: "user", content: prompt, images: images.map((image) => stripDataUrl(image.data)) }],
      options: { temperature: 0.1 }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Ollama image extraction failed at ${server}`);
  return data?.message?.content || data?.response || "";
};

exports.models = async (req, res) => {
  try {
    const colid = req.query.colid;
    const ollamaConfigs = colid
      ? await OllamaConfiguration.find({ colid: Number(colid), active: "Yes" }).lean()
      : [];
    res.json({
      providers: ["Gemini", "ChatGPT", "Ollama", "Claude"],
      models: modelOptions,
      ollamaConfigs
    });
  } catch (err) {
    res.status(500).json({ msg: err.message || "Unable to load AI model options" });
  }
};

exports.extract = async (req, res) => {
  try {
    const { colid, provider, model, ollamaConfigId, images = [], fields = [], context } = req.body || {};
    const targetFields = fields.filter((field) => clean(field?.name));
    const validImages = images.filter((image) => clean(image?.data));
    if (!validImages.length) return res.status(400).json({ msg: "Upload at least one image" });
    if (!targetFields.length) return res.status(400).json({ msg: "No target fields supplied for extraction" });
    const prompt = buildPrompt({ fields: targetFields, context });
    const selectedProvider = normalizeProvider(provider);
    let text = "";
    if (selectedProvider === "Ollama") text = await callOllamaVision({ colid, ollamaConfigId, model, prompt, images: validImages });
    else if (selectedProvider === "Claude") text = await callClaudeVision({ colid, model, prompt, images: validImages });
    else if (selectedProvider === "ChatGPT") text = await callOpenAiVision({ colid, model, prompt, images: validImages });
    else text = await callGeminiVision({ colid, model, prompt, images: validImages });
    const parsed = extractJson(text);
    res.json({
      fields: parsed.fields || parsed || {},
      confidence: parsed.confidence || {},
      notes: parsed.notes || [],
      provider: selectedProvider,
      model: model || ""
    });
  } catch (err) {
    res.status(500).json({ msg: err.message || "Unable to extract fields from image" });
  }
};
