const mongoose = require("mongoose");

const designationWorkloadHoursSchema = new mongoose.Schema(
  {
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    designations: [{ type: String, trim: true }],
    designation: { type: String, trim: true, default: "" },
    workloadhours: { type: Number, default: 0 },
    status: { type: String, trim: true, enum: ["Active", "Inactive"], default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

designationWorkloadHoursSchema.index({ colid: 1, programcode: 1, designation: 1 });

module.exports = mongoose.model("designationworkloadhoursds", designationWorkloadHoursSchema);
