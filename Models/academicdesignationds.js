const mongoose = require("mongoose");

const academicDesignationSchema = new mongoose.Schema(
  {
    designation: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, enum: ["Active", "Inactive"], default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

academicDesignationSchema.index({ colid: 1, designation: 1 }, { unique: true });

module.exports = mongoose.model("academicdesignationds", academicDesignationSchema);
