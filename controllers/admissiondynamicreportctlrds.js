const AdmissionApplication = require("../Models/admissionapplicationdynamic");
const AdmissionFormField = require("../Models/admissionformfield");
const Institution = require("../Models/insdetails");

const baseFields = [
  "formid",
  "academicyear",
  "name",
  "applicationid",
  "applicationnumber",
  "username",
  "password",
  "email",
  "phone",
  "regno",
  "country_form",
  "state_form",
  "district_form",
  "result_status_12th",
  "board_12th",
  "marks_type_12th",
  "marks_12",
  "cgpa_12",
  "result_status_10th",
  "board_10th",
  "marks_type_10th",
  "marks_10",
  "cgpa_10",
  "University_UG",
  "result_status_UG",
  "marks_type_UG",
  "marks_UG",
  "cgpa_UG",
  "University_PG",
  "result_status_PG",
  "marks_type_PG",
  "marks_PG",
  "cgpa_PG",
  "gender",
  "category",
  "ews",
  "ph",
  "minority",
  "dateofbirth",
  "dateofapplication",
  "age",
  "level",
  "programtype",
  "programapplied",
  "programcode",
  "applicationstatus",
  "enrollmentstatus",
  "applicationcomments",
  "validationstatus",
  "paymentstatus",
  "paymentrefno",
  "paidamount",
  "paiddate",
  "provisionalpaymentstatus",
  "provisionalpaymentrefno",
  "provisionalpaidamount",
  "provisionalpaiddate",
  "createdAt",
  "updatedAt"
];

const labels = {
  formid: "Form ID",
  academicyear: "Academic Year",
  name: "Applicant",
  applicationid: "Application ID",
  applicationnumber: "Application Number",
  country_form: "Country",
  state_form: "State",
  district_form: "District",
  programtype: "Program Type",
  programapplied: "Program",
  programcode: "Program Code",
  applicationstatus: "Application Status",
  enrollmentstatus: "Enrollment Status",
  validationstatus: "Validation Status",
  paymentstatus: "Application Fee Status",
  paidamount: "Application Fee Paid",
  paiddate: "Application Fee Paid Date",
  provisionalpaymentstatus: "Provisional Fee Status",
  provisionalpaidamount: "Provisional Fee Paid",
  provisionalpaiddate: "Provisional Fee Paid Date",
  createdAt: "Created Date",
  updatedAt: "Updated Date"
};

const clean = (value) => String(value ?? "").trim();
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const escapeRegex = (value) => clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const labelFor = (field) => labels[field] || field.replace("extraFields.", "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const getValue = (row, field) => {
  if (field.startsWith("extraFields.")) return row.extraFields?.[field.replace("extraFields.", "")];
  return row[field];
};

const dateOnly = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value);
  return date.toISOString().slice(0, 10);
};

const displayValue = (value) => {
  if (value === undefined || value === null || value === "") return "Not specified";
  if (value instanceof Date) return dateOnly(value);
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const flattenApplication = (row, fields) => {
  const flat = { _id: String(row._id) };
  fields.forEach(({ field }) => {
    const value = getValue(row, field);
    flat[field] = value instanceof Date ? dateOnly(value) : value;
  });
  return flat;
};

const addFilter = (query, filter) => {
  if (!filter?.field) return;
  const value = filter.value;
  if (value === undefined || value === null || (Array.isArray(value) && !value.length) || (!Array.isArray(value) && clean(value) === "")) return;
  if (Array.isArray(value)) {
    const values = value.map(clean).filter(Boolean);
    if (values.length) query[filter.field] = { $in: values };
    return;
  }
  query[filter.field] = { $regex: escapeRegex(value), $options: "i" };
};

const buildFields = async (colid) => {
  const customFields = await AdmissionFormField.find({ colid, isactive: /^Yes$/i })
    .select("fieldname label formid page section order")
    .sort({ formid: 1, page: 1, section: 1, order: 1, createdAt: 1 })
    .lean();
  const observedApplications = await AdmissionApplication.find({ colid }).select("extraFields").limit(1000).lean();
  const observedExtraKeys = Array.from(new Set(observedApplications.flatMap((item) => {
    if (!item.extraFields || typeof item.extraFields !== "object" || Array.isArray(item.extraFields)) return [];
    return Object.keys(item.extraFields);
  }))).sort();

  const customMap = new Map();
  customFields.forEach((field) => {
    if (!field.fieldname) return;
    customMap.set(field.fieldname, {
      field: `extraFields.${field.fieldname}`,
      label: field.label || field.fieldname,
      source: "custom",
      formid: field.formid || "",
      page: field.page || "",
      section: field.section || ""
    });
  });
  observedExtraKeys.forEach((fieldname) => {
    if (!fieldname || customMap.has(fieldname)) return;
    customMap.set(fieldname, { field: `extraFields.${fieldname}`, label: fieldname, source: "custom", formid: "", page: "", section: "" });
  });

  return [
    ...baseFields.map((field) => ({ field, label: labelFor(field), source: "base" })),
    ...Array.from(customMap.values())
  ];
};

const buildOptions = async (colid, fields) => {
  const options = {};
  await Promise.all(fields.map(async ({ field }) => {
    if (field === "password" || /comments$/i.test(field)) return;
    const values = await AdmissionApplication.distinct(field, { colid });
    options[field] = values.map(displayValue).filter((value) => value && value !== "Not specified").sort((a, b) => a.localeCompare(b));
  }));
  return options;
};

const summarize = (rows) => {
  const total = rows.length;
  const applicationFeePaid = rows.filter((row) => /^success|paid$/i.test(clean(row.paymentstatus))).length;
  const provisionalFeePaid = rows.filter((row) => /^success|paid$/i.test(clean(row.provisionalpaymentstatus))).length;
  const applicationFeeAmount = rows.reduce((sum, row) => sum + Number(row.paidamount || 0), 0);
  const provisionalFeeAmount = rows.reduce((sum, row) => sum + Number(row.provisionalpaidamount || 0), 0);
  const admitted = rows.filter((row) => /^admitted$/i.test(clean(row.applicationstatus))).length;
  return { total, applicationFeePaid, provisionalFeePaid, applicationFeeAmount, provisionalFeeAmount, admitted };
};

const countBy = (rows, field, label) => {
  const map = new Map();
  rows.forEach((row) => {
    const key = displayValue(getValue(row, field));
    const current = map.get(key) || { name: key, count: 0, applicationFeeAmount: 0, provisionalFeeAmount: 0 };
    current.count += 1;
    current.applicationFeeAmount += Number(row.paidamount || 0);
    current.provisionalFeeAmount += Number(row.provisionalpaidamount || 0);
    map.set(key, current);
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 20).map((item, index) => ({ id: `${label}-${index}`, ...item }));
};

const buildPivot = (rows, pivotFields) => {
  if (!pivotFields.length) return [];
  const map = new Map();
  rows.forEach((row) => {
    const parts = pivotFields.map((field) => displayValue(getValue(row, field)));
    const key = parts.join("||");
    const current = map.get(key) || { id: key, count: 0, applicationFeePaid: 0, provisionalFeePaid: 0, applicationFeeAmount: 0, provisionalFeeAmount: 0 };
    pivotFields.forEach((field, index) => {
      current[field] = parts[index];
    });
    current.count += 1;
    if (/^success|paid$/i.test(clean(row.paymentstatus))) current.applicationFeePaid += 1;
    if (/^success|paid$/i.test(clean(row.provisionalpaymentstatus))) current.provisionalFeePaid += 1;
    current.applicationFeeAmount += Number(row.paidamount || 0);
    current.provisionalFeeAmount += Number(row.provisionalpaidamount || 0);
    map.set(key, current);
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
};

exports.getAdmissionDynamicReportOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ message: "colid is required" });
    const fields = await buildFields(colid);
    const options = await buildOptions(colid, fields);
    res.json({ fields, options });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.generateAdmissionDynamicReport = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ message: "colid is required" });
    const fields = await buildFields(colid);
    const fieldSet = new Set(fields.map((item) => item.field));
    const filters = Array.isArray(req.body.filters) ? req.body.filters.filter((filter) => fieldSet.has(filter.field)) : [];
    const pivotFields = (Array.isArray(req.body.pivotFields) ? req.body.pivotFields : []).filter((field) => fieldSet.has(field));
    const detailFields = (Array.isArray(req.body.detailFields) && req.body.detailFields.length ? req.body.detailFields : [
      "applicationnumber",
      "name",
      "email",
      "phone",
      "academicyear",
      "programapplied",
      "programcode",
      "applicationstatus",
      "enrollmentstatus",
      "paymentstatus",
      "provisionalpaymentstatus",
      "createdAt"
    ]).filter((field) => fieldSet.has(field));

    const query = { colid };
    filters.forEach((filter) => addFilter(query, filter));
    const rows = await AdmissionApplication.find(query).sort({ createdAt: -1 }).limit(10000).lean();
    const institution = await Institution.findOne({ colid }).sort({ updatedAt: -1, createdAt: -1 }).lean();
    const chartFields = ["programapplied", "programcode", "academicyear", "applicationstatus", "enrollmentstatus", "paymentstatus", "provisionalpaymentstatus", "validationstatus"];

    res.json({
      fields,
      detailFields,
      summary: summarize(rows),
      charts: chartFields.map((field) => ({ field, label: labelFor(field), rows: countBy(rows, field, field) })),
      details: rows.map((row) => flattenApplication(row, fields)),
      pivot: buildPivot(rows, pivotFields),
      pivotFields,
      institution: institution || null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
