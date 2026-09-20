const mongoose = require("mongoose");

const placementNewInternshipScheduleSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, index: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true, index: true },
    poolid: { type: String, trim: true },
    title: { type: String, trim: true },
    companyname: { type: String, trim: true },
    schedule: { type: String, trim: true },
    startdate: { type: String, trim: true },
    enddate: { type: String, trim: true },
    location: { type: String, trim: true },
    coordinator: { type: String, trim: true },
    coordinatoremail: { type: String, trim: true },
    description: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewInternshipScheduleSchema.index({ colid: 1, academicyear: 1, programcode: 1 });

module.exports = mongoose.models.placementnewinternshipscheduleds || mongoose.model("placementnewinternshipscheduleds", placementNewInternshipScheduleSchema);
