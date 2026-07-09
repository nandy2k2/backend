const mongoose = require("mongoose");

const examinationModel2MarksSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true },
    exam: { type: String, trim: true },
    examcode: { type: String, trim: true, required: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true, required: true },
    semester: { type: String, trim: true, required: true },
    course: { type: String, trim: true },
    coursecode: { type: String, trim: true, required: true },
    credit: { type: Number, default: 0 },
    student: { type: String, trim: true },
    regno: { type: String, trim: true, required: true },
    abcid: { type: String, trim: true },
    theorymarks: { type: Number, default: 0 },
    theoryobtained: { type: Number, default: 0 },
    theorypercentage: { type: Number, default: 0 },
    theorygrade: { type: String, trim: true },
    practicalmarks: { type: Number, default: 0 },
    practicaltotal: { type: Number, default: 0 },
    practicalpercentage: { type: Number, default: 0 },
    practicalgrade: { type: String, trim: true },
    overallgradepoint: { type: Number, default: 0 },
    overallgrade: { type: String, trim: true },
    overallpercentage: { type: Number, default: 0 },
    gpa: { type: Number, default: 0 },
    status: { type: String, enum: ["Pass", "Fail"], default: "Pass" },
    attempt: { type: Number, default: 1 },
    type: { type: String, enum: ["Regular", "Supplementary"], default: "Regular" },
    examdate: { type: String, trim: true },
    resultprocessdate: { type: String, trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

examinationModel2MarksSchema.index({
  colid: 1,
  academicyear: 1,
  examcode: 1,
  programcode: 1,
  semester: 1,
  coursecode: 1,
  regno: 1,
  attempt: 1
}, { unique: true });

module.exports = mongoose.model("examinationmodel2marksds", examinationModel2MarksSchema);
