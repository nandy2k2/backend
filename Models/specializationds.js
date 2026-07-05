const mongoose = require("mongoose");

const specializationSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    semester: { type: String, trim: true, required: true },
    course: { type: String, trim: true, required: true },
    coursecode: { type: String, trim: true, required: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

specializationSchema.index({ colid: 1, academicyear: 1, regulation: 1, programcode: 1, semester: 1, coursecode: 1 });

module.exports = mongoose.model("specializationds", specializationSchema);
