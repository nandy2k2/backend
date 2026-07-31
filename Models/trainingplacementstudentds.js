const mongoose = require("mongoose");

const trainingPlacementStudentSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    courseid: { type: mongoose.Schema.Types.ObjectId, ref: "trainingplacementcourseds" },
    eventid: { type: mongoose.Schema.Types.ObjectId, ref: "trainingplacementeventds" },
    coursecode: { type: String, trim: true },
    coursename: { type: String, trim: true },
    eventcode: { type: String, trim: true },
    eventname: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    semester: { type: String, trim: true },
    section: { type: String, trim: true },
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true },
    regno: { type: String, trim: true, index: true },
    phone: { type: String, trim: true },
    assignmentdate: { type: String, trim: true },
    completionstatus: { type: String, trim: true, default: "Assigned" },
    score: { type: Number, default: 0 },
    feedback: { type: String, trim: true },
    remarks: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

trainingPlacementStudentSchema.index({ colid: 1, coursecode: 1, eventcode: 1, regno: 1 });

module.exports = mongoose.models.trainingplacementstudentds || mongoose.model("trainingplacementstudentds", trainingPlacementStudentSchema);
