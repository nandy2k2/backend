const mongoose = require("mongoose");

const lateFineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  user: { type: String, required: true },
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, trim: true },
  program: { type: String, trim: true },
  programcode: { type: String, required: true, trim: true },
  feeitem: { type: String, required: true, trim: true },
  latefineperday: { type: Number, default: 0 },
  maxamount: { type: Number, default: 0 },
  status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  comments: { type: String, trim: true },
  lastappliedat: { type: Date },
  lastappliedcount: { type: Number, default: 0 },
  lastappliedamount: { type: Number, default: 0 }
}, { timestamps: true });

lateFineSchema.index(
  { colid: 1, academicyear: 1, regulation: 1, programcode: 1, feeitem: 1 },
  { unique: true }
);

module.exports = mongoose.models.latefineds || mongoose.model("latefineds", lateFineSchema);
