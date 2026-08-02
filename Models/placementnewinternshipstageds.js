const mongoose = require("mongoose");

const placementNewInternshipStageSchema = new mongoose.Schema(
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

placementNewInternshipStageSchema.index({ colid: 1, stagename: 1 }, { unique: true });

module.exports = mongoose.models.placementnewinternshipstageds || mongoose.model("placementnewinternshipstageds", placementNewInternshipStageSchema);
