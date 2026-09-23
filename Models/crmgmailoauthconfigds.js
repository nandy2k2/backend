const mongoose = require("mongoose");

const CrmGmailOauthConfigSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  configname: { type: String, default: "" },
  gmailaccount: { type: String, default: "" },
  clientid: { type: String, default: "" },
  clientsecret: { type: String, default: "" },
  redirecturi: { type: String, default: "" },
  scopes: { type: String, default: "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send" },
  accesstoken: { type: String, default: "" },
  refreshtoken: { type: String, default: "" },
  tokenexpiry: { type: Date },
  active: { type: String, default: "Yes" },
  default: { type: String, default: "No" },
  user: { type: String, default: "" },
  username: { type: String, default: "" }
}, { timestamps: true });

module.exports = mongoose.model("CrmGmailOauthConfig", CrmGmailOauthConfigSchema);
