const mongoose = require("mongoose");

const regulationSubjectSchema = new mongoose.Schema(
  {
    regulationid: { type: String, trim: true },
    regulation: { type: String, trim: true, required: true },
    academicyear: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true },
    subject: { type: String, trim: true, required: true },
    type: {
      type: String,
      enum: ["Major", "Minor", "IDC", "MDC", "AEC", "SEC", "VAC"],
      required: true
    },
    totalseats: { type: Number, default: 0 },
    general: { type: Number, default: 0 },
    sc: { type: Number, default: 0 },
    st: { type: Number, default: 0 },
    ebc: { type: Number, default: 0 },
    ews: { type: Number, default: 0 },
    ph: { type: Number, default: 0 },
    sportsnccnss: { type: Number, default: 0 },
    supernumerary: { type: Number, default: 0 },
    samestate: {
      type: String,
      enum: ["Yes", "No"],
      default: "Yes"
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      default: "Other"
    },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

regulationSubjectSchema.index({ colid: 1, regulation: 1, academicyear: 1, programcode: 1, subject: 1, type: 1 });

module.exports = mongoose.model("regulationsubjectds", regulationSubjectSchema);
