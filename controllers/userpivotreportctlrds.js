const User = require("../Models/user");
const Institution = require("../Models/insdetails");

const hiddenFields = new Set(["password", "authenticatorsecret", "__v"]);
const preferredOrder = [
  "academicyear", "admissionyear", "role", "name", "email", "phone", "regno", "rollno", "program", "programcode", "regulation",
  "semester", "section", "department", "designation", "institution", "category", "gender", "nationality", "state", "city", "district",
  "pincode", "quota", "isfinalyear", "excluded", "notification", "annualincome", "freeshipcardholder", "Major", "Minor", "AEC", "SEC",
  "VAC", "IDC", "MDC", "specialization1", "specialization2", "profileapprovalstatus", "status", "lastlogin", "joiningdate", "birthdate"
];

const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const titleCase = (value) => String(value || "")
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (char) => char.toUpperCase());

const schemaFields = () => {
  const paths = Object.entries(User.schema.paths)
    .map(([field, path]) => ({ field, label: titleCase(field), type: path.instance || "String" }))
    .filter((item) => !hiddenFields.has(item.field) && !item.field.startsWith("_"));
  return paths.sort((a, b) => {
    const ai = preferredOrder.indexOf(a.field);
    const bi = preferredOrder.indexOf(b.field);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return a.label.localeCompare(b.label);
  });
};

const userFields = schemaFields();
const allowedFields = new Set(userFields.map((item) => item.field));
const typeFor = (field) => userFields.find((item) => item.field === field)?.type || "String";
const labelFor = (field) => userFields.find((item) => item.field === field)?.label || titleCase(field);
const stringifyValue = (value) => {
  if (value === null || value === undefined || value === "") return "Not specified";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
};

const buildFilterQuery = (filters = []) => {
  const query = {};
  const andClauses = [];
  filters.forEach((filter) => {
    const field = String(filter.field || "").trim();
    const operator = String(filter.operator || "equals").trim();
    const value = filter.value;
    const fieldType = typeFor(field);

    if (!allowedFields.has(field)) return;

    if (operator === "notempty") {
      query[field] = { $nin: ["", null] };
      return;
    }

    if (Array.isArray(value)) {
      const values = value.map((item) => String(item || "").trim()).filter(Boolean);
      if (values.length) query[field] = { $in: values };
      return;
    }

    const cleanValue = String(value || "").trim();
    if (!cleanValue) return;

    if (operator === "contains") {
      if (fieldType === "String") {
        query[field] = { $regex: escapeRegExp(cleanValue), $options: "i" };
      } else {
        andClauses.push({ $expr: { $regexMatch: { input: { $toString: `$${field}` }, regex: escapeRegExp(cleanValue), options: "i" } } });
      }
    } else if (fieldType === "Number") {
      const numericValue = toNumber(cleanValue);
      if (numericValue !== undefined) query[field] = numericValue;
    } else if (fieldType === "Date") {
      const dateValue = new Date(cleanValue);
      if (!Number.isNaN(dateValue.getTime())) {
        const nextDate = new Date(dateValue);
        nextDate.setDate(nextDate.getDate() + 1);
        query[field] = { $gte: dateValue, $lt: nextDate };
      }
    } else {
      query[field] = cleanValue;
    }
  });
  if (andClauses.length) query.$and = andClauses;
  return query;
};

const pivotByField = (rows, field) => {
  const counts = {};
  rows.forEach((row) => {
    const value = stringifyValue(row[field]);
    counts[value] = (counts[value] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([value, count]) => ({
      id: `${field}-${value}`,
      field,
      fieldLabel: labelFor(field),
      value,
      count
    }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
};

const pivotByFields = (rows, fields = []) => {
  const activeFields = fields.filter((field) => allowedFields.has(field));
  const counts = {};

  rows.forEach((row) => {
    const keyValues = activeFields.map((field) => stringifyValue(row[field]));
    const key = keyValues.join("||");
    if (!counts[key]) {
      counts[key] = {
        id: key || "all-users",
        values: Object.fromEntries(activeFields.map((field, index) => [field, keyValues[index]])),
        value: keyValues.join(" / ") || "All users",
        count: 0
      };
    }
    counts[key].count += 1;
  });

  return Object.values(counts).sort((a, b) => b.count - a.count);
};

exports.getUserPivotOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const baseQuery = { colid };
    const entries = await Promise.all(userFields.map(async ({ field, label }) => {
      const values = await User.distinct(field, baseQuery);
      return [
        field,
        {
          label,
          values: values
            .map((item) => stringifyValue(item))
            .filter((item) => item && item !== "Not specified")
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        }
      ];
    }));

    res.json({ success: true, fields: userFields, options: Object.fromEntries(entries) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateUserPivotReport = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });

    const filters = Array.isArray(req.body.filters) ? req.body.filters : [];
    const requestedPivotFields = Array.isArray(req.body.pivotFields) ? req.body.pivotFields : [];
    const selectedPivotFields = [...new Set(
      (requestedPivotFields.length ? requestedPivotFields : filters.map((item) => item.field))
        .filter((field) => allowedFields.has(field))
    )];
    const pivotFields = selectedPivotFields.length ? selectedPivotFields : ["role", "programcode", "category", "gender"];

    const query = {
      colid,
      ...buildFilterQuery(filters)
    };
    const selectFields = [...new Set([
      ...pivotFields,
      ...filters.map((item) => item.field).filter((field) => allowedFields.has(field)),
      "colid"
    ])].join(" ");

    const [rows, institution] = await Promise.all([
      User.find(query).select(selectFields).lean(),
      Institution.findOne({ colid }).lean()
    ]);

    const grouped = req.body.groupTogether === true;
    const pivotRows = grouped ? pivotByFields(rows, pivotFields) : pivotFields.flatMap((field) => pivotByField(rows, field));

    res.json({
      success: true,
      total: rows.length,
      fields: userFields,
      selectedFilters: filters.filter((item) => item.field && (item.operator === "notempty" || item.value)),
      pivotFields,
      pivotRows,
      grouped,
      institution: institution || null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
