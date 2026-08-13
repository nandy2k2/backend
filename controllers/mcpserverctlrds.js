const McpServer = require("../Models/mcpserverds");
const AiConfiguration = require("../Models/aiconfigurationds");

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const yesNo = (value, fallback = "No") => /^yes$/i.test(text(value)) ? "Yes" : /^no$/i.test(text(value)) ? "No" : fallback;
const jsonText = (value) => {
  if (typeof value !== "string") return JSON.stringify(value || {}, null, 2);
  return value;
};
const safeServer = (server = {}) => ({
  _id: server._id,
  colid: server.colid,
  title: server.title,
  command: server.command,
  remoteaddress: server.remoteaddress,
  tokenconfigured: !!text(server.token),
  headerconfigured: !!text(server.headers),
  headers: server.headers,
  arguments: server.arguments,
  active: server.active,
  default: server.default,
  name: server.name,
  user: server.user,
  createdAt: server.createdAt,
  updatedAt: server.updatedAt
});

const parseArguments = (value) => {
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return Object.entries(parsed).map(([key, val]) => `${key}=${val}`);
    return [String(parsed)];
  } catch {
    return raw.split(/\s+/).filter(Boolean);
  }
};

const parseHeaders = (value) => {
  const raw = text(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed)
        .filter(([key]) => text(key))
        .map(([key, val]) => [text(key), String(val ?? "")]));
    }
  } catch {
    // Allow line-based header format below.
  }
  return raw.split(/\r?\n/).reduce((acc, line) => {
    const index = line.indexOf(":");
    if (index > 0) {
      const key = text(line.slice(0, index));
      const val = text(line.slice(index + 1));
      if (key) acc[key] = val;
    }
    return acc;
  }, {});
};

const readGeminiText = (payload = {}) => (
  payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim()
  || payload.candidates?.[0]?.content?.parts?.[0]?.text
  || ""
);

const getGeminiConfig = async (colid) => (
  await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean()
);

const callGemini = async ({ colid, prompt, model = "gemini-2.5-flash" }) => {
  const config = await getGeminiConfig(colid);
  if (!config?.apikey) throw new Error("Default active Gemini configuration is missing");
  const models = [...new Set([text(model), "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"].filter(Boolean))];
  let lastError = "";
  for (const item of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(item)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return readGeminiText(data) || "Gemini returned an empty response.";
    lastError = data.error?.message || `Gemini request failed for ${item}`;
  }
  throw new Error(lastError || "Gemini request failed");
};

const parseMcpResponse = (raw) => {
  const eventData = raw.split("\n").find((line) => line.startsWith("data:"));
  const json = eventData ? eventData.replace(/^data:\s*/, "") : raw;
  return JSON.parse(json);
};

const tryMcpRpc = async ({ url, method, params, token, sessionId, extraHeaders }) => {
  if (!text(url)) throw new Error("Remote MCP address is not configured");
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(extraHeaders || {})
  };
  if (text(token) && !headers.Authorization && !headers.authorization) headers.Authorization = `Bearer ${text(token)}`;
  if (text(sessionId)) headers["Mcp-Session-Id"] = text(sessionId);
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params || {} })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw || `MCP ${method} failed`);
  return {
    data: parseMcpResponse(raw),
    sessionId: response.headers.get("mcp-session-id") || response.headers.get("Mcp-Session-Id") || sessionId || ""
  };
};

const connectMcpServer = async ({ server, token, headers, steps }) => {
  let sessionId = "";
  if (!text(token)) {
    steps.push({ status: "warning", label: "MCP token missing", detail: "No token was saved in MCP Server settings or entered for this run. Continuing without token." });
    return sessionId;
  }
  try {
    steps.push({ status: "running", label: "Sending connect request", detail: "Calling MCP connect with the configured token." });
    const connectResult = await tryMcpRpc({
      url: server.remoteaddress,
      method: "connect",
      params: { token: text(token), authorization: `Bearer ${text(token)}` },
      token,
      extraHeaders: headers
    });
    sessionId = connectResult.sessionId || connectResult.data?.result?.sessionId || connectResult.data?.sessionId || "";
    steps.push({ status: "done", label: "MCP token accepted", detail: sessionId ? `Session established: ${sessionId}` : "Connected with token." });
  } catch (error) {
    steps.push({ status: "warning", label: "Connect method failed", detail: `${error.message}. Continuing with bearer token for MCP initialize/tools calls.` });
  }
  return sessionId;
};

const discoverTools = async (server, steps, token, headers) => {
  if (!text(server.remoteaddress)) {
    steps.push({ status: "skipped", label: "No remote address configured", detail: "Stored command/arguments are available to Gemini, but local commands are not executed from the web backend." });
    return { tools: [], sessionId: "" };
  }
  let sessionId = "";
  try {
    steps.push({ status: "running", label: "Connecting to MCP server", detail: server.remoteaddress });
    if (Object.keys(headers || {}).length) steps.push({ status: "done", label: "MCP headers prepared", detail: Object.keys(headers).join(", ") });
    sessionId = await connectMcpServer({ server, token, headers, steps });
    const initialized = await tryMcpRpc({
      url: server.remoteaddress,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "CampusTechnology AI ticketing bot", version: "1.0.0" } },
      token,
      sessionId,
      extraHeaders: headers
    }).catch(() => null);
    sessionId = initialized?.sessionId || sessionId;
    const result = await tryMcpRpc({ url: server.remoteaddress, method: "tools/list", params: {}, token, sessionId, extraHeaders: headers });
    sessionId = result.sessionId || sessionId;
    const tools = result.data?.result?.tools || result.data?.tools || [];
    steps.push({ status: "done", label: "Connected", detail: `${tools.length} tool(s) discovered` });
    if (tools.length) steps.push({ status: "done", label: "Tools available", detail: tools.map((tool) => tool.name).join(", ") });
    return { tools, sessionId };
  } catch (error) {
    steps.push({ status: "warning", label: "MCP discovery failed", detail: error.message });
    return { tools: [], sessionId };
  }
};

const extractJson = (value) => {
  const raw = text(value);
  if (!raw) return null;
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

const normalizeHistory = (history) => (
  Array.isArray(history)
    ? history.slice(-20).map((item) => ({
      role: ["user", "assistant"].includes(text(item.role)) ? text(item.role) : "user",
      content: text(item.content)
    })).filter((item) => item.content)
    : []
);

exports.list = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["title", "command", "remoteaddress", "active", "default", "user"].forEach((field) => {
      if (text(req.query[field])) query[field] = new RegExp(text(req.query[field]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    });
    const data = await McpServer.find(query).sort({ default: -1, title: 1 }).lean();
    res.json({ success: true, data: data.map(safeServer) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const isUpdate = !!(req.body.id || req.body._id);
    const payload = {
      colid,
      title: text(req.body.title),
      command: text(req.body.command),
      remoteaddress: text(req.body.remoteaddress),
      headers: jsonText(req.body.headers || ""),
      arguments: jsonText(req.body.arguments || ""),
      active: yesNo(req.body.active, "Yes"),
      default: yesNo(req.body.default, "No"),
      name: text(req.body.name),
      user: text(req.body.user)
    };
    if (!isUpdate || text(req.body.token)) payload.token = text(req.body.token);
    if (!payload.title) return res.status(400).json({ success: false, message: "Title is required" });
    if (payload.default === "Yes") await McpServer.updateMany({ colid, _id: { $ne: req.body.id || req.body._id } }, { $set: { default: "No" } });
    const data = isUpdate
      ? await McpServer.findOneAndUpdate({ _id: req.body.id || req.body._id, colid }, payload, { new: true, runValidators: true })
      : await McpServer.create(payload);
    res.json({ success: true, data: safeServer(data) });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: "MCP server title already exists" });
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id || req.body._id].filter(Boolean);
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one record" });
    await McpServer.deleteMany({ _id: { $in: ids }, colid });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await McpServer.find({ colid }).lean();
    const unique = (field) => [...new Set(rows.map((row) => text(row[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    res.json({ success: true, options: { title: unique("title"), command: unique("command"), remoteaddress: unique("remoteaddress"), active: ["Yes", "No"], default: ["Yes", "No"] } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bot = async (req, res) => {
  const steps = [];
  try {
    const colid = number(req.body.colid);
    const query = text(req.body.query);
    const history = normalizeHistory(req.body.history);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!query) return res.status(400).json({ success: false, message: "Query is required" });
    steps.push({ status: "running", label: "Loading default MCP server", detail: "Searching Settings - MCP Server" });
    const server = await McpServer.findOne({ colid, active: "Yes", default: "Yes" }).sort({ _id: -1 }).lean()
      || await McpServer.findOne({ colid, active: "Yes" }).sort({ _id: -1 }).lean();
    if (!server) return res.status(400).json({ success: false, message: "Default active MCP server is not configured", steps });
    steps.push({ status: "done", label: "Default MCP server selected", detail: server.title });
    const token = text(req.body.token) || text(server.token);
    const headers = { ...parseHeaders(server.headers), ...parseHeaders(req.body.headers) };
    const discovery = await discoverTools(server, steps, token, headers);
    const tools = discovery.tools || [];
    const sessionId = discovery.sessionId || "";
    steps.push({ status: "running", label: "Sending query to Gemini", detail: "Gemini will decide the transaction plan using MCP server details and discovered tools." });
    const prompt = `You are an ERP central ticketing AI bot. Continue the conversation and help complete the user's transaction.

Conversation so far:
${history.map((item) => `${item.role.toUpperCase()}: ${item.content}`).join("\n") || "No previous messages."}

Latest user message:
${query}

Default MCP server:
${JSON.stringify({ title: server.title, command: server.command, remoteaddress: server.remoteaddress, tokenConfigured: !!token, headersConfigured: Object.keys(headers).length > 0, headerNames: Object.keys(headers), arguments: parseArguments(server.arguments), active: server.active, default: server.default }, null, 2)}

Discovered MCP tools:
${JSON.stringify(tools, null, 2)}

Return JSON only with this schema:
{
  "reply": "complete conversational response to show to the user",
  "summary": "short result summary",
  "needsUserInput": false,
  "question": "if more information is needed, ask the exact follow-up question here",
  "toolCalls": [
    { "name": "tool name from discovered tools", "arguments": { "key": "value" }, "reason": "why this call is needed" }
  ],
  "notes": ["important notes or missing data"]
}

If more information is needed from the user before calling a tool, set needsUserInput true, put the question in question, and return an empty toolCalls array.
If no MCP tool can safely complete the transaction, return an empty toolCalls array and explain the next action in reply and summary.`;
    const aiText = await callGemini({ colid, prompt, model: req.body.geminiModel || "gemini-2.5-flash" });
    steps.push({ status: "done", label: "Gemini response received", detail: "Parsing transaction plan" });
    const plan = extractJson(aiText) || { summary: aiText, toolCalls: [], notes: [] };
    const toolResults = [];
    for (const call of Array.isArray(plan.toolCalls) ? plan.toolCalls : []) {
      if (!tools.some((tool) => text(tool.name) === text(call.name))) {
        toolResults.push({ name: call.name, status: "skipped", result: "Tool was not found in MCP tools/list." });
        steps.push({ status: "warning", label: `Tool skipped: ${call.name}`, detail: "Tool was not found in discovered tools." });
        continue;
      }
      try {
        steps.push({ status: "running", label: `Using MCP tool: ${call.name}`, detail: call.reason || "Executing tool call" });
        const result = await tryMcpRpc({ url: server.remoteaddress, method: "tools/call", params: { name: call.name, arguments: call.arguments || {} }, token, sessionId, extraHeaders: headers });
        toolResults.push({ name: call.name, status: "done", result });
        steps.push({ status: "done", label: `Tool completed: ${call.name}`, detail: "MCP tool returned successfully" });
      } catch (error) {
        toolResults.push({ name: call.name, status: "error", result: error.message });
        steps.push({ status: "error", label: `Tool failed: ${call.name}`, detail: error.message });
      }
    }
    let finalGemini = "";
    if (toolResults.length) {
      steps.push({ status: "running", label: "Preparing final response", detail: "Sending MCP tool results back to Gemini for a conversational answer." });
      const finalPrompt = `You are an ERP central ticketing AI bot. Create the complete final answer for the user.

Conversation:
${[...history, { role: "user", content: query }].map((item) => `${item.role.toUpperCase()}: ${item.content}`).join("\n")}

Original Gemini plan:
${JSON.stringify(plan, null, 2)}

MCP tool results:
${JSON.stringify(toolResults, null, 2)}

Return a complete concise answer. If the transaction is incomplete, clearly ask the next question.`;
      finalGemini = await callGemini({ colid, prompt: finalPrompt, model: req.body.geminiModel || "gemini-2.5-flash" }).catch((error) => `Unable to prepare final Gemini summary: ${error.message}`);
      steps.push({ status: "done", label: "Final response ready", detail: "Gemini summarized the MCP result." });
    }
    const assistantMessage = finalGemini || plan.reply || plan.question || plan.summary || aiText;
    steps.push({ status: "done", label: "Transaction finished", detail: "Review result details below." });
    res.json({ success: true, server: safeServer(server), tools, plan, toolResults, steps, rawGemini: aiText, finalGemini, assistantMessage, needsUserInput: !!plan.needsUserInput });
  } catch (error) {
    steps.push({ status: "error", label: "AI ticketing bot failed", detail: error.message });
    res.status(500).json({ success: false, message: error.message, steps });
  }
};
