const mongoose = require("mongoose");

const activityPointConfigSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    role: { type: String, required: true, trim: true },
    activity: { type: String, required: true, trim: true },
    points: { type: Number, default: 0 },
    status: { type: String, default: "Active", trim: true },
    user: { type: String, trim: true },
    name: { type: String, trim: true }
  },
  { timestamps: true }
);

activityPointConfigSchema.index({ colid: 1, role: 1, activity: 1 }, { unique: true });

module.exports = mongoose.model("activitypointconfigds", activityPointConfigSchema);
