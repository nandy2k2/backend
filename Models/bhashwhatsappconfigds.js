const mongoose = require("mongoose");

const bhashWhatsappConfigSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  name: { type: String, trim: true, default: "" },
  baseUrl: { type: String, trim: true, default: "https://developer.bhashsms.com" },
  endpoint: { type: String, trim: true, default: "https://developer.bhashsms.com/sendMessage" },
  authenticateEndpoint: { type: String, trim: true, default: "https://developer.bhashsms.com/appAuthenticate" },
  refreshEndpoint: { type: String, trim: true, default: "https://developer.bhashsms.com/appRefresh" },
  getTemplatesEndpoint: { type: String, trim: true, default: "https://developer.bhashsms.com/getAllTemplates" },
  createTemplateEndpoint: { type: String, trim: true, default: "https://developer.bhashsms.com/createApiTemplate" },
  method: { type: String, enum: ["POST", "GET"], default: "POST" },
  authType: { type: String, enum: ["None", "Bearer", "Header", "Basic", "Query"], default: "Header" },
  authHeaderName: { type: String, trim: true, default: "Authorization" },
  apiKey: { type: String, trim: true, default: "" },
  username: { type: String, trim: true, default: "" },
  password: { type: String, trim: true, default: "" },
  accessToken: { type: String, trim: true, default: "" },
  refreshToken: { type: String, trim: true, default: "" },
  tokenExpiresAt: { type: Date },
  sender: { type: String, trim: true, default: "" },
  defaultCountryCode: { type: String, trim: true, default: "91" },
  phoneField: { type: String, trim: true, default: "phone" },
  toParam: { type: String, trim: true, default: "to" },
  messageParam: { type: String, trim: true, default: "message" },
  titleParam: { type: String, trim: true, default: "title" },
  templateName: { type: String, trim: true, default: "" },
  languageCode: { type: String, trim: true, default: "" },
  headersJson: { type: String, trim: true, default: "" },
  extraPayload: { type: String, trim: true, default: "" },
  authenticatePayloadJson: { type: String, trim: true, default: "{\"username\":\"{{username}}\",\"password\":\"{{password}}\"}" },
  refreshPayloadJson: { type: String, trim: true, default: "{\"refreshToken\":\"{{refreshToken}}\"}" },
  templatePayloadJson: { type: String, trim: true, default: "{\"templateName\":\"{{templateName}}\",\"languageCode\":\"{{languageCode}}\",\"content\":\"{{content}}\"}" },
  sendPayloadJson: { type: String, trim: true, default: "{\"to\":\"{{to}}\",\"message\":\"{{message}}\",\"templateName\":\"{{templateName}}\",\"languageCode\":\"{{languageCode}}\"}" },
  isactive: { type: Boolean, default: true, index: true },
  notes: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

bhashWhatsappConfigSchema.index({ colid: 1, name: 1 });
bhashWhatsappConfigSchema.index({ colid: 1, isactive: 1 });

module.exports = mongoose.models.bhashwhatsappconfigds || mongoose.model("bhashwhatsappconfigds", bhashWhatsappConfigSchema);
