const mongoose = require("mongoose");

const syllabusSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    type: { type: String, trim: true, required: true },
    subject: { type: String, trim: true, required: true },
    semester: { type: String, trim: true, required: true },
    course: { type: String, trim: true, required: true },
    coursecode: { type: String, trim: true, required: true },
    module: { type: String, trim: true, required: true },
    syllabus: { type: String, trim: true, required: true },
    sourcefilelink: { type: String, trim: true },
    sourcefilename: { type: String, trim: true },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

syllabusSchema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  programcode: 1,
  type: 1,
  subject: 1,
  semester: 1,
  coursecode: 1,
  module: 1
});

module.exports = mongoose.model("syllabusds", syllabusSchema);
