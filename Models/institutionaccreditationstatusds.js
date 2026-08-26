const mongoose = require("mongoose");

const institutionAccreditationStatusSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true },
    namecreated: { type: String, trim: true },
    accreditation: { type: String, trim: true, required: true },
    type: { type: String, trim: true, enum: ["Program", "Institute"], default: "Program" },
    program: { type: String, trim: true },
    department: { type: String, trim: true },
    accreditationdate: { type: Date },
    validitydate: { type: Date },
    status: { type: String, trim: true, default: "Active" }
  },
  { timestamps: true }
);

institutionAccreditationStatusSchema.index({ colid: 1, accreditation: 1, type: 1, program: 1 });

module.exports = mongoose.model("institutionaccreditationstatusds", institutionAccreditationStatusSchema);
