const mongoose = require("mongoose");

const BulkEmailCampaignSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  campaignname: { type: String, required: true },
  description: String,
  status: { type: String, default: "Active" },
  startdate: Date,
  enddate: Date,
  user: String,
  name: String
}, { timestamps: true });

BulkEmailCampaignSchema.index({ colid: 1, campaignname: 1, status: 1 });

module.exports = mongoose.models.bulkemailcampaignsds || mongoose.model("bulkemailcampaignsds", BulkEmailCampaignSchema);
