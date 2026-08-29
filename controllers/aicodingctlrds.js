const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const AiCodingPage = require("../Models/aicodingpageds");
const AiConfiguration = require("../Models/aiconfigurationds");
const OllamaConfiguration = require("../Models/ollamaconfigurationds");
const MenuAccess = require("../Models/menuaccessds");
const AiChatbotDefinition = require("../Models/aichatbotdefinitionds");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
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

const slugify = (value) => {
  const base = text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return base || `ai-page-${Date.now()}`;
};

const loadedModelDetails = () => {
  const details = {};
  mongoose.modelNames().forEach((name) => {
    try {
      const schema = mongoose.model(name).schema;
      details[name] = Object.keys(schema.paths || {}).map((field) => ({
        field,
        type: schema.paths[field]?.instance || "Mixed"
      }));
    } catch {
      details[name] = [];
    }
  });
  return details;
};

const normalizedTokens = (value) => (
  text(value).toLowerCase().split(/[^a-z0-9]+/)
    .filter((item) => item.length > 2)
    .filter((item) => !["page", "new", "view", "report", "dashboard", "details", "management", "master", "configuration", "student", "user"].includes(item))
);

const readTextFile = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
};

const resolveJsFile = (basePath) => {
  const candidates = [
    basePath,
    `${basePath}.jsx`,
    `${basePath}.js`,
    path.join(basePath, "index.jsx"),
    path.join(basePath, "index.js")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
};

const frontendRoot = () => path.join(__dirname, "../../ep3-main/src");
const backendRoot = () => path.join(__dirname, "..");

let appImportsCache = null;
let backendRoutesCache = null;

const parseAppImports = () => {
  if (appImportsCache) return appImportsCache;
  const source = readTextFile(path.join(frontendRoot(), "App.js"));
  const imports = {};
  const addImport = (name, importPath) => {
    const resolved = resolveJsFile(path.join(frontendRoot(), importPath.replace(/^\.\//, "")));
    if (name && resolved) imports[name] = resolved;
  };
  source.replace(/import\s+([A-Za-z0-9_$]+)\s+from\s+["']([^"']+)["']/g, (_, name, importPath) => {
    addImport(name, importPath);
    return _;
  });
  source.replace(/import\s+\{([\s\S]*?)\}\s+from\s+["']([^"']+)["']/g, (_, names, importPath) => {
    names.split(",").map((item) => item.trim()).filter(Boolean).forEach((item) => {
      const parts = item.split(/\s+as\s+/i).map((part) => part.trim());
      addImport(parts[1] || parts[0], importPath);
    });
    return _;
  });
  appImportsCache = { source, imports };
  return appImportsCache;
};

const extractComponentSource = (source = "", component = "") => {
  if (!source || !component) return source;
  const patterns = [
    new RegExp(`(?:export\\s+)?function\\s+${component}\\s*\\(`),
    new RegExp(`(?:export\\s+)?const\\s+${component}\\s*=\\s*(?:async\\s*)?\\(`),
    new RegExp(`(?:export\\s+)?const\\s+${component}\\s*=\\s*(?:async\\s*)?[A-Za-z0-9_$]*\\s*=>`),
    new RegExp(`class\\s+${component}\\s+extends`)
  ];
  const start = patterns.map((regex) => source.search(regex)).find((index) => index >= 0);
  if (start === undefined || start < 0) return source;
  const block = getBalancedBlock(source, start);
  return block || source;
};

const pageSourceForPath = (pagePath) => {
  const cleanPath = text(pagePath);
  if (!cleanPath) return { source: "", component: "", filePath: "" };
  const { source: appSource, imports } = parseAppImports();
  const escaped = cleanPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const routeRegex = new RegExp(`<Route\\s+path=["']${escaped}["'][\\s\\S]*?element=\\{<\\s*([A-Za-z0-9_$]+)`, "m");
  const routeMatch = appSource.match(routeRegex);
  const component = routeMatch?.[1] || "";
  const filePath = imports[component] || "";
  const fullSource = readTextFile(filePath);
  return { source: extractComponentSource(fullSource, component), component, filePath };
};

const extractApiEndpoints = (source = "") => {
  const endpoints = new Set();
  const patterns = [
    /ep1\.(?:get|post|put|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g,
    /axios\.(?:get|post|put|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g,
    /fetch\s*\(\s*["'`]([^"'`]+)["'`]/g,
    /["'`]([^"'`]*\/api\/v2\/[^"'`]+)["'`]/g
  ];
  patterns.forEach((regex) => {
    let match;
    while ((match = regex.exec(source)) !== null) {
      const endpoint = text(match[1]).replace(/\?.*$/, "");
      if (endpoint.includes("/api/v2/")) endpoints.add(endpoint.replace(/^.*?(\/api\/v2\/)/, "/api/v2/"));
      else if (endpoint.startsWith("/api/")) endpoints.add(endpoint);
    }
  });
  return Array.from(endpoints);
};

const routePatternToRegex = (routePath) => {
  const escaped = text(routePath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\:([A-Za-z0-9_]+)/g, "[^/]+");
  return new RegExp(`^${escaped}(?:/)?$`);
};

const parseBackendRoutes = () => {
  if (backendRoutesCache) return backendRoutesCache;
  const source = readTextFile(path.join(backendRoot(), "app.js"));
  const controllerFiles = {};
  source.replace(/const\s+([A-Za-z0-9_$]+)\s*=\s*require\(["']\.\/controllers\/([^"']+)["']\)/g, (_, name, file) => {
    controllerFiles[name] = resolveJsFile(path.join(backendRoot(), "controllers", file));
    return _;
  });
  const routes = [];
  source.replace(/app\.(?:get|post|put|delete)\s*\(\s*["']([^"']+)["']\s*,\s*([A-Za-z0-9_$]+)\.([A-Za-z0-9_$]+)/g, (_, routePath, controller, method) => {
    routes.push({ routePath, controller, method, controllerFile: controllerFiles[controller] || "" });
    return _;
  });
  backendRoutesCache = routes;
  return backendRoutesCache;
};

const matchBackendRoute = (endpoint, routes) => {
  const cleanEndpoint = text(endpoint).replace(/\?.*$/, "");
  const exact = routes.find((route) => route.routePath === cleanEndpoint);
  if (exact) return exact;
  return routes.find((route) => routePatternToRegex(route.routePath).test(cleanEndpoint))
    || routes.find((route) => cleanEndpoint.startsWith(route.routePath.replace(/\/:[^/]+/g, "")));
};

const getBalancedBlock = (source, startIndex) => {
  const openIndex = source.indexOf("{", startIndex);
  if (openIndex < 0) return "";
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(openIndex, index + 1);
  }
  return "";
};

const modelNameFromModelFile = (modelPath) => {
  const source = readTextFile(modelPath);
  const match = source.match(/mongoose\.model\s*\(\s*["']([^"']+)["']/);
  return match?.[1] || "";
};

const modelsUsedByControllerMethod = (controllerFile, methodName) => {
  const source = readTextFile(controllerFile);
  if (!source) return [];
  const modelVars = {};
  source.replace(/const\s+([A-Za-z0-9_$]+)\s*=\s*require\(["']\.\.\/Models\/([^"']+)["']\)/g, (_, varName, modelFile) => {
    const modelName = modelNameFromModelFile(resolveJsFile(path.join(backendRoot(), "Models", modelFile))) || varName;
    modelVars[varName] = modelName;
    return _;
  });
  const exportIndex = source.search(new RegExp(`exports\\.${methodName}\\s*=`));
  const body = exportIndex >= 0 ? getBalancedBlock(source, exportIndex) : "";
  const scan = body || source;
  return Object.entries(modelVars)
    .filter(([varName]) => new RegExp(`\\b${varName}\\s*\\.`).test(scan) || new RegExp(`\\b${varName}\\b`).test(scan))
    .map(([, modelName]) => modelName);
};

const directModelReferencesFromSource = (source = "", modelDetails = {}) => {
  const names = Object.keys(modelDetails || {});
  return names.filter((name) => new RegExp(`\\b${name}\\b`, "i").test(source));
};

const actualModelsForPage = (page = {}, modelDetails = {}) => {
  const { source } = pageSourceForPath(page.path);
  if (!source) return [];
  const found = new Set(directModelReferencesFromSource(source, modelDetails));
  const routes = parseBackendRoutes();
  extractApiEndpoints(source).forEach((endpoint) => {
    const route = matchBackendRoute(endpoint, routes);
    if (!route?.controllerFile || !route?.method) return;
    modelsUsedByControllerMethod(route.controllerFile, route.method).forEach((modelName) => {
      if (modelDetails[modelName]) found.add(modelName);
    });
  });
  return Array.from(found).sort((a, b) => a.localeCompare(b));
};

const suggestModelsForPage = (page = {}, modelDetails = {}) => (
  actualModelsForPage(page, modelDetails).slice(0, 12)
);

const fallbackSuggestModelsForPage = (page = {}, modelDetails = {}) => (
  Object.entries(modelDetails).map(([modelName, fields]) => {
    const pageTokens = new Set(normalizedTokens(`${page.group || ""} ${page.page || ""} ${page.path || ""}`));
    const modelTokens = new Set([
      ...normalizedTokens(modelName),
      ...(fields || []).flatMap((field) => normalizedTokens(field.field))
    ]);
    let score = 0;
    const normalizedModelName = modelName.toLowerCase().replace(/ds\d*$/i, "");
    pageTokens.forEach((token) => {
      if (normalizedModelName === token || normalizedModelName.includes(token)) score += 4;
      if ((page.path || "").toLowerCase().includes(normalizedModelName) && normalizedModelName.length > 5) score += 8;
      if (modelTokens.has(token)) score += 1;
    });
    return { modelName, score };
  }).filter((item) => item.score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.modelName)
);

const modelSuggestionsForPage = (page = {}, modelDetails = {}) => {
  const exact = suggestModelsForPage(page, modelDetails);
  return exact.length ? exact : fallbackSuggestModelsForPage(page, modelDetails);
};

const loadStaticMenuPages = () => {
  try {
    const filePath = path.join(__dirname, "../../ep3-main/src/pages/menuall.js");
    if (!fs.existsSync(filePath)) return [];
    const source = fs.readFileSync(filePath, "utf8");
    const pages = [];
    const accordionRegex = /<Accordion>[\s\S]*?<AccordionSummary[\s\S]*?<Typography[^>]*>\s*([^<]+?)\s*<\/Typography>[\s\S]*?<AccordionDetails>([\s\S]*?)<\/AccordionDetails>[\s\S]*?<\/Accordion>/g;
    let accordionMatch;
    while ((accordionMatch = accordionRegex.exec(source)) !== null) {
      const group = text(accordionMatch[1]);
      const body = accordionMatch[2] || "";
      const itemRegex = /<ListItem[\s\S]*?to="([^"]+)"[\s\S]*?primary="([^"]+)"/g;
      let itemMatch;
      while ((itemMatch = itemRegex.exec(body)) !== null) {
        pages.push({ group, path: text(itemMatch[1]), page: text(itemMatch[2]) });
      }
      const mappedPairRegex = /\[\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\]/g;
      let pairMatch;
      while ((pairMatch = mappedPairRegex.exec(body)) !== null) {
        pages.push({ group, path: text(pairMatch[1]), page: text(pairMatch[2]) });
      }
      if (!body.match(/<ListItem[\s\S]*?to="/) && group) {
        pages.push({ group, path: "", page: group });
      }
    }
    return pages;
  } catch {
    return [];
  }
};

const getGeminiConfig = async (colid) => (
  await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i, default: /^yes$/i }).sort({ _id: -1 }).lean()
  || await AiConfiguration.findOne({ colid, type: /^gemini$/i, active: /^yes$/i }).sort({ _id: -1 }).lean()
);

const getOllamaConfig = async (colid, id) => {
  const query = { colid, active: /^yes$/i };
  return id
    ? OllamaConfiguration.findOne({ ...query, _id: id }).lean()
    : (await OllamaConfiguration.findOne({ ...query, default: /^yes$/i }).sort({ _id: -1 }).lean()
      || await OllamaConfiguration.findOne(query).sort({ _id: -1 }).lean());
};

const readGeminiText = (payload = {}) => (
  payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || ""
);

const callGemini = async ({ colid, model, prompt }) => {
  const config = await getGeminiConfig(colid);
  if (!config?.apikey) throw new Error("Active/default Gemini configuration is missing");
  const requested = text(model) || "gemini-2.5-flash-lite";
  const candidates = [requested, "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-1.5-flash"];
  let lastError = "";
  for (const geminiModel of [...new Set(candidates)]) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return readGeminiText(data);
    lastError = data?.error?.message || `Gemini request failed for ${geminiModel}`;
  }
  throw new Error(lastError || "Gemini request failed");
};

const callOllama = async ({ colid, ollamaConfigId, prompt }) => {
  const config = await getOllamaConfig(colid, ollamaConfigId);
  if (!config?.serveraddress || !config?.modelname) throw new Error("Active Ollama configuration is missing");
  const response = await fetch(`${String(config.serveraddress).replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.modelname, prompt, stream: false })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Ollama request failed");
  return data.response || "";
};

const extractJson = (raw) => {
  const cleaned = text(raw).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1));
  }
  throw new Error("AI response did not include valid JSON");
};

const fallbackSchema = (body = {}) => ({
  title: text(body.title) || "Generated Page",
  layout: "dashboard",
  primaryModel: Array.isArray(body.selectedModels) && body.selectedModels.length ? body.selectedModels[0] : "",
  dataSource: {
    model: Array.isArray(body.selectedModels) && body.selectedModels.length ? body.selectedModels[0] : "",
    mode: "crud",
    colidScoped: true,
    loadOnRun: false,
    pageSize: 100
  },
  cards: [
    { label: "Total Rows", aggregate: "count" },
    { label: "Selected Models", value: Array.isArray(body.selectedModels) ? body.selectedModels.length : 0 },
    { label: "Provider", value: text(body.provider) || "Gemini" }
  ],
  filters: [
    { name: "academicYear", label: "Academic Year", type: "text" },
    { name: "status", label: "Status", type: "select", options: ["Active", "Pending", "Closed"] }
  ],
  formFields: [
    { name: "title", label: "Title", type: "text", required: true },
    { name: "description", label: "Description", type: "textarea" },
    { name: "status", label: "Status", type: "select", options: ["Active", "Pending", "Closed"] }
  ],
  tableColumns: [
    { field: "title", headerName: "Title" },
    { field: "description", headerName: "Description" },
    { field: "status", headerName: "Status" }
  ],
  sampleRows: []
});

const buildPrompt = (body, modelDetails) => `
You are generating a React MUI ERP page for CampusTechnology.
Return ONLY JSON. No markdown.
The JSON must have:
{
  "title": "short page title",
  "slug": "url-safe-slug",
  "pageCode": "complete React component code as a string for developer review",
    "pageSchema": {
      "title": "title",
      "layout": "dashboard|crud|report",
      "primaryModel": "one selected model name used as the main data source",
      "dataSource": {"model":"selected model name", "mode":"crud|report", "colidScoped":true, "loadOnRun":false, "pageSize":100},
      "cards": [{"label":"Total Records", "aggregate":"count"}, {"label":"Total Amount", "aggregate":"sum", "valueField":"exactNumericField", "format":"currency"}, {"label":"Average", "aggregate":"avg", "valueField":"exactNumericField"}],
      "filters": [{"name":"exactModelFieldName", "label":"...", "type":"text|select|date|number", "options":["..."]}],
      "formFields": [{"name":"...", "label":"...", "type":"text|textarea|select|date|number", "required":true, "options":["..."]}],
      "tableColumns": [{"field":"...", "headerName":"..."}],
      "charts": [{"type":"bar|pie|line", "title":"...", "labelField":"exactGroupField", "valueField":"exactNumericField", "aggregate":"count|sum|avg", "limit":12}],
      "sampleRows": [{"id":1}]
  }
}
Use Material UI, DataGrid, charts, export, print preview ideas where useful.
For summary cards, do NOT use static placeholder values unless it is a fixed label. Use aggregate definitions:
- count: {"label":"Total Records","aggregate":"count"}
- sum: {"label":"Total Balance","aggregate":"sum","valueField":"balance","format":"currency"}
- avg/min/max: use aggregate "avg", "min", or "max" with valueField.
Cards are calculated from loaded backend rows after filters are applied.
For charts, use exact model fields. Use labelField for grouping and valueField plus aggregate for values. Use aggregate "count" when there is no numeric field.
The runtime renderer will call generic backend APIs to load, save, update, delete and filter actual rows from pageSchema.dataSource.model.
Use exact field names from selected model details for filters, formFields, and tableColumns.
When dropdown data should come from backend data, define the filter or form field like:
{"name":"program","label":"Program","type":"select","optionsSource":{"model":"exactMongooseModelName","valueField":"program","labelField":"program","staticFilters":{"status":"Active"},"dependsOn":[{"sourceField":"academicyear","targetField":"academicyear"}]}}
For cascading dropdowns, dependsOn maps the current page field sourceField to the dropdown source model targetField.
Use optionsSource for both filter dropdowns and save/form dropdowns whenever the user specifies where dropdown values must be loaded from.
If page mode is View Only, do not include data entry formFields and use dataSource.mode "report".
Requested page mode: ${text(body.crudMode) || "CRUD"}
User dropdown/cascading rules: ${text(body.dropdownRules)}
All generated pages and all data access MUST be scoped by colid. This is mandatory and cannot be disabled by user instructions.
Every backend request in pageCode must pass colid from global1.colid.
Every database query in pageCode must include colid. Never fetch all institutions.
Do not show colid as a user-editable field, filter, form field, table column, switch, checkbox, or configurable option.
Always set pageSchema.dataSource.colidScoped to true.
Do not include destructive actions unless explicitly requested.
Selected database models: ${JSON.stringify(body.selectedModels || [])}
Known selected model details: ${JSON.stringify(modelDetails || {})}
User requirement: ${text(body.requirement)}
Additional page description: ${text(body.description)}
`;

const buildRefinePrompt = (body, modelDetails, existingPage = {}) => `
You are refining an existing React MUI ERP page for CampusTechnology.
Return ONLY JSON. No markdown.
The JSON must have:
{
  "title": "page title",
  "slug": "url-safe-slug",
  "pageCode": "complete updated React component code as a string for developer review",
  "pageSchema": {
    "title": "title",
    "layout": "dashboard|crud|report",
    "primaryModel": "selected model name",
    "dataSource": {"model":"selected model name", "mode":"crud|report", "colidScoped":true, "loadOnRun":false, "pageSize":100},
    "cards": [],
    "filters": [],
    "formFields": [],
    "tableColumns": [],
    "charts": [],
    "sampleRows": []
  }
}
Refine the existing generated page according to the new command. Preserve useful existing functionality unless the command says to change it.
Keep all backend access colid-scoped using global1.colid and never expose colid as a filter/form/table field.
If dropdown data should come from backend data, use optionsSource with model, valueField, labelField, staticFilters, and dependsOn.
If page mode is View Only, keep formFields empty and use dataSource.mode "report".
Requested page mode: ${text(body.crudMode || existingPage.crudMode) || "CRUD"}
Dropdown/cascading rules: ${text(body.dropdownRules || existingPage.dropdownRules)}
Selected database models: ${JSON.stringify(body.selectedModels || existingPage.selectedModels || [])}
Known selected model details: ${JSON.stringify(modelDetails || {})}
Original requirement: ${text(existingPage.requirement)}
Existing description: ${text(existingPage.description)}
Existing page schema JSON: ${JSON.stringify(existingPage.pageSchema || {})}
Existing page code: ${text(existingPage.pageCode)}
New refinement command: ${text(body.refinementCommand)}
Additional content/rules from user: ${text(body.description)}
`;

const getModelForPage = async ({ colid, pageId, modelName }) => {
  if (!pageId) throw new Error("pageId is required");
  const page = await AiCodingPage.findOne({ _id: pageId, colid }).lean();
  if (!page) throw new Error("Generated page not found");
  const allowedModels = new Set([...(page.selectedModels || []), page.pageSchema?.primaryModel, page.pageSchema?.dataSource?.model].filter(Boolean));
  if (!allowedModels.has(modelName)) throw new Error("Model is not allowed for this generated page");
  if (!mongoose.modelNames().includes(modelName)) throw new Error("Model is not available");
  const Model = mongoose.model(modelName);
  if (!Object.prototype.hasOwnProperty.call(Model.schema.paths || {}, "colid")) {
    throw new Error("Selected model does not contain colid. AI generated pages must use colid-scoped models only.");
  }
  return { page, Model };
};

const schemaFields = (Model) => new Set(Object.keys(Model.schema.paths || {}));

const buildModelQuery = (Model, body = {}) => {
  const fields = schemaFields(Model);
  const query = {};
  if (!fields.has("colid")) throw new Error("Selected model does not contain colid.");
  if (num(body.colid) === undefined) throw new Error("colid is required for generated page data access.");
  query.colid = num(body.colid);
  Object.entries(body.filters || {}).forEach(([field, value]) => {
    if (!fields.has(field)) return;
    if (value === undefined || value === null || value === "") return;
    const path = Model.schema.paths[field];
    if (path?.instance === "Number") {
      const parsed = num(value);
      if (parsed !== undefined) query[field] = parsed;
    } else if (path?.instance === "Date") {
      query[field] = new Date(value);
    } else {
      query[field] = new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
  });
  return query;
};

const sanitizePayload = (Model, body = {}) => {
  const fields = schemaFields(Model);
  const payload = {};
  Object.entries(body.data || {}).forEach(([field, value]) => {
    if (!fields.has(field) || field === "_id" || field === "__v") return;
    payload[field] = value;
  });
  if (!fields.has("colid")) throw new Error("Selected model does not contain colid.");
  if (num(body.colid) === undefined) throw new Error("colid is required for generated page save.");
  payload.colid = num(body.colid);
  if (fields.has("user") && !payload.user && body.user) payload.user = text(body.user);
  if (fields.has("createdby") && !payload.createdby && body.createdby) payload.createdby = text(body.createdby);
  if (fields.has("name") && !payload.name && body.createdby) payload.name = text(body.createdby);
  return payload;
};

const normalizePageSchema = (schema = {}, body = {}) => {
  const selectedModels = Array.isArray(body.selectedModels) ? body.selectedModels : [];
  const primaryModel = text(schema.primaryModel || schema.dataSource?.model || selectedModels[0]);
  const viewOnly = /^view\s*only$/i.test(text(body.crudMode)) || /^view$/i.test(text(body.crudMode));
  const blockedField = (item = {}) => text(item.name || item.field).toLowerCase() !== "colid";
  const cleaned = { ...schema };
  delete cleaned.colidScoped;
  return {
    ...cleaned,
    colidScoped: true,
    primaryModel,
    dataSource: {
      ...(schema.dataSource || {}),
      model: text(schema.dataSource?.model || primaryModel),
      mode: viewOnly ? "report" : (text(schema.dataSource?.mode) || "crud"),
      colidScoped: true,
      loadOnRun: !!schema.dataSource?.loadOnRun,
      pageSize: Math.min(Math.max(num(schema.dataSource?.pageSize) || 100, 1), 1000)
    },
    filters: Array.isArray(schema.filters) ? schema.filters.filter(blockedField) : [],
    formFields: viewOnly ? [] : (Array.isArray(schema.formFields) ? schema.formFields.filter(blockedField) : []),
    tableColumns: Array.isArray(schema.tableColumns) ? schema.tableColumns.filter(blockedField) : []
  };
};

const withColidPolicyComment = (code = "") => {
  const policy = "/* AI Coding policy: every backend request and database query in this generated page must be scoped by colid from global1.colid. Do not expose colid as an editable user field. */";
  const value = text(code);
  return value.includes("AI Coding policy: every backend request") ? value : `${policy}\n${value}`;
};

exports.options = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const roleMenuOnly = /^true$/i.test(text(req.query.roleMenuOnly));
    const role = text(req.query.role);
    const modelDetails = loadedModelDetails();
    const isAllRole = /^all$/i.test(role);
    const roleVariants = Array.from(new Set([role, role.toLowerCase(), role.toUpperCase(), role.replace(/\b\w/g, (char) => char.toUpperCase()), "All", "ALL", "all"].filter(Boolean)));
    const menuQuery = { colid, access: { $ne: "Deny" } };
    if (roleMenuOnly && roleVariants.length && !isAllRole) menuQuery.role = { $in: roleVariants };
    const chatbotQuery = roleMenuOnly && roleVariants.length && !isAllRole ? { colid, role: { $in: roleVariants } } : { colid };
    const [ollamaConfigs, menuRows, chatbotRows] = await Promise.all([
      colid === undefined ? [] : OllamaConfiguration.find({ colid, active: /^yes$/i }).sort({ default: -1, name: 1 }).lean(),
      colid === undefined ? [] : MenuAccess.find(menuQuery).select("menugroup groupname title path role access").sort({ menugroup: 1, title: 1 }).lean(),
      colid === undefined ? [] : AiChatbotDefinition.find(chatbotQuery).select("menugroup pagename pagelink role").sort({ menugroup: 1, pagename: 1 }).lean()
    ]);
    const pageMap = new Map();
    const addPage = (group, page, path) => {
      const cleanPage = text(page);
      const cleanPath = text(path);
      if (!cleanPage && !cleanPath) return;
      const key = `${text(group) || "Other"}|${cleanPage}|${cleanPath}`;
      pageMap.set(key, { group: text(group) || "Other", page: cleanPage || cleanPath, path: cleanPath });
    };
    if (!roleMenuOnly || isAllRole) loadStaticMenuPages().forEach((row) => addPage(row.group, row.page, row.path));
    menuRows.forEach((row) => addPage(row.groupname || row.menugroup, row.title, row.path));
    chatbotRows.forEach((row) => addPage(row.menugroup, row.pagename, row.pagelink));
    const pageOptions = Array.from(pageMap.values()).map((page) => ({
      ...page,
      suggestedModels: modelSuggestionsForPage(page, modelDetails)
    }));
    res.json({
      success: true,
      geminiModels,
      ollamaConfigs,
      models: Object.keys(modelDetails).sort(),
      modelDetails,
      pageGroups: Array.from(new Set(pageOptions.map((page) => page.group))).sort((a, b) => a.localeCompare(b)),
      pageOptions
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.list = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    if (String(req.query.mineOnly || "").toLowerCase() === "true") {
      const user = text(req.query.user);
      if (!user) return res.status(400).json({ success: false, message: "user is required for my pages" });
      query.user = user;
    }
    if (text(req.query.status)) query.status = text(req.query.status);
    if (text(req.query.search)) query.$or = [
      { title: new RegExp(text(req.query.search), "i") },
      { slug: new RegExp(text(req.query.search), "i") },
      { requirement: new RegExp(text(req.query.search), "i") }
    ];
    const rows = await AiCodingPage.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.generate = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!text(req.body.requirement)) return res.status(400).json({ success: false, message: "Requirement is required" });

    const allDetails = loadedModelDetails();
    const modelDetails = {};
    (req.body.selectedModels || []).forEach((name) => { modelDetails[name] = allDetails[name] || []; });
    const prompt = buildPrompt(req.body, modelDetails);
    const raw = /^ollama$/i.test(text(req.body.provider))
      ? await callOllama({ colid, ollamaConfigId: req.body.ollamaConfigId, prompt })
      : await callGemini({ colid, model: req.body.geminiModel, prompt });

    let parsed;
    try {
      parsed = extractJson(raw);
    } catch {
      parsed = {
        title: text(req.body.title) || "Generated Page",
        slug: slugify(req.body.title || req.body.requirement),
        pageCode: raw || "",
        pageSchema: fallbackSchema(req.body)
      };
    }

    const payload = {
      colid,
      title: text(req.body.title || parsed.title) || "Generated Page",
      slug: slugify(req.body.title || parsed.slug || parsed.title || req.body.requirement),
      description: text(req.body.description),
      requirement: text(req.body.requirement),
      provider: text(req.body.provider) || "Gemini",
      geminiModel: text(req.body.geminiModel) || "gemini-2.5-flash-lite",
      ollamaConfigId: text(req.body.ollamaConfigId),
      crudMode: text(req.body.crudMode) || "CRUD",
      dropdownRules: text(req.body.dropdownRules),
      selectedModels: req.body.selectedModels || [],
      modelDetails,
      pageCode: withColidPolicyComment(parsed.pageCode || raw),
      pageSchema: normalizePageSchema(parsed.pageSchema || fallbackSchema(req.body), req.body),
      status: "Generated",
      createdby: text(req.body.createdby || req.body.name),
      user: text(req.body.user)
    };
    const row = await AiCodingPage.create(payload);
    res.json({ success: true, row, raw });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.refine = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const id = text(req.body.id || req.body.pageId);
    if (!id) return res.status(400).json({ success: false, message: "Generated page id is required" });
    if (!text(req.body.refinementCommand)) return res.status(400).json({ success: false, message: "Refinement command is required" });
    const existingPage = await AiCodingPage.findOne({ _id: id, colid }).lean();
    if (!existingPage) return res.status(404).json({ success: false, message: "Generated page not found" });

    const selectedModels = Array.from(new Set([...(existingPage.selectedModels || []), ...(req.body.selectedModels || [])].filter(Boolean)));
    const allDetails = loadedModelDetails();
    const modelDetails = {};
    selectedModels.forEach((name) => { modelDetails[name] = allDetails[name] || []; });
    const refineBody = {
      ...req.body,
      selectedModels,
      crudMode: text(req.body.crudMode || existingPage.crudMode) || "CRUD",
      dropdownRules: text(req.body.dropdownRules || existingPage.dropdownRules)
    };
    const prompt = buildRefinePrompt(refineBody, modelDetails, existingPage);
    const raw = /^ollama$/i.test(text(req.body.provider || existingPage.provider))
      ? await callOllama({ colid, ollamaConfigId: req.body.ollamaConfigId || existingPage.ollamaConfigId, prompt })
      : await callGemini({ colid, model: req.body.geminiModel || existingPage.geminiModel, prompt });

    let parsed;
    try {
      parsed = extractJson(raw);
    } catch {
      parsed = {
        title: existingPage.title,
        slug: existingPage.slug,
        pageCode: raw || existingPage.pageCode || "",
        pageSchema: existingPage.pageSchema || fallbackSchema(refineBody)
      };
    }

    const updateFields = {
      title: text(req.body.title || parsed.title || existingPage.title) || existingPage.title,
      slug: slugify(req.body.title || parsed.slug || parsed.title || existingPage.slug || existingPage.title),
      description: text(req.body.description || existingPage.description),
      requirement: text(existingPage.requirement),
      provider: text(req.body.provider || existingPage.provider) || "Gemini",
      geminiModel: text(req.body.geminiModel || existingPage.geminiModel) || "gemini-2.5-flash-lite",
      ollamaConfigId: text(req.body.ollamaConfigId || existingPage.ollamaConfigId),
      crudMode: refineBody.crudMode,
      dropdownRules: refineBody.dropdownRules,
      selectedModels,
      modelDetails,
      pageCode: withColidPolicyComment(parsed.pageCode || raw),
      pageSchema: normalizePageSchema(parsed.pageSchema || existingPage.pageSchema || fallbackSchema(refineBody), refineBody),
      status: "Refined",
      user: text(existingPage.user || req.body.user),
      createdby: text(existingPage.createdby || req.body.createdby || req.body.name)
    };
    const update = {
      $set: updateFields,
      $push: {
        refinementHistory: {
          command: text(req.body.refinementCommand),
          user: text(req.body.user),
          name: text(req.body.createdby || req.body.name),
          createdAt: new Date()
        }
      }
    };
    const row = await AiCodingPage.findOneAndUpdate({ _id: id, colid }, update, { new: true });
    res.json({ success: true, row, raw });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.save = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = {
      title: text(req.body.title),
      slug: slugify(req.body.slug || req.body.title),
      description: text(req.body.description),
      requirement: text(req.body.requirement),
      provider: text(req.body.provider) || "Gemini",
      geminiModel: text(req.body.geminiModel),
      ollamaConfigId: text(req.body.ollamaConfigId),
      crudMode: text(req.body.crudMode) || "CRUD",
      dropdownRules: text(req.body.dropdownRules),
      selectedModels: req.body.selectedModels || [],
      modelDetails: req.body.modelDetails || {},
      pageCode: withColidPolicyComment(req.body.pageCode),
      pageSchema: normalizePageSchema(req.body.pageSchema || fallbackSchema(req.body), req.body),
      status: text(req.body.status) || "Saved",
      createdby: text(req.body.createdby || req.body.name),
      user: text(req.body.user)
    };
    const row = req.body.id
      ? await AiCodingPage.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true })
      : await AiCodingPage.create({ ...payload, colid });
    res.json({ success: true, row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const query = { colid, _id: { $in: ids } };
    if (String(req.body.mineOnly || "").toLowerCase() === "true") {
      const user = text(req.body.user);
      if (!user) return res.status(400).json({ success: false, message: "user is required for my pages" });
      query.user = user;
    }
    await AiCodingPage.deleteMany(query);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.modelData = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const modelName = text(req.body.modelName);
    const { Model } = await getModelForPage({ colid, pageId: req.body.pageId, modelName });
    const query = buildModelQuery(Model, req.body);
    const limit = Math.min(Math.max(num(req.body.limit) || 100, 1), 1000);
    const rows = await Model.find(query).sort({ _id: -1 }).limit(limit).lean();
    res.json({ success: true, rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.modelOptions = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const modelName = text(req.body.modelName);
    const valueField = text(req.body.valueField);
    const labelField = text(req.body.labelField || req.body.valueField);
    if (!mongoose.modelNames().includes(modelName)) return res.status(400).json({ success: false, message: "Model is not available" });
    const Model = mongoose.model(modelName);
    const fields = schemaFields(Model);
    if (!fields.has("colid")) return res.status(400).json({ success: false, message: "Dropdown source model must contain colid" });
    if (!fields.has(valueField)) return res.status(400).json({ success: false, message: "Dropdown value field is not available" });
    const query = { colid };
    Object.entries(req.body.filters || {}).forEach(([field, value]) => {
      if (!fields.has(field) || value === undefined || value === null || value === "") return;
      const path = Model.schema.paths[field];
      if (path?.instance === "Number") {
        const parsed = num(value);
        if (parsed !== undefined) query[field] = parsed;
      } else if (path?.instance === "Date") {
        query[field] = new Date(value);
      } else {
        query[field] = new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      }
    });
    const selectFields = [valueField, fields.has(labelField) ? labelField : ""].filter(Boolean).join(" ");
    const limit = Math.min(Math.max(num(req.body.limit) || 500, 1), 1000);
    const rows = await Model.find(query).select(selectFields).limit(limit).lean();
    const seen = new Set();
    const options = rows.map((row) => ({
      value: row[valueField],
      label: text(row[labelField] || row[valueField])
    })).filter((option) => {
      const key = `${text(option.value)}|${option.label}`;
      if (!text(option.value) && !option.label) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.label.localeCompare(b.label));
    res.json({ success: true, options });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.modelSave = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const modelName = text(req.body.modelName);
    const { Model } = await getModelForPage({ colid, pageId: req.body.pageId, modelName });
    const payload = sanitizePayload(Model, req.body);
    const colidQuery = schemaFields(Model).has("colid") ? { colid } : {};
    const row = req.body.id
      ? await Model.findOneAndUpdate({ _id: req.body.id, ...colidQuery }, payload, { new: true })
      : await Model.create(payload);
    res.json({ success: true, row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.modelDelete = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const modelName = text(req.body.modelName);
    const { Model } = await getModelForPage({ colid, pageId: req.body.pageId, modelName });
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
    const colidQuery = schemaFields(Model).has("colid") ? { colid } : {};
    await Model.deleteMany({ ...colidQuery, _id: { $in: ids } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
