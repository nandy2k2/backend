const mongoose = require("mongoose");

const sportsNssCoordinatorSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  activityid: { type: mongoose.Schema.Types.ObjectId, ref: "sportsnssactivityds", required: true },
  activity: { type: String },
  activitytype: { type: String },
  user: { type: String },
  useremail: { type: String, required: true },
  department: { type: String },
  designation: { type: String },
  startdate: { type: Date },
  enddate: { type: Date },
  default: { type: String, default: "No" },
  active: { type: String, default: "Yes" },
  namecreated: { type: String }
}, { timestamps: true });

sportsNssCoordinatorSchema.index({ colid: 1, activityid: 1, useremail: 1 }, { unique: true });

module.exports = mongoose.model("sportsnsscoordinatords", sportsNssCoordinatorSchema);
