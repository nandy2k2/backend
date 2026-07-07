const mongoose = require("mongoose");

const accreditationStatusSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true },
    accreditation: {
      type: String,
      trim: true,
      enum: ["NAAC", "NBA", "NIRF", "QS", "THE", "Times Ranking"],
      required: true
    },
    institution: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    startdate: { type: Date },
    validitydate: { type: Date },
    grade: { type: String, trim: true },
    name: { type: String, trim: true },
    user: { type: String, trim: true },
    colid: { type: Number, required: true, index: true }
  },
  { timestamps: true }
);

accreditationStatusSchema.index({ colid: 1, academicyear: 1, accreditation: 1, programcode: 1 });

module.exports = mongoose.model("accreditationstatusds", accreditationStatusSchema);
