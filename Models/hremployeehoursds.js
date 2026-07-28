const mongoose = require("mongoose");

const hrEmployeeHoursSchema = new mongoose.Schema(
  {
    employee: { type: String, trim: true, required: true },
    employeeemail: { type: String, trim: true, required: true, index: true },
    noofhours: { type: Number, default: 8 },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrEmployeeHoursSchema.index({ colid: 1, employeeemail: 1 }, { unique: true });

module.exports = mongoose.model("hremployeehoursds", hrEmployeeHoursSchema);
