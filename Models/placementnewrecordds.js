const mongoose = require("mongoose");

const placementNewRecordSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, index: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true, index: true },
    student: { type: String, trim: true },
    regno: { type: String, trim: true, index: true },
    industry: { type: String, trim: true },
    sector: { type: String, trim: true },
    role: { type: String, trim: true },
    company: { type: String, trim: true },
    address: { type: String, trim: true },
    companymail: { type: String, trim: true },
    companyemail: { type: String, trim: true },
    salary: { type: Number, default: 0 },
    department: { type: String, trim: true },
    status: { type: String, trim: true, default: "Placed" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewRecordSchema.index({ colid: 1, academicyear: 1, programcode: 1, regno: 1, company: 1 });

module.exports = mongoose.models.placementnewrecordds || mongoose.model("placementnewrecordds", placementNewRecordSchema);
