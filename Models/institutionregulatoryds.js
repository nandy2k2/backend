const mongoose = require("mongoose");

const institutionRegulatorySchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    institution: { type: String, trim: true, required: true, index: true },
    institutioncode: { type: String, trim: true },
    regulatorybody: { type: String, trim: true, required: true },
    permanentid: { type: String, trim: true },
    lettertype: { type: String, trim: true },
    letternumber: { type: String, trim: true },
    validityyear: { type: String, trim: true },
    validitystartdate: { type: Date },
    validityexpirydate: { type: Date },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

institutionRegulatorySchema.index({ colid: 1, institution: 1, regulatorybody: 1, permanentid: 1, validityyear: 1 });

module.exports = mongoose.models.institutionregulatoryds || mongoose.model("institutionregulatoryds", institutionRegulatorySchema);
