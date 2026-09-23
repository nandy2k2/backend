const mongoose = require("mongoose");

const CrmGmailReplyLogSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  agentid: { type: mongoose.Schema.Types.ObjectId, ref: "CrmGmailReplyAgent", index: true },
  agentname: { type: String, default: "" },
  gmailaccount: { type: String, default: "" },
  messageid: { type: String, default: "" },
  threadid: { type: String, default: "" },
  from: { type: String, default: "" },
  fromemail: { type: String, default: "" },
  subject: { type: String, default: "" },
  snippet: { type: String, default: "" },
  matchedrule: { type: String, default: "" },
  replysubject: { type: String, default: "" },
  replybody: { type: String, default: "" },
  status: { type: String, default: "Skipped" },
  reason: { type: String, default: "" },
  error: { type: String, default: "" },
  processedat: { type: Date, default: Date.now },
  user: { type: String, default: "" },
  username: { type: String, default: "" }
}, { timestamps: true });

module.exports = mongoose.model("CrmGmailReplyLog", CrmGmailReplyLogSchema);
