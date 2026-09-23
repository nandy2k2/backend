const CrmGmailReplyAgent = require("../Models/crmgmailreplyagentds");
const CrmGmailReplyLog = require("../Models/crmgmailreplylogds");
const CrmGmailOauthConfig = require("../Models/crmgmailoauthconfigds");

const clean = (value) => String(value ?? "").trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const yes = (value) => /^yes|true|active$/i.test(clean(value));
const esc = (value) => clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const contains = (source, needle) => !clean(needle) || new RegExp(esc(needle), "i").test(clean(source));

const base64UrlDecode = (value = "") => {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
};

const base64UrlEncode = (value = "") => Buffer.from(value)
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/g, "");

const headersToObject = (headers = []) => headers.reduce((acc, header) => {
  acc[String(header.name || "").toLowerCase()] = header.value || "";
  return acc;
}, {});

const findBodyPart = (payload) => {
  if (!payload) return "";
  if (payload.body?.data) return base64UrlDecode(payload.body.data);
  const parts = payload.parts || [];
  const plain = parts.find((part) => /text\/plain/i.test(part.mimeType || ""));
  if (plain?.body?.data) return base64UrlDecode(plain.body.data);
  const html = parts.find((part) => /text\/html/i.test(part.mimeType || ""));
  if (html?.body?.data) return base64UrlDecode(html.body.data).replace(/<[^>]*>/g, " ");
  for (const part of parts) {
    const nested = findBodyPart(part);
    if (nested) return nested;
  }
  return "";
};

const emailFromHeader = (header = "") => {
  const match = clean(header).match(/<([^>]+)>/);
  return clean(match?.[1] || header);
};

const replaceTokens = (template, context) => clean(template).replace(/\{([^}]+)\}/g, (_, key) => {
  const token = clean(key).toLowerCase();
  return clean(context[token] ?? "");
});

const gmailFetch = async (path, token, options = {}) => {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error?.message || data.message || `Gmail request failed (${response.status})`);
  return data;
};

const tokenFetch = async (body) => {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString()
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error_description || data.error || `Token request failed (${response.status})`);
  return data;
};

const authUrlForConfig = (config) => {
  const params = new URLSearchParams({
    client_id: clean(config.clientid),
    redirect_uri: clean(config.redirecturi),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: clean(config.scopes),
    state: String(config._id || "")
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

const publicOauthConfig = (config = {}) => ({
  ...config,
  clientsecret: config.clientsecret ? "********" : "",
  accesstoken: config.accesstoken ? "********" : "",
  refreshtoken: config.refreshtoken ? "********" : ""
});

const refreshAccessToken = async (config) => {
  if (!config?.refreshtoken || !config?.clientid || !config?.clientsecret) return clean(config?.accesstoken);
  const token = await tokenFetch({
    client_id: config.clientid,
    client_secret: config.clientsecret,
    refresh_token: config.refreshtoken,
    grant_type: "refresh_token"
  });
  const expiry = new Date(Date.now() + (num(token.expires_in, 3600) - 60) * 1000);
  await CrmGmailOauthConfig.findByIdAndUpdate(config._id, {
    accesstoken: token.access_token,
    tokenexpiry: expiry
  });
  return token.access_token;
};

const resolveAccessToken = async (agent, colid) => {
  if (agent.oauthconfigid) {
    const config = await CrmGmailOauthConfig.findOne({ _id: agent.oauthconfigid, colid, active: /^Yes$/i }).lean();
    if (config) return refreshAccessToken(config);
  }
  const matchingConfig = await CrmGmailOauthConfig.findOne({
    colid,
    active: /^Yes$/i,
    $or: [
      { gmailaccount: new RegExp(`^${esc(agent.gmailaccount)}$`, "i") },
      { default: /^Yes$/i }
    ]
  }).sort({ default: -1, updatedAt: -1 }).lean();
  if (matchingConfig) return refreshAccessToken(matchingConfig);
  return clean(agent.accesstoken);
};

const normalizeRule = (rule = {}) => ({
  rulename: clean(rule.rulename),
  subjectcontains: clean(rule.subjectcontains),
  contentcontains: clean(rule.contentcontains),
  replysubject: clean(rule.replysubject),
  replybody: clean(rule.replybody),
  priority: num(rule.priority, 1),
  active: clean(rule.active || "Yes"),
  stopafterreply: clean(rule.stopafterreply || "Yes")
});

const buildLog = (agent, mail, extra = {}) => ({
  colid: agent.colid,
  agentid: agent._id,
  agentname: agent.agentname,
  gmailaccount: agent.gmailaccount,
  messageid: mail.id || "",
  threadid: mail.threadId || "",
  from: mail.from || "",
  fromemail: mail.fromemail || "",
  subject: mail.subject || "",
  snippet: mail.snippet || "",
  processedat: new Date(),
  user: extra.user || "",
  username: extra.username || "",
  ...extra
});

exports.listAgents = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await CrmGmailReplyAgent.find({ colid }).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listOauthConfigs = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await CrmGmailOauthConfig.find({ colid }).sort({ default: -1, updatedAt: -1 }).lean();
    res.json({ success: true, data: data.map(publicOauthConfig) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveOauthConfig = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!clean(req.body.configname) || !clean(req.body.clientid) || !clean(req.body.redirecturi)) {
      return res.status(400).json({ success: false, message: "Configuration name, client id and redirect URI are required" });
    }
    const existing = req.body.id ? await CrmGmailOauthConfig.findOne({ _id: req.body.id, colid }).lean() : null;
    const payload = {
      colid,
      configname: clean(req.body.configname),
      gmailaccount: clean(req.body.gmailaccount),
      clientid: clean(req.body.clientid),
      clientsecret: clean(req.body.clientsecret).includes("***") ? existing?.clientsecret || "" : clean(req.body.clientsecret),
      redirecturi: clean(req.body.redirecturi),
      scopes: clean(req.body.scopes || "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send"),
      accesstoken: clean(req.body.accesstoken).includes("***") ? existing?.accesstoken || "" : clean(req.body.accesstoken),
      refreshtoken: clean(req.body.refreshtoken).includes("***") ? existing?.refreshtoken || "" : clean(req.body.refreshtoken),
      active: clean(req.body.active || "Yes"),
      default: clean(req.body.default || "No"),
      user: clean(req.body.user),
      username: clean(req.body.username)
    };
    if (/^Yes$/i.test(payload.default)) {
      await CrmGmailOauthConfig.updateMany({ colid, _id: { $ne: req.body.id } }, { default: "No" });
    }
    const data = req.body.id
      ? await CrmGmailOauthConfig.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true })
      : await CrmGmailOauthConfig.create(payload);
    res.json({ success: true, data: publicOauthConfig(data.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOauthConfig = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    await CrmGmailOauthConfig.deleteMany({ _id: { $in: req.body.ids || [] }, colid });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.oauthAuthUrl = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const config = await CrmGmailOauthConfig.findOne({ _id: req.query.id, colid }).lean();
    if (!config) return res.status(404).json({ success: false, message: "OAuth configuration not found" });
    res.json({ success: true, authurl: authUrlForConfig(config) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.exchangeAuthCode = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const config = await CrmGmailOauthConfig.findOne({ _id: req.body.id, colid });
    if (!config) return res.status(404).json({ success: false, message: "OAuth configuration not found" });
    if (!clean(req.body.code)) return res.status(400).json({ success: false, message: "Authorization code is required" });
    const token = await tokenFetch({
      code: clean(req.body.code),
      client_id: config.clientid,
      client_secret: config.clientsecret,
      redirect_uri: config.redirecturi,
      grant_type: "authorization_code"
    });
    config.accesstoken = token.access_token || config.accesstoken;
    config.refreshtoken = token.refresh_token || config.refreshtoken;
    config.tokenexpiry = new Date(Date.now() + (num(token.expires_in, 3600) - 60) * 1000);
    await config.save();
    res.json({ success: true, data: publicOauthConfig(config.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.refreshOauthConfig = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const config = await CrmGmailOauthConfig.findOne({ _id: req.body.id, colid }).lean();
    if (!config) return res.status(404).json({ success: false, message: "OAuth configuration not found" });
    await refreshAccessToken(config);
    const updated = await CrmGmailOauthConfig.findById(config._id).lean();
    res.json({ success: true, data: publicOauthConfig(updated) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveAgent = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!clean(req.body.agentname)) return res.status(400).json({ success: false, message: "Agent name is required" });
    const payload = {
      colid,
      agentname: clean(req.body.agentname),
      gmailaccount: clean(req.body.gmailaccount),
      oauthconfigid: clean(req.body.oauthconfigid) || undefined,
      accesstoken: clean(req.body.accesstoken),
      refreshtoken: clean(req.body.refreshtoken),
      maxemails: Math.max(1, Math.min(100, num(req.body.maxemails, 25))),
      markasread: clean(req.body.markasread || "Yes"),
      status: clean(req.body.status || "Active"),
      rules: Array.isArray(req.body.rules) ? req.body.rules.map(normalizeRule) : [],
      user: clean(req.body.user),
      username: clean(req.body.username)
    };
    const data = req.body.id
      ? await CrmGmailReplyAgent.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true })
      : await CrmGmailReplyAgent.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteAgent = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    await CrmGmailReplyAgent.deleteMany({ _id: { $in: req.body.ids || [] }, colid });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.runAgent = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const agent = await CrmGmailReplyAgent.findOne({ _id: req.body.id, colid }).lean();
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });
    if (!yes(agent.status)) return res.status(400).json({ success: false, message: "Agent is inactive" });
    const accessToken = await resolveAccessToken(agent, colid);
    if (!accessToken) return res.status(400).json({ success: false, message: "Select an OAuth configuration or provide a Gmail access token" });

    const activeRules = (agent.rules || [])
      .filter((rule) => yes(rule.active))
      .sort((a, b) => num(a.priority, 1) - num(b.priority, 1));
    if (!activeRules.length) return res.status(400).json({ success: false, message: "At least one active rule is required" });

    const list = await gmailFetch(`messages?q=${encodeURIComponent("is:unread")}&maxResults=${agent.maxemails || 25}`, accessToken);
    const messages = list.messages || [];
    const logs = [];

    for (const item of messages) {
      try {
        const detail = await gmailFetch(`messages/${item.id}?format=full`, accessToken);
        const headers = headersToObject(detail.payload?.headers || []);
        const body = findBodyPart(detail.payload);
        const mail = {
          id: detail.id,
          threadId: detail.threadId,
          from: headers.from || "",
          fromemail: emailFromHeader(headers.from || ""),
          subject: headers.subject || "",
          snippet: detail.snippet || body.slice(0, 180),
          messageIdHeader: headers["message-id"] || ""
        };
        const matched = activeRules.find((rule) => contains(mail.subject, rule.subjectcontains) && contains(`${body} ${mail.snippet}`, rule.contentcontains));
        if (!matched) {
          logs.push(await CrmGmailReplyLog.create(buildLog(agent, mail, {
            status: "Skipped",
            reason: "No rule matched",
            user: clean(req.body.user),
            username: clean(req.body.username)
          })));
          continue;
        }
        const context = {
          name: mail.from.replace(/<[^>]+>/g, "").trim(),
          from: mail.from,
          fromemail: mail.fromemail,
          subject: mail.subject,
          snippet: mail.snippet,
          agent: agent.agentname
        };
        const replySubject = replaceTokens(matched.replysubject || `Re: ${mail.subject}`, context);
        const replyBody = replaceTokens(matched.replybody, context);
        const rawHeaders = [
          `To: ${mail.fromemail}`,
          `From: ${agent.gmailaccount}`,
          `Subject: ${replySubject}`,
          mail.messageIdHeader ? `In-Reply-To: ${mail.messageIdHeader}` : "",
          mail.messageIdHeader ? `References: ${mail.messageIdHeader}` : "",
          "Content-Type: text/plain; charset=utf-8"
        ].filter(Boolean);
        const raw = [
          ...rawHeaders,
          "",
          replyBody
        ].join("\r\n");
        await gmailFetch("messages/send", accessToken, {
          method: "POST",
          body: JSON.stringify({ raw: base64UrlEncode(raw), threadId: detail.threadId })
        });
        if (yes(agent.markasread)) {
          await gmailFetch(`messages/${item.id}/modify`, accessToken, {
            method: "POST",
            body: JSON.stringify({ removeLabelIds: ["UNREAD"] })
          });
        }
        logs.push(await CrmGmailReplyLog.create(buildLog(agent, mail, {
          matchedrule: matched.rulename,
          replysubject: replySubject,
          replybody: replyBody,
          status: "Replied",
          reason: "Reply sent",
          user: clean(req.body.user),
          username: clean(req.body.username)
        })));
      } catch (mailError) {
        logs.push(await CrmGmailReplyLog.create(buildLog(agent, { id: item.id, threadId: item.threadId }, {
          status: "Error",
          error: mailError.message,
          user: clean(req.body.user),
          username: clean(req.body.username)
        })));
      }
    }
    res.json({ success: true, processed: messages.length, logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.logs = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid };
    if (req.query.agentid) query.agentid = req.query.agentid;
    if (req.query.status && req.query.status !== "All") query.status = req.query.status;
    const data = await CrmGmailReplyLog.find(query).sort({ processedat: -1 }).limit(500).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    const query = { colid };
    if (req.query.agentid) query.agentid = req.query.agentid;
    if (req.query.status && req.query.status !== "All") query.status = req.query.status;
    if (req.query.from || req.query.to) {
      query.processedat = {};
      if (req.query.from) query.processedat.$gte = new Date(`${req.query.from}T00:00:00`);
      if (req.query.to) query.processedat.$lte = new Date(`${req.query.to}T23:59:59`);
    }
    const data = await CrmGmailReplyLog.find(query).sort({ processedat: -1 }).limit(2000).lean();
    const summary = data.reduce((acc, row) => {
      acc.total += 1;
      const key = clean(row.status || "Skipped").toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, { total: 0, replied: 0, skipped: 0, error: 0 });
    const byStatus = Object.entries(data.reduce((acc, row) => {
      const key = row.status || "Skipped";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})).map(([name, value]) => ({ name, value }));
    const byRule = Object.entries(data.reduce((acc, row) => {
      const key = row.matchedrule || row.reason || "No rule";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})).map(([name, value]) => ({ name, value }));
    const daywise = Object.entries(data.reduce((acc, row) => {
      const key = row.processedat ? new Date(row.processedat).toISOString().slice(0, 10) : "Blank";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => ({ name, value }));
    res.json({ success: true, data, summary, byStatus, byRule, daywise });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
