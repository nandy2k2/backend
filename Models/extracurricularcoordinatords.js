const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  activityid: { type: mongoose.Schema.Types.ObjectId, ref: "extracurricularactivityds", required: true, index: true },
  activity: { type: String, trim: true },
  activitytype: { type: String, trim: true },
  coordinatorrole: { type: String, trim: true, default: "Coordinator" },
  user: { type: String, trim: true },
  useremail: { type: String, trim: true, index: true },
  department: { type: String, trim: true },
  designation: { type: String, trim: true },
  default: { type: String, trim: true, default: "No" },
  active: { type: String, trim: true, default: "Yes" },
  createdby: { type: String, trim: true }
}, { timestamps: true });

schema.index({ colid: 1, activityid: 1, useremail: 1 }, { unique: true });

module.exports = mongoose.models.extracurricularcoordinatords || mongoose.model("extracurricularcoordinatords", schema);
