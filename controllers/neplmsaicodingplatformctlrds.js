const AiConfiguration = require("../Models/aiconfigurationds");
const Gptapikeyds = require("../Models/gptapikeyds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const geminiModels = [
  "gemini-3.5-pro",
  "gemini-3.5-flash",
  "gemini-3.0-pro",
  "gemini-3.0-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b"
];

const openAiModels = [
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "o3",
  "o4-mini"
];

const claudeModels = [
  "claude-sonnet-4-5",
  "claude-opus-4-1",
  "claude-haiku-4-5",
  "claude-3-7-sonnet-latest",
  "claude-3-5-sonnet-latest",
  "claude-3-5-haiku-latest"
];

const ollamaModels = [
  "llama3.2",
  "llama3.1",
  "codellama",
  "deepseek-coder",
  "qwen2.5-coder",
  "mistral",
  "phi3"
];

const languages = [
  "JavaScript",
  "TypeScript",
  "React JSX",
  "Node.js",
  "Express",
  "Python",
  "Java",
  "C",
  "C++",
  "C#",
  "Go",
  "Rust",
  "PHP",
  "Ruby",
  "Swift",
  "Kotlin",
  "Scala",
  "R",
  "MATLAB",
  "SQL",
  "MongoDB Query",
  "HTML",
  "CSS",
  "Bash",
  "PowerShell",
  "Dart",
  "Flutter",
  "Solidity",
  "Lua",
  "Julia",
  "Haskell",
  "Elixir",
  "Erlang",
  "Perl",
  "Visual Basic",
  "Fortran",
  "COBOL",
  "Objective-C",
  "Assembly",
  "YAML",
  "JSON",
  "XML",
  "Markdown"
];

const providerModels = {
  Gemini: geminiModels,
  OpenAI: openAiModels,
  Claude: claudeModels,
  Ollama: ollamaModels
};

const scopedColid = (payload = {}) => {
  const colid = number(payload.colid);
  if (colid === undefined) throw new Error("colid is required");
  return colid;
};

const readGeminiText = (payload = {}) => payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";

const stripJson = (raw = "") => {
  const value = text(raw).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  return first >= 0 && last > first ? value.slice(first, last + 1) : value;
};

const parseAiResult = (raw = "") => {
  try {
    const parsed = JSON.parse(stripJson(raw));
    return {
      success: Boolean(parsed.success),
      summary: text(parsed.summary),
      output: text(parsed.output || parsed.expectedOutput),
      errors: Array.isArray(parsed.errors) ? parsed.errors.map((err) => ({
        line: number(err.line) || 1,
        column: number(err.column) || 1,
        severity: text(err.severity) || "error",
        message: text(err.message),
        suggestion: text(err.suggestion)
      })).filter((err) => err.message) : [],
      correctedCode: text(parsed.correctedCode),
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(text).filter(Boolean) : [],
      raw
    };
  } catch {
    return {
      success: false,
      summary: "AI returned a non-JSON response. The full response is shown below.",
      output: raw,
      errors: [],
      correctedCode: "",
      notes: [],
      raw
    };
  }
};

const getAiConfiguration = async (colid, provider) => AiConfiguration.findOne({
  colid,
  type: new RegExp(`^${provider}$`, "i"),
  active: /^yes$/i,
  default: /^yes$/i
}).lean() || AiConfiguration.findOne({
  colid,
  type: new RegExp(`^${provider}$`, "i"),
  active: /^yes$/i
}).lean();

const getGeminiLegacyKey = async (colid, user) => {
  const row = await Gptapikeyds.findOne({ colid, user, isactive: true }).lean()
    || await Gptapikeyds.findOne({ colid, isactive: true }).lean();
  if (!row) return "";
  return row.usepersonalkey && row.personalapikey ? row.personalapikey : row.defaultapikey;
};

const resolveApiKey = async ({ colid, user, provider, ownApiKey }) => {
  if (text(ownApiKey)) return text(ownApiKey);
  const config = await getAiConfiguration(colid, provider);
  if (config?.apikey) return config.apikey;
  if (/^gemini$/i.test(provider)) return getGeminiLegacyKey(colid, user);
  const envMap = {
    OpenAI: process.env.OPENAI_API_KEY,
    Claude: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
    Gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  };
  return envMap[provider] || "";
};

const getOllamaConfig = async (colid, id) => (id ? OllamaConfiguration.findOne({ _id: id, colid, active: /^yes$/i }).lean() : null)
  || OllamaConfiguration.findOne({ colid, active: /^yes$/i, default: /^yes$/i }).lean()
  || OllamaConfiguration.findOne({ colid, active: /^yes$/i }).lean();

const buildPrompt = ({ language, code, user, role }) => `You are an expert programming tutor and static/runtime reasoning assistant.
Check the student's code and simulate its likely output. Do not execute unsafe code. Be precise.

Current user: ${text(user) || "Unknown"}
Current role: ${text(role) || "Unknown"}
Programming language: ${text(language)}

Return ONLY valid JSON, no markdown, in this shape:
{
  "success": true or false,
  "summary": "short explanation",
  "output": "program output or expected output",
  "errors": [
    { "line": 1, "column": 1, "severity": "error|warning|info", "message": "what is wrong", "suggestion": "how to fix" }
  ],
  "correctedCode": "corrected full code if useful, otherwise empty string",
  "notes": ["short learning notes"]
}

Code:
${String(code || "")}`;

const callGemini = async ({ apiKey, model, prompt }) => {
  if (!apiKey) throw new Error("Gemini API key is missing. Configure it in settings or enter your own key.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || "gemini-2.5-flash-lite")}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Gemini request failed");
  return readGeminiText(data);
};

const callOpenAI = async ({ apiKey, model, prompt }) => {
  if (!apiKey) throw new Error("OpenAI API key is missing. Configure it in settings or enter your own key.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI request failed");
  return data?.choices?.[0]?.message?.content || "";
};

const callClaude = async ({ apiKey, model, prompt }) => {
  if (!apiKey) throw new Error("Claude API key is missing. Configure it in settings or enter your own key.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: model || "claude-3-5-sonnet-latest",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Claude request failed");
  return (data?.content || []).map((part) => part.text || "").join("\n").trim();
};

const callOllama = async ({ colid, ollamaConfigId, model, prompt }) => {
  const config = await getOllamaConfig(colid, ollamaConfigId);
  const server = text(config?.serveraddress) || "http://localhost:11434";
  const selectedModel = text(model) || text(config?.modelname) || "llama3.1";
  const response = await fetch(`${server.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: selectedModel, prompt, stream: false })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Ollama request failed");
  return data.response || "";
};

exports.options = async (req, res) => {
  try {
    const colid = scopedColid(req.query);
    const user = text(req.query.user);
    const [geminiConfig, openAiConfig, claudeConfig, geminiLegacyKey, ollamaConfigs] = await Promise.all([
      getAiConfiguration(colid, "Gemini"),
      getAiConfiguration(colid, "OpenAI"),
      getAiConfiguration(colid, "Claude"),
      getGeminiLegacyKey(colid, user),
      OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean()
    ]);
    res.json({
      success: true,
      languages,
      providerModels,
      ollamaConfigs,
      savedKeys: {
        Gemini: Boolean(geminiConfig?.apikey || geminiLegacyKey),
        OpenAI: Boolean(openAiConfig?.apikey || process.env.OPENAI_API_KEY),
        Claude: Boolean(claudeConfig?.apikey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY),
        Ollama: ollamaConfigs.length > 0
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.checkCode = async (req, res) => {
  try {
    const colid = scopedColid(req.body);
    const provider = text(req.body.provider) || "Gemini";
    const model = text(req.body.model);
    const prompt = buildPrompt({
      language: req.body.language,
      code: req.body.code,
      user: req.body.user,
      role: req.body.role
    });
    let raw = "";
    if (/^ollama$/i.test(provider)) {
      raw = await callOllama({ colid, ollamaConfigId: req.body.ollamaConfigId, model, prompt });
    } else {
      const apiKey = await resolveApiKey({ colid, user: text(req.body.user), provider, ownApiKey: req.body.ownApiKey });
      if (/^openai$/i.test(provider)) raw = await callOpenAI({ apiKey, model, prompt });
      else if (/^claude$/i.test(provider)) raw = await callClaude({ apiKey, model, prompt });
      else raw = await callGemini({ apiKey, model, prompt });
    }
    res.json({ success: true, result: parseAiResult(raw) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
