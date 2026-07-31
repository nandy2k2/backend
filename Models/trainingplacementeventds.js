const mongoose = require("mongoose");

const trainingPlacementEventSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true },
    eventname: { type: String, trim: true, required: true },
    eventcode: { type: String, trim: true, required: true },
    eventtype: { type: String, trim: true },
    courseid: { type: mongoose.Schema.Types.ObjectId, ref: "trainingplacementcourseds" },
    coursecode: { type: String, trim: true },
    coursename: { type: String, trim: true },
    startdate: { type: String, trim: true },
    enddate: { type: String, trim: true },
    venue: { type: String, trim: true },
    mode: { type: String, enum: ["Offline", "Online", "Hybrid"], default: "Offline" },
    meetinglink: { type: String, trim: true },
    description: { type: String, trim: true },
    outcome: { type: String, trim: true },
    status: { type: String, trim: true, default: "Planned" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

trainingPlacementEventSchema.index({ colid: 1, eventcode: 1 }, { unique: true });

module.exports = mongoose.models.trainingplacementeventds || mongoose.model("trainingplacementeventds", trainingPlacementEventSchema);
