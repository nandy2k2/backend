const mongoose = require("mongoose");

const activityUserPointsSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true },
    user: { type: String, trim: true },
    useremail: { type: String, required: true, trim: true, index: true },
    role: { type: String, trim: true },
    activity: { type: String, required: true, trim: true, index: true },
    date: { type: String, trim: true },
    points: { type: Number, default: 0 },
    source: { type: String, trim: true },
    sourceid: { type: String, trim: true },
    status: { type: String, default: "Active", trim: true }
  },
  { timestamps: true }
);

activityUserPointsSchema.index({ colid: 1, useremail: 1, activity: 1, date: 1, sourceid: 1 }, { unique: true });

module.exports = mongoose.model("activityuserpointsds", activityUserPointsSchema);
