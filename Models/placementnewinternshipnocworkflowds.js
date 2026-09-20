const mongoose = require("mongoose");

const placementNewInternshipNocWorkflowSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, index: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true, index: true },
    level: { type: Number, default: 1 },
    approvername: { type: String, trim: true },
    approveremail: { type: String, trim: true, index: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

placementNewInternshipNocWorkflowSchema.index({ colid: 1, academicyear: 1, programcode: 1, level: 1 });

module.exports = mongoose.models.placementnewinternshipnocworkflowds || mongoose.model("placementnewinternshipnocworkflowds", placementNewInternshipNocWorkflowSchema);
