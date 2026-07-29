const User = require("../Models/user");

const text = (value) => String(value ?? "").trim();
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const parseMulti = (value) => {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value)
    .split(",")
    .map(text)
    .filter(Boolean)
    .filter((item) => item.toLowerCase() !== "all");
};

const fieldMap = {
  institution: "institution",
  category: "category",
  gender: "gender",
  program: "program",
  programcode: "programcode",
  major: "Major",
  minor: "Minor",
  idc: "IDC",
  state: "state"
};

const buildQuery = (req) => {
  const colid = toNumber(req.query.colid);
  if (colid === undefined) return { error: "colid is required" };
  const query = { colid, role: /^student$/i };
  const academicyear = text(req.query.academicyear);
  if (academicyear) query.academicyear = academicyear;
  Object.entries(fieldMap).forEach(([param, field]) => {
    const values = parseMulti(req.query[param]);
    if (values.length) query[field] = { $in: values };
  });
  return { query, colid };
};

const groupCount = (rows, field, label = "label") => {
  const map = new Map();
  rows.forEach((row) => {
    const key = text(row[field]) || "Not specified";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()]
    .map(([name, count]) => ({ [label]: name, count }))
    .sort((a, b) => b.count - a.count || String(a[label]).localeCompare(String(b[label]), undefined, { numeric: true }));
};

const twoWay = (rows, primaryField, secondaryField, primaryLabel = "label") => {
  const secondaries = uniqueSorted(rows.map((row) => row[secondaryField] || "Not specified"));
  const map = new Map();
  rows.forEach((row) => {
    const primary = text(row[primaryField]) || "Not specified";
    const secondary = text(row[secondaryField]) || "Not specified";
    const item = map.get(primary) || { [primaryLabel]: primary, total: 0 };
    item[secondary] = (item[secondary] || 0) + 1;
    item.total += 1;
    map.set(primary, item);
  });
  const data = [...map.values()].sort((a, b) => b.total - a.total);
  return { data, keys: secondaries };
};

exports.options = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const rows = await User.find({ colid, role: /^student$/i })
      .select("academicyear institution category gender program programcode Major Minor IDC state")
      .lean();
    res.json({
      success: true,
      options: {
        academicyears: uniqueSorted(rows.map((row) => row.academicyear)).reverse(),
        institutions: uniqueSorted(rows.map((row) => row.institution)),
        categories: uniqueSorted(rows.map((row) => row.category)),
        genders: uniqueSorted(rows.map((row) => row.gender)),
        programs: uniqueSorted(rows.map((row) => row.program)),
        programcodes: uniqueSorted(rows.map((row) => row.programcode)),
        majors: uniqueSorted(rows.map((row) => row.Major)),
        minors: uniqueSorted(rows.map((row) => row.Minor)),
        idcs: uniqueSorted(rows.map((row) => row.IDC)),
        states: uniqueSorted(rows.map((row) => row.state))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load demographic dashboard options" });
  }
};

exports.summary = async (req, res) => {
  try {
    const built = buildQuery(req);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    const rows = await User.find(built.query)
      .select("name email phone regno academicyear institution category gender program programcode Major Minor IDC state city semester section")
      .lean();

    const total = rows.length;
    const genderSplit = groupCount(rows, "gender");
    const categoryGender = twoWay(rows, "category", "gender");
    const stateGender = twoWay(rows, "state", "gender");
    const programGender = twoWay(rows, "programcode", "gender");
    const cards = [
      { key: "total", label: "Total Students", value: total, tone: "#2563eb" },
      { key: "institutions", label: "Institutions", value: uniqueSorted(rows.map((row) => row.institution)).length, tone: "#7c3aed" },
      { key: "programs", label: "Programs", value: uniqueSorted(rows.map((row) => row.programcode || row.program)).length, tone: "#16a34a" },
      { key: "states", label: "States", value: uniqueSorted(rows.map((row) => row.state)).length, tone: "#ea580c" },
      { key: "categories", label: "Categories", value: uniqueSorted(rows.map((row) => row.category)).length, tone: "#0891b2" },
      { key: "genderTop", label: "Top Gender Group", value: genderSplit[0]?.count || 0, suffix: genderSplit[0]?.label ? ` ${genderSplit[0].label}` : "", tone: "#dc2626" }
    ];

    res.json({
      success: true,
      data: {
        cards,
        charts: {
          categorywise: groupCount(rows, "category"),
          genderwise: genderSplit,
          categoryGender,
          programwise: groupCount(rows, "programcode"),
          programGender,
          majorwise: groupCount(rows, "Major"),
          minorwise: groupCount(rows, "Minor"),
          idcwise: groupCount(rows, "IDC"),
          statewise: groupCount(rows, "state"),
          stateGender
        },
        table: rows.map((row) => ({ ...row, id: String(row._id) }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load demographic dashboard" });
  }
};
