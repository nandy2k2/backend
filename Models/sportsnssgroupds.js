const mongoose = require("mongoose");

const sportsNssGroupSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  activityid: { type: mongoose.Schema.Types.ObjectId, ref: "sportsnssactivityds", required: true },
  activity: { type: String },
  activitytype: { type: String },
  groupname: { type: String, required: true },
  description: { type: String },
  startdate: { type: Date },
  enddate: { type: Date },
  status: { type: String, default: "Active" },
  createdby: { type: String },
  createdbyemail: { type: String }
}, { timestamps: true });

sportsNssGroupSchema.index({ colid: 1, activityid: 1, groupname: 1 }, { unique: true });

module.exports = mongoose.model("sportsnssgroupds", sportsNssGroupSchema);
