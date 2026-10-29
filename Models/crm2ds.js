const mongoose = require("mongoose");
const User = require("./user");

const masters = {
  source: "Source", pipeline: "Pipeline", type: "Type", category: "Category",
  leadrating: "Lead rating", case: "Case", distributiontype: "Distribution type",
  mediumofinstruction: "Medium of Instruction", quota: "Quota", document: "Document",
  admissionoffice: "Admission office", interactionmode: "Interaction mode", agent: "Agent"
};
const masterLeadFields = { category: "crmcategory", mediumofinstruction: "Mediumofinstruction", document: "documents.documentname", interactionmode: "interactions.mode", agent: "agentname" };
const excluded = new Set(["_id", "__v", "program", "programcode", "semester", "Major", "Minor", "MDC", "IDC", "VAC", "SEC", "major", "minor", "mdc", "idc", "vac", "sec", "minorsub", "mdcsub", "vocationalsub", "authenticatorsecret"]);
const definitions = {};
excluded.add("srno"); excluded.add("expotoken");
excluded.add('biometricid'); excluded.add('notification');
for (const field of ["abcid", "rollno", "dob", "birthdate", "dateofbirth", "customFields", "admissionapplicationid", "Admissionapplicationid"]) excluded.add(field);
for (const field of ["regno", "scholarnumber", "scholarno", "authenticator", "excluded", "role", "expopushtoken", "Smp", "smp", "profileapprovalstatus", "profileapprovalcomments", "admissionyear", "section", "isfinalyear", "eligibilityname", "designation", "regulation", "AEC", "othersub", "merit", "obtain", "obtained", "bonus", "weightage", "ncctype", "institution", "specialization1", "specialization2"]) excluded.add(field);
User.schema.eachPath((field, schemaType) => {
  if (excluded.has(field) || field.includes(".$")) return;
  const options = { ...schemaType.options };
  for (const key of ["required", "unique", "index", "default", "validate"]) delete options[key];
  if (field === "password") options.select = false;
  definitions[field] = options;
});
Object.assign(definitions, {
  active: { type: String, enum: ["Yes", "No"], default: "Yes" }, followupdate: Date,
  telecallername: String, telecalleremail: String, dateadded: { type: Date, default: Date.now },
  stage: String, stagetime: Date,
  country: String,
  admitted: { type: String, enum: ['Yes', 'No'], default: 'No' },
  agentname: String, agentemail: String, admissionstatus: { type: String, enum: ["Admitted", "Not admitted"], default: "Not admitted" },
  admissionofficeid: String, admissionoffice: String, campusvisitdate: Date, campuscounsellor: String, campuscounseloremail: String,
  gender: { type: String, enum: ["Male", "Female", "Not specified"] },
  category: { type: String, enum: ["SC", "ST", "General", "OBC"] },
  samestate: { type: String, enum: ["Yes", "No"] }, isdisabled: { type: String, enum: ["Yes", "No"] }
});
definitions.crm2profileversion = { type: Number, default: 2 };
const educationFields = [];
for (const level of ["12th", "10th"]) for (const suffix of ["institution", "passingyear", "grade", "marks", "board"]) {
  const field = `${level}${suffix}`; educationFields.push(field); definitions[field] = { type: suffix === "marks" ? Number : String };
}
const groups = {
  Identity: ["name", "email", "phone", "googleemail", "regno", "scholarnumber", "abcid", "rollno", "gender", "dob", "birthdate", "nationality", "photo"],
  "Family & Address": ["fathername", "mothername", "guardianname", "guardianmobile", "guardianemail", "address", "country", "state", "city", "district", "pincode", "category", "quota", "annualincome", "freeshipcardholder", "samestate"],
  "Education & Work": ["academicyear", "degree", "department", "joiningdate", "skills", "Mediumofinstruction", "admissionapplicationid", "isdisabled", "scholarship", ...educationFields],
  "CRM Details": ["telecallername", "telecalleremail", "dateadded", "active", "admitted", "followupdate", "agentname", "agentemail", "admissionstatus", "admissionofficeid", "admissionoffice", "campusvisitdate", "campuscounsellor", "campuscounseloremail"],
  "Additional Details": []
};
const managed = new Set(["colid", "user", "addedby", "authenticatordate", "authenticatorsetupdate", "crm2profileversion"]);
for (const field of ['dateadded', 'stage', 'stagetime', 'wizardcompleted']) managed.add(field);
const profileSchema = new mongoose.Schema(definitions);
const fields = Object.keys(definitions).filter(field => !field.includes(".$") && !managed.has(field)).map(field => {
  const original = profileSchema.path(field);
  const group = Object.keys(groups).find(key => groups[key].includes(field)) || "Additional Details";
  return { field, label: field.replace(/([a-z])([A-Z])/g, "$1 $2"), type: original.instance, options: original.enumValues || [], group };
});
Object.assign(definitions, {
  colid: { type: Number, required: true, index: true }, name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true }, phone: { type: String, required: true, trim: true },
  emailkey: { type: String, required: true, select: false }, phonekey: { type: String, required: true, select: false },
  counsellorname: String, counselloremail: String,
  counsellorassignedat: Date,
  telecallerassignedat: Date,
  programsinterested: [{ academicyear: { type: String, required: true }, program: { type: String, required: true }, programcode: { type: String, required: true }, priority: { type: Number, min: 1 } }],
  source: String, pipeline: String, type: String, leadrating: String, case: String, distributiontype: String, crmcategory: String,
  education: [{ level: { type: String, required: true }, institution: String, board: String, passingyear: String, marks: { type: Number, min: 0 }, grade: String, subjects: [{ subject: { type: String, required: true }, obtained: { type: Number, min: 0 }, total: { type: Number, min: 0 }, grade: String }] }],
  documents: [{ documentname: { type: String, required: true }, title: String, url: { type: String, required: true }, uploadedat: { type: Date, default: Date.now } }],
  interactions: [{ details: { type: String, required: true }, mode: { type: String, required: true }, pipeline: { type: String, required: true }, nextfollowupdate: Date, interactiondate: { type: Date, default: Date.now }, createdby: String, updatedby: String, createdAt: { type: Date, default: Date.now }, updatedAt: Date }],
  createdby: String, updatedby: String,
  wizardcompleted: { type: [String], default: undefined }
});
const leadSchema = new mongoose.Schema(definitions, { timestamps: true });
leadSchema.index({ colid: 1, emailkey: 1 }, { unique: true });
leadSchema.index({ colid: 1, phonekey: 1 }, { unique: true });
const masterModels = Object.fromEntries(Object.keys(masters).map(key => {
  const schema = new mongoose.Schema({ colid: { type: Number, required: true, index: true }, name: { type: String, required: true, trim: true }, namekey: { type: String, required: true }, description: String, status: { type: String, enum: ["Active", "Inactive"], default: "Active" }, order: { type: Number, default: 0 }, createdby: String }, { timestamps: true });
  if (key === "agent") {
    schema.add({ email: { type: String, required: true, trim: true, lowercase: true }, phone: String, pan: String, gst: String, address: String, state: String, country: String });
    schema.index({ colid: 1, email: 1 }, { unique: true });
  }
  schema.index({ colid: 1, namekey: 1 }, { unique: true });
  const modelName = `crm2${key}masterds`;
  return [key, mongoose.models[modelName] || mongoose.model(modelName, schema)];
}));

module.exports = { Lead: mongoose.models.crm2leadds || mongoose.model("crm2leadds", leadSchema), masterModels, masters, masterLeadFields, fields, excluded, managed };
