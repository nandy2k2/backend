const mongoose = require("mongoose");

const userProfileDocumentRequirementSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    role: { type: String, trim: true, required: true },
    type: { type: String, enum: ["Academic Details", "Employment Details"], required: true },
    documentname: { type: String, trim: true, required: true },
    description: { type: String, trim: true },
    mandatory: { type: String, trim: true, default: "Yes" },
    order: { type: Number, default: 0 },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

userProfileDocumentRequirementSchema.index({ colid: 1, role: 1, type: 1, documentname: 1 }, { unique: true });

module.exports = mongoose.model("userprofiledocumentrequirementds", userProfileDocumentRequirementSchema);
