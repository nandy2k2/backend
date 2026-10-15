const mongoose = require("mongoose");
const { Schema } = mongoose;
const str = { type: String, trim: true, default: "" };
const scope = { colid: { type: Number, required: true, index: true }, user: str };
const course = { program: str, programcode: str, regulation: str, semester: str, course: str, coursecode: str, type: str, subject: str };
const panelSchema = new Schema({ ...scope, ...course, panelname: { type: String, required: true, trim: true }, description: str, status: { ...str, default: "Active" } }, { timestamps: true });
panelSchema.index({ colid: 1, panelname: 1 }, { unique: true });
const levelSchema = new Schema({ order: { type: Number, required: true, min: 1 }, approvername: str, approveremail: { type: String, required: true, lowercase: true, trim: true } }, { _id: false });
const workflowSchema = new Schema({ ...scope, panelid: { type: Schema.Types.ObjectId, required: true }, levels: [levelSchema] }, { timestamps: true });
workflowSchema.index({ colid: 1, panelid: 1 }, { unique: true });
const memberSchema = new Schema({
  ...scope, panelid: { type: Schema.Types.ObjectId, required: true, index: true },
  kind: { type: String, enum: ["Internal", "External"], required: true },
  membername: { type: String, required: true, trim: true }, memberemail: { type: String, required: true, lowercase: true, trim: true },
  profile: { type: Schema.Types.Mixed, default: {} }, userid: { type: Schema.Types.ObjectId },
  invitationstatus: { type: String, enum: ["Not confirmed", "Accepted", "Rejected"], default: "Not confirmed" },
  invitationhash: { type: String, select: false }, invitationexpires: Date, invitationdate: Date, responsedate: Date,
  approvalstatus: { type: String, enum: ["Draft", "Pending", "Approved", "Rejected"], default: "Draft" },
  levels: [levelSchema], currentlevel: { type: Number, default: 0 }, currentapprover: str,
  decisionlock: Date,
  history: [{ order: Number, approveremail: String, decision: String, comments: String, date: Date }]
}, { timestamps: true });
memberSchema.index({ colid: 1, panelid: 1, memberemail: 1 }, { unique: true });
memberSchema.index({ colid: 1, memberemail: 1 }, { unique: true, partialFilterExpression: { kind: "External" } });
const assignmentSchema = new Schema({ ...scope, ...course, panelid: { type: Schema.Types.ObjectId, required: true }, memberid: { type: Schema.Types.ObjectId, required: true }, papersettername: str, papersetteremail: str, component: str, startdate: Date, enddate: Date, instructions: str, admindocuments: [{ title: String, url: String }], status: { ...str, default: "Assigned" } }, { timestamps: true });
assignmentSchema.index({ colid: 1, panelid: 1, memberid: 1, component: 1 }, { unique: true });
const logSchema = new Schema({ ...scope, panelid: Schema.Types.ObjectId, memberid: Schema.Types.ObjectId, channel: String, recipient: String, status: String, error: String }, { timestamps: true });
module.exports = {
  Panel: mongoose.model("questionpaperindentpanelds", panelSchema),
  Member: mongoose.model("questionpaperindentmemberds", memberSchema),
  Workflow: mongoose.model("questionpaperindentworkflowds", workflowSchema),
  Assignment: mongoose.model("questionpaperindentassignmentds", assignmentSchema),
  CommunicationLog: mongoose.model("questionpaperindentcommunicationlogds", logSchema)
};
