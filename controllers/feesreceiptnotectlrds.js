const FeesReceiptNote = require("../Models/feesreceiptnoteds");

function text(value) {
  return String(value ?? "").trim();
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

exports.list = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    if (text(req.query.isactive)) query.isactive = text(req.query.isactive);
    const data = await FeesReceiptNote.find(query).sort({ isactive: -1, updatedAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.active = async (req, res) => {
  try {
    const colid = num(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await FeesReceiptNote.findOne({ colid, isactive: "Yes", note: { $ne: "" } }).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.save = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = {
      colid,
      title: text(req.body.title) || "Fees receipt note",
      note: text(req.body.note),
      isactive: text(req.body.isactive) || "Yes",
      updatedby: text(req.body.user)
    };
    let data;
    if (text(req.body._id || req.body.id)) {
      data = await FeesReceiptNote.findOneAndUpdate({ _id: text(req.body._id || req.body.id), colid }, payload, { new: true });
    } else {
      data = await FeesReceiptNote.create({ ...payload, createdby: text(req.body.user) });
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    const id = text(req.body.id || req.body._id);
    if (colid === undefined || !id) return res.status(400).json({ success: false, message: "colid and id are required" });
    const data = await FeesReceiptNote.findOneAndDelete({ _id: id, colid });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
