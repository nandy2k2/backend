const mongoose = require("mongoose");

const specializationNewCourseSchema = new mongoose.Schema(
  {
    specializationid: { type: mongoose.Schema.Types.ObjectId, ref: "specializationnewds" },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    specialization: { type: String, trim: true, required: true },
    type: { type: String, trim: true },
    subject: { type: String, trim: true },
    semester: { type: String, trim: true },
    course: { type: String, trim: true, required: true },
    coursecode: { type: String, trim: true, required: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

specializationNewCourseSchema.index({ colid: 1, academicyear: 1, regulation: 1, programcode: 1, semester: 1, specialization: 1, coursecode: 1 });

module.exports = mongoose.model("specializationnewcourseds", specializationNewCourseSchema);
