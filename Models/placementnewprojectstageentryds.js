const mongoose = require("mongoose");

const placementNewProjectStageEntrySchema = new mongoose.Schema(
  {
    assignmentid: { type: String, trim: true, index: true },
    stageid: { type: String, trim: true, index: true },
    stagename: { type: String, trim: true },
    details: { type: String, trim: true },
    filelink: { type: String, trim: true },
    remarks: { type: String, trim: true },
    entrydate: { type: String, trim: true },
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true },
    regno: { type: String, trim: true },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.models.placementnewprojectstageentryds || mongoose.model("placementnewprojectstageentryds", placementNewProjectStageEntrySchema);
