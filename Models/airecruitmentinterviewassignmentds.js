const mongoose = require("mongoose");

const AiRecruitmentInterviewAssignmentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  token: { type: String, required: true, unique: true, index: true },
  agentid: { type: String, required: true, index: true },
  agenttitle: { type: String, default: "" },
  topic: { type: String, default: "" },
  difficulty: { type: String, default: "" },
  timelimitminutes: { type: Number, default: 15 },
  jobid: { type: String, default: "", index: true },
  jobtitle: { type: String, default: "" },
  formid: { type: String, default: "" },
  formname: { type: String, default: "" },
  applicationid: { type: String, required: true, index: true },
  applicationno: { type: String, default: "" },
  candidate: { type: String, default: "" },
  candidateemail: { type: String, default: "", index: true },
  candidatephone: { type: String, default: "" },
  link: { type: String, default: "" },
  status: { type: String, default: "Assigned", index: true },
  startedat: { type: Date },
  completedat: { type: Date },
  score: { type: Number, default: 0 },
  maxscore: { type: Number, default: 100 },
  percentage: { type: Number, default: 0 },
  recommendation: { type: String, default: "" },
  summary: { type: String, default: "" },
  transcript: { type: [mongoose.Schema.Types.Mixed], default: [] },
  ipaddress: { type: String, default: "" },
  useragent: { type: String, default: "" },
  mailstatus: { type: String, default: "" },
  mailmessage: { type: String, default: "" },
  shortlisted: { type: String, default: "No" },
  shortlistcomments: { type: String, default: "" },
  assignedby: { type: String, default: "" },
  assignedbyname: { type: String, default: "" }
}, { timestamps: true });

AiRecruitmentInterviewAssignmentSchema.index({ colid: 1, jobid: 1, applicationid: 1, agentid: 1 }, { unique: true });
AiRecruitmentInterviewAssignmentSchema.index({ colid: 1, status: 1, percentage: -1 });

module.exports = mongoose.models.airecruitmentinterviewassignmentds || mongoose.model("airecruitmentinterviewassignmentds", AiRecruitmentInterviewAssignmentSchema);
