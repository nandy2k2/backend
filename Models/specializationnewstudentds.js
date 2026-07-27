const mongoose = require("mongoose");

const specializationNewStudentSchema = new mongoose.Schema(
  {
    specializationid: { type: mongoose.Schema.Types.ObjectId, ref: "specializationnewds" },
    studentid: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    semester: { type: String, trim: true, required: true },
    section: { type: String, trim: true },
    specialization: { type: String, trim: true, required: true },
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true },
    studentphone: { type: String, trim: true },
    regno: { type: String, trim: true },
    rollno: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

specializationNewStudentSchema.index({ colid: 1, specializationid: 1, studentid: 1 }, { unique: true });
specializationNewStudentSchema.index({ colid: 1, academicyear: 1, regulation: 1, programcode: 1, semester: 1, specialization: 1 });

module.exports = mongoose.model("specializationnewstudentds", specializationNewStudentSchema);
