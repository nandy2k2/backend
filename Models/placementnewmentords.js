const mongoose = require("mongoose");

const placementNewMentorSchema = new mongoose.Schema(
  {
    mentor: { type: String, trim: true },
    mentoremail: { type: String, trim: true, index: true },
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true },
    regno: { type: String, trim: true, index: true },
    academicyear: { type: String, trim: true },
    admissionyear: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewMentorSchema.index({ colid: 1, mentoremail: 1, regno: 1 }, { unique: true });

module.exports = mongoose.models.placementnewmentords || mongoose.model("placementnewmentords", placementNewMentorSchema);
