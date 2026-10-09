const CashfreeConfig = require("../Models/cashfreeconfigds");
const CashfreePaymentLog = require("../Models/cashfreepaymentlogds");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const bool = (value) => {
  if (typeof value === "boolean") return value;
  return ["yes", "true", "active", "1"].includes(text(value).toLowerCase());
};
const esc = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cashfreeBaseUrl = (environment) => /^prod|production$/i.test(environment)
  ? "https://api.cashfree.com/pg"
  : "https://sandbox.cashfree.com/pg";

const configPayload = (body = {}) => ({
  colid: num(body.colid),
  name: text(body.name),
  user: text(body.user),
  appid: text(body.appid || body.appId || body.clientid),
  secretkey: text(body.secretkey || body.secretKey || body.clientsecret),
  environment: /^prod|production$/i.test(body.environment) ? "production" : "sandbox",
  apiVersion: text(body.apiVersion || body.apiversion) || "2023-08-01",
  returnurl: text(body.returnurl || body.returnUrl),
  notifyurl: text(body.notifyurl || body.notifyUrl),
  isactive: bool(body.isactive),
  notes: text(body.notes)
});

const queryFrom = (source = {}) => {
  const query = { colid: num(source.colid) };
  if (text(source.environment)) query.environment = /^prod|production$/i.test(source.environment) ? "production" : "sandbox";
  if (text(source.isactive)) query.isactive = bool(source.isactive);
  if (text(source.appid)) query.appid = { $regex: esc(source.appid), $options: "i" };
  if (text(source.name)) query.name = { $regex: esc(source.name), $options: "i" };
  return query;
};

const activeConfig = async (colid, id = "") => {
  const query = id ? { _id: id, colid: num(colid) } : { colid: num(colid), isactive: true };
  return CashfreeConfig.findOne(query).sort({ updatedAt: -1, createdAt: -1 }).lean();
};

const cashfreeFetch = async (config, path, options = {}) => {
  const response = await fetch(`${cashfreeBaseUrl(config.environment)}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-client-id": config.appid,
      "x-client-secret": config.secretkey,
      "x-api-version": config.apiVersion || "2023-08-01",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || data.error_description || data.error || `Cashfree request failed with ${response.status}`;
    const err = new Error(message);
    err.response = data;
    throw err;
  }
  return data;
};

exports.listConfigs = async (req, res) => {
  try {
    const colid = num(req.query.colid || req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await CashfreeConfig.find(queryFrom(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveConfig = async (req, res) => {
  try {
    const payload = configPayload(req.body);
    if (!payload.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!payload.appid || !payload.secretkey) return res.status(400).json({ success: false, message: "App ID and secret key are required" });
    const data = req.body.id
      ? await CashfreeConfig.findOneAndUpdate({ _id: req.body.id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await CashfreeConfig.create(payload);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteConfig = async (req, res) => {
  try {
    const data = await CashfreeConfig.findOneAndDelete({ _id: req.body.id, colid: num(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Cashfree configuration not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const amount = num(req.body.amount);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (amount <= 0) return res.status(400).json({ success: false, message: "Enter a valid amount" });
    const config = await activeConfig(colid, text(req.body.configid));
    if (!config) return res.status(404).json({ success: false, message: "Active Cashfree configuration not found" });

    const orderid = text(req.body.orderid) || `CF-${colid}-${Date.now()}`;
    const frontendReturnUrl = text(req.body.returnurl || req.body.frontendreturnurl);
    const returnUrl = text(config.returnurl) || frontendReturnUrl || `${text(req.protocol)}://${text(req.get("host"))}/billing-cashfree-pay?order_id={order_id}`;
    const notifyUrl = text(config.notifyurl);
    const customername = text(req.body.customername || req.body.name || req.body.username || req.body.user) || "Customer";
    const customeremail = text(req.body.customeremail || req.body.email || req.body.user) || `customer-${orderid}@example.com`;
    const customerphone = text(req.body.customerphone || req.body.phone) || "9999999999";
    const payload = {
      order_id: orderid,
      order_amount: amount,
      order_currency: "INR",
      customer_details: {
        customer_id: text(req.body.customerid) || `CUST-${colid}-${Date.now()}`,
        customer_name: customername,
        customer_email: customeremail,
        customer_phone: customerphone
      },
      order_meta: {
        return_url: returnUrl
      },
      order_note: text(req.body.description) || "Billing payment"
    };
    if (notifyUrl) payload.order_meta.notify_url = notifyUrl;
    const gatewayResponse = await cashfreeFetch(config, "/orders", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const row = await CashfreePaymentLog.findOneAndUpdate(
      { colid, orderid },
      {
        colid,
        orderid,
        cashfreeorderid: text(gatewayResponse.cf_order_id),
        paymentsessionid: text(gatewayResponse.payment_session_id),
        amount,
        currency: "INR",
        status: text(gatewayResponse.order_status) || "CREATED",
        paymentstatus: "Initiated",
        customername,
        customeremail,
        customerphone,
        description: text(req.body.description) || "Billing payment",
        configid: String(config._id),
        environment: config.environment,
        paymentlink: text(gatewayResponse.payment_link),
        requestpayload: payload,
        gatewayresponse: gatewayResponse,
        user: text(req.body.user),
        name: text(req.body.name || req.body.username)
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data: row, cashfree: gatewayResponse, mode: config.environment === "production" ? "production" : "sandbox" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, details: error.response || undefined });
  }
};

exports.verifyOrder = async (req, res) => {
  try {
    const colid = num(req.query.colid || req.body.colid);
    const orderid = text(req.query.orderid || req.query.order_id || req.body.orderid || req.body.order_id);
    if (!colid || !orderid) return res.status(400).json({ success: false, message: "colid and order id are required" });
    const log = await CashfreePaymentLog.findOne({ colid, orderid }).lean();
    if (!log) return res.status(404).json({ success: false, message: "Cashfree payment log not found" });
    const config = await activeConfig(colid, log.configid);
    if (!config) return res.status(404).json({ success: false, message: "Cashfree configuration not found" });
    const verifyResponse = await cashfreeFetch(config, `/orders/${encodeURIComponent(orderid)}`, { method: "GET" });
    const status = text(verifyResponse.order_status || verifyResponse.status || log.status);
    const paid = /^paid$/i.test(status);
    const data = await CashfreePaymentLog.findOneAndUpdate(
      { colid, orderid },
      {
        status,
        paymentstatus: paid ? "Paid" : status || "Pending",
        paidamount: paid ? num(verifyResponse.order_amount || log.amount) : log.paidamount || 0,
        paiddate: paid ? new Date() : log.paiddate,
        gatewayrefno: text(verifyResponse.cf_order_id || log.cashfreeorderid),
        verifyresponse: verifyResponse
      },
      { new: true }
    );
    res.json({ success: true, data, cashfree: verifyResponse });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, details: error.response || undefined });
  }
};

exports.callback = async (req, res) => {
  try {
    const body = Object.keys(req.body || {}).length ? req.body : req.query;
    const orderid = text(body.order_id || body.orderid || body.data?.order?.order_id);
    const colid = num(body.colid || body.data?.order?.order_tags?.colid);
    const update = { callbackresponse: body };
    if (text(body.order_status || body.data?.order?.order_status)) {
      update.status = text(body.order_status || body.data?.order?.order_status);
      update.paymentstatus = /^paid$/i.test(update.status) ? "Paid" : update.status;
    }
    if (orderid && colid) await CashfreePaymentLog.findOneAndUpdate({ colid, orderid }, update, { new: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listLogs = async (req, res) => {
  try {
    const colid = num(req.query.colid || req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["orderid", "customeremail", "customerphone", "customername", "status", "paymentstatus", "environment"].forEach((field) => {
      const value = text(req.query[field] || req.body[field]);
      if (value) query[field] = { $regex: esc(value), $options: "i" };
    });
    if (req.body.fromdate || req.query.fromdate || req.body.todate || req.query.todate) {
      query.createdAt = {};
      if (req.body.fromdate || req.query.fromdate) query.createdAt.$gte = new Date(req.body.fromdate || req.query.fromdate);
      if (req.body.todate || req.query.todate) query.createdAt.$lte = new Date(req.body.todate || req.query.todate);
    }
    const rows = await CashfreePaymentLog.find(query).sort({ createdAt: -1 }).limit(1000).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
