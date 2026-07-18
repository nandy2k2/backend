const mongoose = require("mongoose");

const hrLeaveTypeSchema = new mongoose.Schema(
  {
    leavetype: { type: String, trim: true, required: true },
    leavetypecategory: { type: String, trim: true, enum: ["EL", "Non EL"], default: "Non EL" },
    code: { type: String, trim: true },
    description: { type: String, trim: true },
    roles: { type: String, trim: true, default: "All" },
    annualquota: { type: Number, default: 0 },
    documentrequired: { type: String, trim: true, default: "No" },
    carryforwardcriteria: { type: String, trim: true, default: "None" },
    carryforwardmaxdays: { type: Number, default: 0 },
    carryforwardpercentage: { type: Number, default: 0 },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrLeaveTypeSchema.index({ colid: 1, leavetype: 1 }, { unique: true });

module.exports = mongoose.model("hrleavetypeds", hrLeaveTypeSchema);
