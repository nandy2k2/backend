const mongoose = require("mongoose");

const placementNewPlacementStageSchema = new mongoose.Schema(
  {
    stagename: { type: String, trim: true, required: true },
    stageorder: { type: Number, default: 1 },
    description: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewPlacementStageSchema.index({ colid: 1, stagename: 1 }, { unique: true });

module.exports = mongoose.models.placementnewplacementstageds || mongoose.model("placementnewplacementstageds", placementNewPlacementStageSchema);
