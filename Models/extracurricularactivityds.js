const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  activity: { type: String, trim: true, required: true },
  type: { type: String, trim: true, required: true },
  description: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true }
}, { timestamps: true });

schema.index({ colid: 1, activity: 1, type: 1 }, { unique: true });

module.exports = mongoose.models.extracurricularactivityds || mongoose.model("extracurricularactivityds", schema);
