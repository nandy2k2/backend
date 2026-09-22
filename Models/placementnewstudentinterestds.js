const mongoose = require("mongoose");

const placementNewStudentInterestSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    semester: { type: String, trim: true },
    section: { type: String, trim: true },
    department: { type: String, trim: true },
    category: { type: String, trim: true },
    gender: { type: String, trim: true },
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true },
    regno: { type: String, trim: true },
    interested: { type: String, trim: true, enum: ["Yes", "No"], default: "Yes" },
    industry: { type: String, trim: true },
    comments: { type: String, trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewStudentInterestSchema.index({ colid: 1, academicyear: 1, programcode: 1, semester: 1 });
placementNewStudentInterestSchema.index({ colid: 1, regno: 1, academicyear: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.placementnewstudentinterestds || mongoose.model("placementnewstudentinterestds", placementNewStudentInterestSchema);
