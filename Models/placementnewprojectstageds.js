const mongoose = require("mongoose");

const placementNewProjectStageSchema = new mongoose.Schema(
  {
    assignmentid: { type: String, trim: true, index: true },
    stagename: { type: String, trim: true, required: true },
    stageorder: { type: Number, default: 0 },
    description: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.models.placementnewprojectstageds || mongoose.model("placementnewprojectstageds", placementNewProjectStageSchema);
