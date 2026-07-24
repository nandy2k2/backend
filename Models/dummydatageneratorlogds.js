const mongoose = require("mongoose");

const dummyDataGeneratorLogSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, trim: true },
  generatedby: { type: String, trim: true },
  generatedbyname: { type: String, trim: true },
  count: { type: Number, default: 0 },
  rerun: { type: String, default: "No" },
  summary: { type: Array, default: [] }
}, { timestamps: true });

dummyDataGeneratorLogSchema.index({ colid: 1 });

module.exports = mongoose.model("dummydatageneratorlogds", dummyDataGeneratorLogSchema);
