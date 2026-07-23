const mongoose = require("mongoose");

const institutionPolicySchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true },
    name: { type: String, trim: true },
    policytype: { type: String, trim: true, required: true },
    title: { type: String, trim: true },
    description: { type: String, trim: true },
    sourcetype: { type: String, trim: true, default: "Link" },
    url: { type: String, trim: true },
    filename: { type: String, trim: true },
    originalname: { type: String, trim: true },
    mimetype: { type: String, trim: true },
    size: { type: Number, default: 0 },
    awsconfigid: { type: String, trim: true },
    bucket: { type: String, trim: true },
    region: { type: String, trim: true },
    key: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" }
  },
  { timestamps: true }
);

institutionPolicySchema.index({ colid: 1, policytype: 1, status: 1 });

module.exports = mongoose.model("institutionpolicyds", institutionPolicySchema);
