const mongoose = require("mongoose");
const User = require("../Models/user");
const BhashWhatsappConfig = require("../Models/bhashwhatsappconfigds");
const BhashWhatsappLog = require("../Models/bhashwhatsapplogds");
const BhashWhatsappTemplate = require("../Models/bhashwhatsapptemplateds");
const { WhatsappCreditAccount, WhatsappCreditTransaction } = require("../Models/whatsappcreditds");

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
const defaultBaseUrl = "https://apiv2.bhashsms.com";
const defaultEndpoints = {
  authenticateEndpoint: `${defaultBaseUrl}/auth/v1/appAuthenticate`,
  endpoint: `${defaultBaseUrl}/customer/api/v1/campaign/sendMessage`
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

const normalizePhone = (value, countryCode = "") => {
  let phone = text(value).replace(/[^\d+]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  const cc = text(countryCode).replace(/[^\d]/g, "");
  if (cc && phone.length === 10) phone = `${cc}${phone}`;
  return phone;
};

const resolveEndpoint = (config, field) => {
  const configured = text(config?.[field]);
  if (!configured || configured.includes("developer.bhashsms.com")) return defaultEndpoints[field] || configured;
  return configured;
};

const extractApiError = (error) => {
  if (!error) return "BhashSMS request failed";
  if (error.response) return typeof error.response === "string" ? error.response : JSON.stringify(error.response);
  return error.message || "BhashSMS request failed";
};

const readResponse = async (response) => {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (ignore) {
    return raw;
  }
};

const postJson = async (url, payload, headers = {}) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload || {})
  });
  const parsed = await readResponse(response);
  if (!response.ok) {
    const err = new Error(`BhashSMS request failed with status ${response.status}`);
    err.status = response.status;
    err.response = parsed;
    throw err;
  }
  return parsed;
};

const extractTokenData = (data = {}) => {
  if (!data || typeof data !== "object") return {};
  const accessToken = data.accessToken || data.token || data.jwt || data.authToken || data.content?.accessToken || data.data?.accessToken || data.data?.token || "";
  const refreshToken = data.refreshToken || data.content?.refreshToken || data.data?.refreshToken || "";
  const expiresIn = Number(data.expiresIn || data.expiry || data.content?.expiresIn || data.data?.expiresIn || 0);
  return {
    accessToken: text(accessToken),
    refreshToken: text(refreshToken),
    tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined
  };
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

const authenticateConfig = async (config) => {
  const apiKey = text(config.apiKey);
  if (!apiKey) throw new Error("BhashSMS API key is required");
  const endpoint = resolveEndpoint(config, "authenticateEndpoint");
  const data = await postJson(endpoint, { apiKey });
  const tokenData = extractTokenData(data);
  if (!tokenData.accessToken) throw new Error("BhashSMS authentication did not return accessToken");
  config.accessToken = tokenData.accessToken;
  if (tokenData.refreshToken) config.refreshToken = tokenData.refreshToken;
  config.tokenExpiresAt = tokenData.tokenExpiresAt || undefined;
  await config.save();
  return { data, tokenData };
};

const ensureAccessToken = async (config) => {
  const expiry = config.tokenExpiresAt ? new Date(config.tokenExpiresAt).getTime() : 0;
  if (text(config.accessToken) && (!expiry || expiry > Date.now() + 60000)) return text(config.accessToken);
  const auth = await authenticateConfig(config);
  return auth.tokenData.accessToken;
};

const buildTemplatePayload = (config, body, mobileNumbers) => {
  const businessCode = text(body.businessCode) || text(config.businessCode);
  const templateCode = text(body.templateCode) || text(config.templateCode) || text(config.templateName);
  if (!businessCode) throw new Error("Business code is required");
  if (!templateCode) throw new Error("Template code is required");
  if (!text(mobileNumbers)) throw new Error("Mobile number is required");

  const values = (Array.isArray(body.values) ? body.values : [])
    .map((item, index) => ({
      variable: text(item.variable) || String(index + 1),
      value: text(item.value)
    }))
    .filter((item) => item.variable && item.value !== "");

  const headerType = text(body.header?.type || body.headerType);
  const headerValue = text(body.header?.value || body.headerValue);
  const payload = {
    businessCode,
    templateCode,
    mobileNumbers: text(mobileNumbers),
    values
  };
  if (headerType && headerValue) payload.header = { type: headerType, value: headerValue };
  return payload;
};

const sendTemplateToBhash = async (config, payload) => {
  const endpoint = resolveEndpoint(config, "endpoint");
  const token = await ensureAccessToken(config);
  try {
    return await postJson(endpoint, payload, { Authorization: `Bearer ${token}` });
  } catch (error) {
    if (error.status !== 401) throw error;
    const auth = await authenticateConfig(config);
    return postJson(endpoint, payload, { Authorization: `Bearer ${auth.tokenData.accessToken}` });
  }
};

const reserveWhatsappCredits = async ({ colid, count, user = "", name = "", source = "", sourceid = "" }) => {
  const needed = Number(count || 0);
  if (needed <= 0) return null;
  const account = await WhatsappCreditAccount.findOneAndUpdate(
    { colid: numberValue(colid), balance: { $gte: needed } },
    { $inc: { balance: -needed, totalused: needed }, $set: { updatedby: text(user) } },
    { new: true }
  );
  if (!account) {
    const current = await WhatsappCreditAccount.findOne({ colid: numberValue(colid) }).lean();
    const err = new Error(`Insufficient WhatsApp credits. Required ${needed}, available ${current?.balance || 0}.`);
    err.status = 402;
    throw err;
  }
  await WhatsappCreditTransaction.create({
    colid: numberValue(colid),
    type: "Debit",
    credits: needed,
    balanceafter: account.balance,
    reason: "WhatsApp message sent",
    source,
    sourceid,
    user: text(user),
    name: text(name)
  });
  return account;
};

const ensureWhatsappCredits = async ({ colid, count }) => {
  const needed = Number(count || 0);
  if (needed <= 0) return true;
  const account = await WhatsappCreditAccount.findOne({ colid: numberValue(colid) }).lean();
  if ((account?.balance || 0) < needed) {
    const err = new Error(`Insufficient WhatsApp credits. Required ${needed}, available ${account?.balance || 0}.`);
    err.status = 402;
    throw err;
  }
  return true;
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

const listLocalTemplates = async (req, res) => {
  try {
    const colid = numberValue(req.query.colid || req.body?.colid);
    if (!colid) return res.status(400).json({ error: "College id is required" });
    const query = { colid };
    ["templatename", "templatecode", "provider", "active"].forEach((field) => {
      if (text(req.query[field] || req.body?.[field])) query[field] = { $regex: text(req.query[field] || req.body?.[field]), $options: "i" };
    });
    const rows = await BhashWhatsappTemplate.find(query).sort({ updatedAt: -1, templatename: 1 }).lean();
    return res.json({ data: rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const saveLocalTemplate = async (req, res) => {
  try {
    const body = req.body || {};
    const colid = numberValue(body.colid);
    if (!colid) return res.status(400).json({ error: "College id is required" });
    if (!text(body.templatename)) return res.status(400).json({ error: "Template name is required" });
    if (!text(body.templatecode)) return res.status(400).json({ error: "Template code is required" });
    const variableNames = text(body.variablenames);
    const variableCount = variableNames
      ? variableNames.split(",").map(text).filter(Boolean).length
      : Math.max(0, Number(body.noofvariables || 0));
    const payload = {
      colid,
      templatename: text(body.templatename),
      templatecode: text(body.templatecode),
      provider: text(body.provider) || "BhashSMS",
      noofvariables: variableCount,
      variablenames: variableNames,
      active: text(body.active) || "Yes",
      user: text(body.user),
      name: text(body.name)
    };
    const id = text(body._id || body.id);
    const row = id && mongoose.Types.ObjectId.isValid(id)
      ? await BhashWhatsappTemplate.findOneAndUpdate({ _id: id, colid }, payload, { new: true })
      : await BhashWhatsappTemplate.create(payload);
    return res.json({ data: row });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const deleteLocalTemplate = async (req, res) => {
  try {
    const colid = numberValue(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id || req.body._id];
    const validIds = ids.map(text).filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!colid || !validIds.length) return res.status(400).json({ error: "Valid template id and college id are required" });
    await BhashWhatsappTemplate.deleteMany({ colid, _id: { $in: validIds } });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const saveConfig = async (req, res) => {
  try {
    const body = req.body || {};
    const colid = numberValue(body.colid);
    if (!colid) return res.status(400).json({ error: "College id is required" });
    if (text(body.headersJson)) parseJsonObject(body.headersJson);
    if (text(body.extraPayload)) parseJsonObject(body.extraPayload);

    const payload = {
      colid,
      name: text(body.name) || "BhashSMS WhatsApp",
      baseUrl: text(body.baseUrl) || defaultBaseUrl,
      endpoint: text(body.endpoint) || defaultEndpoints.endpoint,
      authenticateEndpoint: text(body.authenticateEndpoint) || defaultEndpoints.authenticateEndpoint,
      refreshEndpoint: text(body.refreshEndpoint),
      getTemplatesEndpoint: text(body.getTemplatesEndpoint),
      createTemplateEndpoint: text(body.createTemplateEndpoint),
      method: "POST",
      authType: "Bearer",
      authHeaderName: "Authorization",
      apiKey: text(body.apiKey),
      accessToken: text(body.accessToken),
      refreshToken: text(body.refreshToken),
      tokenExpiresAt: body.tokenExpiresAt || undefined,
      businessCode: text(body.businessCode),
      templateCode: text(body.templateCode),
      templateName: text(body.templateName || body.templateCode),
      defaultCountryCode: text(body.defaultCountryCode) || "91",
      phoneField: text(body.phoneField) || "phone",
      headersJson: text(body.headersJson),
      extraPayload: text(body.extraPayload),
      authenticatePayloadJson: "{\"apiKey\":\"{{apiKey}}\"}",
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

const sendWhatsapp = async (req, res) => {
  try {
    const body = req.body || {};
    const colid = numberValue(body.colid);
    if (!colid) return res.status(400).json({ error: "College id is required" });
    const config = await getConfigById(body);

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

    const recipients = users.map((item) => {
      const phone = normalizePhone(item[config.phoneField || "phone"] || item.phone, config.defaultCountryCode);
      return {
        userid: item._id,
        name: text(item.name),
        email: text(item.email),
        phone,
        status: phone ? "Pending" : "Failed",
        response: null,
        error: phone ? "" : "Phone number not found"
      };
    });
    const numbers = recipients.filter((item) => item.phone).map((item) => item.phone);
    if (!numbers.length) return res.status(400).json({ error: "No valid mobile numbers found for selected users" });
    await ensureWhatsappCredits({ colid, count: numbers.length });

    const payload = buildTemplatePayload(config, body, numbers.join(","));
    let data;
    try {
      data = await sendTemplateToBhash(config, payload);
      await reserveWhatsappCredits({
        colid,
        count: numbers.length,
        user: text(body.user),
        name: text(body.name),
        source: "BhashWhatsappLog"
      });
      recipients.forEach((item) => {
        if (item.phone) {
          item.status = "Sent";
          item.response = data;
        }
      });
    } catch (error) {
      recipients.forEach((item) => {
        if (item.phone) item.error = extractApiError(error);
      });
      throw error;
    }

    const success = recipients.filter((item) => item.status === "Sent").length;
    const failed = recipients.length - success;
    const log = await BhashWhatsappLog.create({
      colid,
      configid: config._id,
      configname: config.name,
      title: payload.templateCode,
      content: JSON.stringify(payload),
      total: recipients.length,
      success,
      failed,
      user: text(body.user),
      recipients
    });
    return res.json({ success: true, total: recipients.length, sent: success, failed, log, payload, data });
  } catch (error) {
    return res.status(error.status || 500).json({ error: extractApiError(error) });
  }
};

const sendTemplatePayload = async (req, res) => {
  try {
    const body = req.body || {};
    const colid = numberValue(body.colid);
    if (!colid) return res.status(400).json({ error: "College id is required" });
    const config = await getConfigById(body);
    const numbers = text(body.mobileNumbers)
      .split(",")
      .map((item) => normalizePhone(item, config.defaultCountryCode))
      .filter(Boolean);
    await ensureWhatsappCredits({ colid, count: numbers.length });
    const payload = buildTemplatePayload(config, body, numbers.join(","));
    const data = await sendTemplateToBhash(config, payload);
    await reserveWhatsappCredits({
      colid,
      count: numbers.length,
      user: text(body.user),
      name: text(body.name),
      source: "BhashWhatsappDirect"
    });
    const recipients = numbers.map((phone) => ({ phone, status: "Sent", response: data, error: "" }));
    const log = await BhashWhatsappLog.create({
      colid,
      configid: config._id,
      configname: config.name,
      title: payload.templateCode,
      content: JSON.stringify(payload),
      total: recipients.length,
      success: recipients.length,
      failed: 0,
      user: text(body.user),
      recipients
    });
    return res.json({ success: true, data, log, payload });
  } catch (error) {
    return res.status(error.status || 500).json({ error: extractApiError(error) });
  }
};

const authenticate = async (req, res) => {
  try {
    const config = await getConfigById(req.body || {});
    const data = await authenticateConfig(config);
    return res.json({ data: data.data, tokenUpdated: true });
  } catch (error) {
    return res.status(500).json({ error: extractApiError(error) });
  }
};

const refresh = async (req, res) => {
  try {
    const config = await getConfigById(req.body || {});
    const data = await authenticateConfig(config);
    return res.json({ data: data.data, tokenUpdated: true });
  } catch (error) {
    return res.status(500).json({ error: extractApiError(error) });
  }
};

const getTemplates = async (req, res) => res.json({ data: [], message: "Use the template codes from the BhashSMS dashboard." });

const createApiTemplate = async (req, res) => res.status(400).json({ error: "Create/approve templates in the BhashSMS dashboard, then use the template code here." });

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
  listLocalTemplates,
  saveLocalTemplate,
  deleteLocalTemplate,
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
