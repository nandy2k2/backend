const mongoose = require("mongoose");

const GmailReplyRuleSchema = new mongoose.Schema({
  rulename: { type: String, default: "" },
  subjectcontains: { type: String, default: "" },
  contentcontains: { type: String, default: "" },
  replysubject: { type: String, default: "" },
  replybody: { type: String, default: "" },
  priority: { type: Number, default: 1 },
  active: { type: String, default: "Yes" },
  stopafterreply: { type: String, default: "Yes" }
}, { _id: true });

const CrmGmailReplyAgentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  agentname: { type: String, default: "" },
  gmailaccount: { type: String, default: "" },
  oauthconfigid: { type: mongoose.Schema.Types.ObjectId, ref: "CrmGmailOauthConfig" },
  accesstoken: { type: String, default: "" },
  refreshtoken: { type: String, default: "" },
  maxemails: { type: Number, default: 25 },
  markasread: { type: String, default: "Yes" },
  status: { type: String, default: "Active" },
  rules: { type: [GmailReplyRuleSchema], default: [] },
  user: { type: String, default: "" },
  username: { type: String, default: "" }
}, { timestamps: true });

module.exports = mongoose.model("CrmGmailReplyAgent", CrmGmailReplyAgentSchema);
