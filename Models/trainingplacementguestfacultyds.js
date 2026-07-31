const mongoose = require("mongoose");

const trainingPlacementGuestFacultySchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    courseid: { type: mongoose.Schema.Types.ObjectId, ref: "trainingplacementcourseds" },
    coursecode: { type: String, trim: true },
    coursename: { type: String, trim: true },
    facultyname: { type: String, trim: true, required: true },
    facultyemail: { type: String, trim: true },
    phone: { type: String, trim: true },
    organization: { type: String, trim: true },
    designation: { type: String, trim: true },
    expertise: { type: String, trim: true },
    sessiontopic: { type: String, trim: true },
    sessiondate: { type: String, trim: true },
    honorarium: { type: Number, default: 0 },
    remarks: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.models.trainingplacementguestfacultyds || mongoose.model("trainingplacementguestfacultyds", trainingPlacementGuestFacultySchema);
