const ColourScheme = require("../Models/colourschemeds");

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clean = (value) => String(value ?? "").trim();

const colourFields = [
  "name",
  "appBarStart",
  "appBarEnd",
  "appBarText",
  "drawerBg",
  "drawerText",
  "drawerActive",
  "pageBgStart",
  "pageBgEnd",
  "cardBg",
  "primary",
  "secondary",
  "accent",
  "border",
  "text",
  "mutedText",
  "buttonText"
];

exports.getColourScheme = async (req, res) => {
  try {
    const colid = num(req.query.colid || req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await ColourScheme.findOne({ colid }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveColourScheme = async (req, res) => {
  try {
    const colid = num(req.body.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = { colid, user: clean(req.body.user), username: clean(req.body.username) };
    colourFields.forEach((field) => {
      if (req.body[field] !== undefined) payload[field] = clean(req.body[field]);
    });
    const data = await ColourScheme.findOneAndUpdate(
      { colid },
      payload,
      { upsert: true, new: true, runValidators: true }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
