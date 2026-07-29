const User = require("../Models/user");

const text = (value) => String(value || "").trim();
const regex = (value) => new RegExp(text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

const filterableFields = [
  "role",
  "department",
  "academicyear",
  "program",
  "programcode",
  "semester",
  "section",
  "designation",
  "name",
  "email",
  "phone",
  "regno",
  "status"
];

const buildFilter = (query = {}) => {
  const filter = { colid: Number(query.colid) };
  filterableFields.forEach((field) => {
    const value = text(query[field]);
    if (!value) return;
    if (["name", "email", "phone", "regno"].includes(field)) {
      filter[field] = regex(value);
    } else if (field === "status") {
      const numeric = Number(value);
      filter.status = Number.isNaN(numeric) ? value : numeric;
    } else {
      filter[field] = value;
    }
  });
  return filter;
};

exports.options = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const fields = ["role", "department", "academicyear", "program", "programcode", "semester", "section", "designation", "status"];
    const entries = await Promise.all(fields.map(async (field) => [field, await User.distinct(field, { colid })]));
    res.json({ success: true, data: Object.fromEntries(entries) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const filter = buildFilter(req.query);
    if (!filter.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await User.find(filter)
      .select("name email user phone role department academicyear program programcode semester section designation regno joiningdate status")
      .sort({ name: 1 })
      .limit(1000)
      .lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateJoiningDate = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const id = text(req.body.id);
    if (!colid || !id) return res.status(400).json({ success: false, message: "Select a user" });
    const value = text(req.body.joiningdate);
    const joiningdate = value ? new Date(value) : null;
    if (value && Number.isNaN(joiningdate.getTime())) {
      return res.status(400).json({ success: false, message: "Joining date is invalid" });
    }
    const data = await User.findOneAndUpdate(
      { _id: id, colid },
      { joiningdate },
      { new: true, runValidators: true }
    ).select("name email user role department joiningdate").lean();
    if (!data) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
