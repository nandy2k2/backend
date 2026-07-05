const mongoose = require("mongoose");

const graceMarksPolicySchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true, index: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true, index: true },
    semester: { type: String, trim: true, required: true },
    course: { type: String, trim: true, required: true },
    coursecode: { type: String, trim: true, required: true, index: true },
    gracemark: { type: Number, default: 0 },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

graceMarksPolicySchema.index({ colid: 1, academicyear: 1, regulation: 1, programcode: 1, semester: 1, coursecode: 1 }, { unique: true });

module.exports = mongoose.model("gracemarkspolicyds", graceMarksPolicySchema);
