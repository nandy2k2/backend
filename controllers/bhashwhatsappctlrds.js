const mongoose = require("mongoose");
const User = require("../Models/user");
const BhashWhatsappConfig = require("../Models/bhashwhatsappconfigds");
const BhashWhatsappLog = require("../Models/bhashwhatsapplogds");

const text = (value) => (value === undefined || value === null ? "" : String(value).trim());
const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const allowedFilterFields = [
  "role", "academicyear", "admissionyear", "regulation", "program", "programcode",
  "semester", "section", "department", "designation", "category", "gender",
  "city", "state", "institution", "excluded", "notification", "name", "email", "phone"
];

const userProjection = "name email phone role department designation academicyear admissionyear regulation program programcode semester section regno rollno category gender city state institution";
const defaultBaseUrl = "https://developer.bhashsms.com";
const defaultEndpoints = {
  authenticateEndpoint: `${defaultBaseUrl}/appAuthenticate`,
  refreshEndpoint: `${defaultBaseUrl}/appRefresh`,
  getTemplatesEndpoint: `${defaultBaseUrl}/getAllTemplates`,
  createTemplateEndpoint: `${defaultBaseUrl}/createApiTemplate`,
  endpoint: `${defaultBaseUrl}/sendMessage`
};

const parseJsonObject = (value) => {
  const raw = text(value);
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON value must be an object");
  }
  return parsed;
};

const setNested = (target, path, value) => {
  const parts = text(path).split(".").map((item) => item.trim()).filter(Boolean);
  if (!parts.length) return;
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) current[key] = {};
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
};

const replaceTokens = (value, tokens = {}) => {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
      const replacement = tokens[key];
      return replacement === undefined || replacement === null ? "" : String(replacement);
    });
  }
  if (Array.isArray(value)) return value.map((item) => replaceTokens(item, tokens));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTokens(item, tokens)]));
  }
  return value;
};

const normalizePhone = (value, countryCode = "") => {
  let phone = text(value).replace(/[^\d+]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  const cc = text(countryCode).replace(/[^\d]/g, "");
  if (cc && phone.length === 10) phone = `${cc}${phone}`;
  return phone;
};

const buildUserQuery = (body = {}) => {
  const colid = numberValue(body.colid);
  if (!colid) throw new Error("College id is required");
  const query = { colid };
  const filters = Array.isArray(body.dynamicFilters) ? body.dynamicFilters : [];
  filters.forEach((filter) => {
    const field = text(filter.field);
    if (!allowedFilterFields.includes(field)) return;
    const values = Array.isArray(filter.values) ? filter.values.map(text).filter(Boolean) : [];
    const singleValue = text(filter.value);
    if (values.length) query[field] = { $in: values };
    else if (singleValue) query[field] = singleValue;
  });
  return query;
};

const listConfigs = async (req, res) => {
  try {
    const colid = numberValue(req.query.colid);
    if (!colid) return res.status(400).json({ error: "College id is required" });
    const query = { colid };
    if (text(req.query.active) === "true") query.isactive = true;
    const rows = await BhashWhatsappConfig.find(query).sort({ isactive: -1, updatedAt: -1 }).lean();
    return res.json({ data: rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const saveConfig = async (req, res) => {
  try {
    const body = req.body || {};
    const colid = numberValue(body.colid);
    if (!colid) return res.status(400).json({ error: "College id is required" });
    const baseUrl = text(body.baseUrl) || defaultBaseUrl;
    const withDefault = (field) => text(body[field]) || `${baseUrl}${new URL(defaultEndpoints[field]).pathname}`;
    if (text(body.headersJson)) parseJsonObject(body.headersJson);
    if (text(body.extraPayload)) parseJsonObject(body.extraPayload);
    if (text(body.authenticatePayloadJson)) parseJsonObject(body.authenticatePayloadJson);
    if (text(body.refreshPayloadJson)) parseJsonObject(body.refreshPayloadJson);
    if (text(body.templatePayloadJson)) parseJsonObject(body.templatePayloadJson);
    if (text(body.sendPayloadJson)) parseJsonObject(body.sendPayloadJson);
    const payload = {
      colid,
      name: text(body.name) || "BhashSMS WhatsApp",
      baseUrl,
      endpoint: withDefault("endpoint"),
      authenticateEndpoint: withDefault("authenticateEndpoint"),
      refreshEndpoint: withDefault("refreshEndpoint"),
      getTemplatesEndpoint: withDefault("getTemplatesEndpoint"),
      createTemplateEndpoint: withDefault("createTemplateEndpoint"),
      method: text(body.method).toUpperCase() === "GET" ? "GET" : "POST",
      authType: ["None", "Bearer", "Header", "Basic", "Query"].includes(text(body.authType)) ? text(body.authType) : "Header",
      authHeaderName: text(body.authHeaderName) || "Authorization",
      apiKey: text(body.apiKey),
      username: text(body.username),
      password: text(body.password),
      accessToken: text(body.accessToken),
      refreshToken: text(body.refreshToken),
      tokenExpiresAt: body.tokenExpiresAt || undefined,
      sender: text(body.sender),
      defaultCountryCode: text(body.defaultCountryCode) || "91",
      phoneField: text(body.phoneField) || "phone",
      toParam: text(body.toParam) || "to",
      messageParam: text(body.messageParam) || "message",
      titleParam: text(body.titleParam) || "title",
      templateName: text(body.templateName),
      languageCode: text(body.languageCode),
      headersJson: text(body.headersJson),
      extraPayload: text(body.extraPayload),
      authenticatePayloadJson: text(body.authenticatePayloadJson) || "{\"username\":\"{{username}}\",\"password\":\"{{password}}\"}",
      refreshPayloadJson: text(body.refreshPayloadJson) || "{\"refreshToken\":\"{{refreshToken}}\"}",
      templatePayloadJson: text(body.templatePayloadJson) || "{\"templateName\":\"{{templateName}}\",\"languageCode\":\"{{languageCode}}\",\"content\":\"{{content}}\"}",
      sendPayloadJson: text(body.sendPayloadJson) || "{\"to\":\"{{to}}\",\"message\":\"{{message}}\",\"templateName\":\"{{templateName}}\",\"languageCode\":\"{{languageCode}}\"}",
      isactive: body.isactive !== false && body.isactive !== "false",
      notes: text(body.notes),
      user: text(body.user)
    };
    const id = text(body._id || body.id);
    const row = id && mongoose.Types.ObjectId.isValid(id)
      ? await BhashWhatsappConfig.findOneAndUpdate({ _id: id, colid }, payload, { new: true, upsert: false })
      : await BhashWhatsappConfig.create(payload);
    return res.json({ data: row });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const deleteConfig = async (req, res) => {
  try {
    const colid = numberValue(req.body.colid);
    const id = text(req.body.id || req.body._id);
    if (!colid || !mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Valid id and college id are required" });
    await BhashWhatsappConfig.deleteOne({ _id: id, colid });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const filterOptions = async (req, res) => {
  try {
    const colid = numberValue(req.query.colid);
    const field = text(req.query.field);
    if (!colid) return res.status(400).json({ error: "College id is required" });
    if (!allowedFilterFields.includes(field)) return res.status(400).json({ error: "Invalid filter field" });
    const rows = await User.distinct(field, { colid, [field]: { $nin: [null, ""] } });
    return res.json({ data: rows.map(text).filter(Boolean).sort((a, b) => a.localeCompare(b)) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const searchUsers = async (req, res) => {
  try {
    const query = buildUserQuery(req.body || {});
    const limit = Math.min(Math.max(numberValue(req.body.limit) || 1000, 1), 10000);
    const rows = await User.find(query).select(userProjection).sort({ name: 1, email: 1 }).limit(limit).lean();
    return res.json({ data: rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const createRequest = (config, phone, title, content) => {
  const basePayload = text(config.sendPayloadJson) ? parseJsonObject(config.sendPayloadJson) : {};
  const payload = { ...basePayload, ...parseJsonObject(config.extraPayload) };
  const tokens = {
    to: phone,
    mobile: phone,
    phone,
    message: content,
    content,
    title,
    templateName: text(config.templateName),
    languageCode: text(config.languageCode),
    sender: text(config.sender)
  };
  Object.assign(payload, replaceTokens(payload, tokens));
  setNested(payload, config.toParam || "to", phone);
  setNested(payload, config.messageParam || "message", content);
  if (text(config.titleParam)) setNested(payload, config.titleParam, title);
  if (text(config.sender)) payload.sender = config.sender;
  if (text(config.templateName)) payload.templateName = config.templateName;
  if (text(config.languageCode)) payload.languageCode = config.languageCode;

  const headers = { "Content-Type": "application/json", ...parseJsonObject(config.headersJson) };
  const authType = text(config.authType) || "Header";
  const token = text(config.accessToken) || text(config.apiKey);
  if (authType === "Bearer" && token) headers.Authorization = `Bearer ${token}`;
  if (authType === "Header" && token) headers[text(config.authHeaderName) || "Authorization"] = token;
  if (authType === "Basic" && (text(config.username) || text(config.password))) {
    headers.Authorization = `Basic ${Buffer.from(`${text(config.username)}:${text(config.password)}`).toString("base64")}`;
  }
  if (authType === "Query" && text(config.apiKey)) payload.apikey = text(config.apiKey);

  return { payload, headers };
};

const requestBhashEndpoint = async (config, endpoint, payload = {}, method = "POST", includeAuth = true) => {
  const headers = { "Content-Type": "application/json", ...parseJsonObject(config.headersJson) };
  if (includeAuth) {
    const token = text(config.accessToken) || text(config.apiKey);
    if (token && (text(config.authType) === "Bearer" || text(config.authType) === "Header")) {
      if (text(config.authType) === "Bearer") headers.Authorization = `Bearer ${token}`;
      else headers[text(config.authHeaderName) || "Authorization"] = token;
    }
  }
  let response;
  if (method === "GET") {
    const url = new URL(endpoint);
    Object.entries(payload || {}).forEach(([key, value]) => url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value)));
    response = await fetch(url.toString(), { method: "GET", headers });
  } else {
    response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload || {}) });
  }
  const raw = await response.text();
  let parsed = raw;
  try { parsed = JSON.parse(raw); } catch (ignore) { parsed = raw; }
  if (!response.ok) {
    const err = new Error(`BhashSMS request failed with status ${response.status}`);
    err.response = parsed;
    throw err;
  }
  return parsed;
};

const extractTokenData = (data = {}) => {
  if (!data || typeof data !== "object") return {};
  const accessToken = data.accessToken || data.token || data.jwt || data.authToken || data.data?.accessToken || data.data?.token || "";
  const refreshToken = data.refreshToken || data.data?.refreshToken || "";
  const expiresIn = Number(data.expiresIn || data.expiry || data.data?.expiresIn || 0);
  return {
    accessToken: text(accessToken),
    refreshToken: text(refreshToken),
    tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined
  };
};

const getConfigById = async (body = {}) => {
  const colid = numberValue(body.colid);
  const id = text(body.configid || body.id);
  if (!colid) throw new Error("College id is required");
  const query = { colid };
  if (id && mongoose.Types.ObjectId.isValid(id)) query._id = id;
  else query.isactive = true;
  const config = await BhashWhatsappConfig.findOne(query).sort({ updatedAt: -1 });
  if (!config) throw new Error("BhashSMS WhatsApp configuration not found");
  return config;
};

const authenticate = async (req, res) => {
  try {
    const config = await getConfigById(req.body || {});
    const payload = replaceTokens(parseJsonObject(config.authenticatePayloadJson), {
      username: config.username,
      password: config.password,
      apiKey: config.apiKey
    });
    const data = await requestBhashEndpoint(config, config.authenticateEndpoint || defaultEndpoints.authenticateEndpoint, payload, "POST", false);
    const tokenData = extractTokenData(data);
    if (tokenData.accessToken) {
      config.accessToken = tokenData.accessToken;
      if (tokenData.refreshToken) config.refreshToken = tokenData.refreshToken;
      if (tokenData.tokenExpiresAt) config.tokenExpiresAt = tokenData.tokenExpiresAt;
      await config.save();
    }
    return res.json({ data, tokenUpdated: Boolean(tokenData.accessToken) });
  } catch (error) {
    return res.status(500).json({ error: error.response ? JSON.stringify(error.response) : error.message });
  }
};

const refresh = async (req, res) => {
  try {
    const config = await getConfigById(req.body || {});
    const payload = replaceTokens(parseJsonObject(config.refreshPayloadJson), {
      refreshToken: config.refreshToken,
      accessToken: config.accessToken,
      apiKey: config.apiKey
    });
    const data = await requestBhashEndpoint(config, config.refreshEndpoint || defaultEndpoints.refreshEndpoint, payload, "POST", true);
    const tokenData = extractTokenData(data);
    if (tokenData.accessToken) {
      config.accessToken = tokenData.accessToken;
      if (tokenData.refreshToken) config.refreshToken = tokenData.refreshToken;
      if (tokenData.tokenExpiresAt) config.tokenExpiresAt = tokenData.tokenExpiresAt;
      await config.save();
    }
    return res.json({ data, tokenUpdated: Boolean(tokenData.accessToken) });
  } catch (error) {
    return res.status(500).json({ error: error.response ? JSON.stringify(error.response) : error.message });
  }
};

const getTemplates = async (req, res) => {
  try {
    const config = await getConfigById(req.query || req.body || {});
    const data = await requestBhashEndpoint(config, config.getTemplatesEndpoint || defaultEndpoints.getTemplatesEndpoint, {}, "GET", true);
    return res.json({ data });
  } catch (error) {
    return res.status(500).json({ error: error.response ? JSON.stringify(error.response) : error.message });
  }
};

const createApiTemplate = async (req, res) => {
  try {
    const body = req.body || {};
    const config = await getConfigById(body);
    const payload = replaceTokens(parseJsonObject(config.templatePayloadJson), {
      templateName: body.templateName || config.templateName,
      languageCode: body.languageCode || config.languageCode,
      content: body.templateContent || body.content || "",
      category: body.category || "",
      body: body.templateContent || body.content || ""
    });
    const data = await requestBhashEndpoint(config, config.createTemplateEndpoint || defaultEndpoints.createTemplateEndpoint, payload, "POST", true);
    return res.json({ data });
  } catch (error) {
    return res.status(500).json({ error: error.response ? JSON.stringify(error.response) : error.message });
  }
};

const callBhash = async (config, phone, title, content) => {
  const { payload, headers } = createRequest(config, phone, title, content);
  const endpoint = text(config.endpoint);
  if (!endpoint) throw new Error("BhashSMS endpoint is not configured");
  let response;
  if ((config.method || "POST") === "GET") {
    const url = new URL(endpoint);
    Object.entries(payload).forEach(([key, value]) => {
      url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    });
    response = await fetch(url.toString(), { method: "GET", headers });
  } else {
    response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
  }
  const raw = await response.text();
  let parsed = raw;
  try {
    parsed = JSON.parse(raw);
  } catch (ignore) {
    parsed = raw;
  }
  if (!response.ok) {
    const err = new Error(`BhashSMS request failed with status ${response.status}`);
    err.response = parsed;
    throw err;
  }
  return parsed;
};

const sendWhatsapp = async (req, res) => {
  try {
    const body = req.body || {};
    const colid = numberValue(body.colid);
    if (!colid) return res.status(400).json({ error: "College id is required" });
    const title = text(body.title);
    const content = text(body.content);
    if (!content) return res.status(400).json({ error: "Message content is required" });

    const configQuery = { colid };
    const configid = text(body.configid);
    if (configid && mongoose.Types.ObjectId.isValid(configid)) configQuery._id = configid;
    else configQuery.isactive = true;
    const config = await BhashWhatsappConfig.findOne(configQuery).sort({ updatedAt: -1 }).lean();
    if (!config) return res.status(400).json({ error: "Active BhashSMS WhatsApp configuration not found" });

    let users = [];
    const ids = Array.isArray(body.userids) ? body.userids.filter((id) => mongoose.Types.ObjectId.isValid(id)) : [];
    if (ids.length) {
      users = await User.find({ colid, _id: { $in: ids } }).select(userProjection).lean();
    } else if (Array.isArray(body.users) && body.users.length) {
      users = body.users;
    } else {
      users = await User.find(buildUserQuery(body)).select(userProjection).limit(10000).lean();
    }
    if (!users.length) return res.status(400).json({ error: "No users selected" });

    const recipients = [];
    for (const item of users) {
      const phone = normalizePhone(item[config.phoneField || "phone"] || item.phone, config.defaultCountryCode);
      const recipient = {
        userid: item._id,
        name: text(item.name),
        email: text(item.email),
        phone,
        status: "Failed",
        response: null,
        error: ""
      };
      if (!phone) {
        recipient.error = "Phone number not found";
        recipients.push(recipient);
        continue;
      }
      try {
        recipient.response = await callBhash(config, phone, title, content);
        recipient.status = "Sent";
      } catch (error) {
        recipient.error = error.response ? JSON.stringify(error.response) : error.message;
      }
      recipients.push(recipient);
    }

    const success = recipients.filter((item) => item.status === "Sent").length;
    const failed = recipients.length - success;
    const log = await BhashWhatsappLog.create({
      colid,
      configid: config._id,
      configname: config.name,
      title,
      content,
      total: recipients.length,
      success,
      failed,
      user: text(body.user),
      recipients
    });
    return res.json({ success: true, total: recipients.length, sent: success, failed, log });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const sendTemplatePayload = async (req, res) => {
  try {
    const body = req.body || {};
    const colid = numberValue(body.colid);
    if (!colid) return res.status(400).json({ error: "College id is required" });
    const businessCode = text(body.businessCode);
    const templateCode = text(body.templateCode);
    const mobileNumbers = text(body.mobileNumbers);
    if (!businessCode) return res.status(400).json({ error: "Business code is required" });
    if (!templateCode) return res.status(400).json({ error: "Template code is required" });
    if (!mobileNumbers) return res.status(400).json({ error: "Mobile number is required" });

    const configQuery = { colid };
    const configid = text(body.configid);
    if (configid && mongoose.Types.ObjectId.isValid(configid)) configQuery._id = configid;
    else configQuery.isactive = true;
    const config = await BhashWhatsappConfig.findOne(configQuery).sort({ updatedAt: -1 }).lean();
    if (!config) return res.status(400).json({ error: "Active BhashSMS WhatsApp configuration not found" });

    const payload = {
      businessCode,
      templateCode,
      mobileNumbers,
      header: {
        type: text(body.header?.type || body.headerType),
        value: text(body.header?.value || body.headerValue)
      },
      values: (Array.isArray(body.values) ? body.values : [])
        .map((item) => ({ variable: text(item.variable), value: text(item.value) }))
        .filter((item) => item.variable || item.value)
    };
    if (!payload.header.type && !payload.header.value) delete payload.header;

    const data = await requestBhashEndpoint(config, config.endpoint || defaultEndpoints.endpoint, payload, config.method || "POST", true);
    const numbers = mobileNumbers.split(",").map((item) => normalizePhone(item, config.defaultCountryCode)).filter(Boolean);
    const recipients = numbers.map((phone) => ({
      phone,
      status: "Sent",
      response: data,
      error: ""
    }));
    const log = await BhashWhatsappLog.create({
      colid,
      configid: config._id,
      configname: config.name,
      title: templateCode,
      content: JSON.stringify(payload),
      total: numbers.length || 1,
      success: numbers.length || 1,
      failed: 0,
      user: text(body.user),
      recipients
    });
    return res.json({ success: true, data, log, payload });
  } catch (error) {
    return res.status(500).json({ error: error.response ? JSON.stringify(error.response) : error.message });
  }
};

const listLogs = async (req, res) => {
  try {
    const colid = numberValue(req.query.colid || req.body?.colid);
    if (!colid) return res.status(400).json({ error: "College id is required" });
    const rows = await BhashWhatsappLog.find({ colid }).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ data: rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  listConfigs,
  saveConfig,
  deleteConfig,
  filterOptions,
  searchUsers,
  sendWhatsapp,
  sendTemplatePayload,
  listLogs,
  authenticate,
  refresh,
  getTemplates,
  createApiTemplate
};
