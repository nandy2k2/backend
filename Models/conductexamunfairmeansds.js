const mongoose = require("mongoose");

const conductExamUnfairMeansSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true },
    exam: { type: String, trim: true },
    examcode: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    semester: { type: String, trim: true },
    course: { type: String, trim: true },
    coursecode: { type: String, trim: true },
    examdate: { type: String, trim: true },
    slot: { type: String, trim: true },
    campus: { type: String, trim: true },
    building: { type: String, trim: true },
    room: { type: String, trim: true },
    student: { type: String, trim: true },
    regno: { type: String, trim: true, index: true },
    email: { type: String, trim: true },
    invigilator: { type: String, trim: true },
    invigilatoremail: { type: String, trim: true },
    incidenttype: { type: String, trim: true },
    details: { type: String, trim: true },
    actiontaken: { type: String, trim: true },
    remarks: { type: String, trim: true },
    status: { type: String, trim: true, default: "Reported" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

conductExamUnfairMeansSchema.index({ colid: 1, academicyear: 1, examcode: 1, examdate: 1, room: 1 });

module.exports = mongoose.models.conductexamunfairmeansds || mongoose.model("conductexamunfairmeansds", conductExamUnfairMeansSchema);
