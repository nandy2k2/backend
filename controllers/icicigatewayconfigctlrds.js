const IciciGateway = require("../Models/icicigatewayds");

function text(value) {
  return String(value || "").trim();
}

function bool(value) {
  if (typeof value === "boolean") return value;
  return ["yes", "true", "active", "1"].includes(text(value).toLowerCase());
}

function escapeRegex(value) {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCommonMode(source = {}) {
  return text(source.mode || source.configmode || source.programMode).toLowerCase() === "common";
}

function isProgramMode(source = {}) {
  return text(source.mode || source.configmode || source.programMode).toLowerCase() === "program";
}

function payload(body = {}) {
  const commonMode = isCommonMode(body);
  return {
    name: text(body.name),
    user: text(body.user),
    colid: Number(body.colid),
    program: commonMode ? "" : text(body.program),
    programcode: commonMode ? "" : text(body.programcode),
    merchantid: text(body.merchantid),
    aggregatorid: text(body.aggregatorid),
    secretkey: text(body.secretkey),
    environment: text(body.environment) === "prod" ? "prod" : "test",
    saleurl: text(body.saleurl),
    commandurl: text(body.commandurl),
    settlementurl: text(body.settlementurl),
    isactive: bool(body.isactive),
    notes: text(body.notes)
  };
}

function queryFrom(source = {}) {
  const query = { colid: Number(source.colid) };
  if (isCommonMode(source)) {
    query.$and = [
      { $or: [{ programcode: "" }, { programcode: { $exists: false } }, { programcode: null }] },
      { $or: [{ program: "" }, { program: { $exists: false } }, { program: null }] }
    ];
  }
  if (isProgramMode(source)) {
    query.$or = [
      { programcode: { $exists: true, $nin: ["", null] } },
      { program: { $exists: true, $nin: ["", null] } }
    ];
  }
  if (text(source.environment)) query.environment = text(source.environment);
  if (text(source.isactive)) query.isactive = bool(source.isactive);
  if (text(source.program)) query.program = { $regex: escapeRegex(source.program), $options: "i" };
  if (text(source.programcode)) query.programcode = { $regex: escapeRegex(source.programcode), $options: "i" };
  if (text(source.merchantid)) query.merchantid = { $regex: escapeRegex(source.merchantid), $options: "i" };
  if (text(source.aggregatorid)) query.aggregatorid = { $regex: escapeRegex(source.aggregatorid), $options: "i" };
  return query;
}

exports.getIciciGatewayConfigs = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = isCommonMode(req.query)
      ? (await IciciGateway.findOne(queryFrom(req.query)).sort({ updatedAt: -1, createdAt: -1 }).lean()
          .then((row) => row ? [row] : []))
      : await IciciGateway.find(queryFrom(req.query)).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createIciciGatewayConfig = async (req, res) => {
  try {
    const row = payload(req.body);
    const data = isCommonMode(req.body)
      ? await IciciGateway.findOneAndUpdate(
          {
            colid: row.colid,
            $and: [
              { $or: [{ programcode: "" }, { programcode: { $exists: false } }, { programcode: null }] },
              { $or: [{ program: "" }, { program: { $exists: false } }, { program: null }] }
            ]
          },
          row,
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true, sort: { updatedAt: -1 } }
        )
      : await IciciGateway.create(row);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateIciciGatewayConfig = async (req, res) => {
  try {
    const data = await IciciGateway.findOneAndUpdate(
      { _id: req.body.id, colid: Number(req.body.colid) },
      payload(req.body),
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "ICICI configuration not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteIciciGatewayConfig = async (req, res) => {
  try {
    const data = await IciciGateway.findOneAndDelete({ _id: req.body.id, colid: Number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "ICICI configuration not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
