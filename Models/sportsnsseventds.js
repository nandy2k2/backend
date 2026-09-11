const mongoose = require("mongoose");

const sportsNssEventSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  activityid: { type: mongoose.Schema.Types.ObjectId, ref: "sportsnssactivityds" },
  groupid: { type: mongoose.Schema.Types.ObjectId, ref: "sportsnssgroupds", required: true },
  activity: { type: String },
  activitytype: { type: String },
  groupname: { type: String },
  event: { type: String, required: true },
  eventdescription: { type: String },
  objective: { type: String },
  agenda: { type: String },
  description: { type: String },
  activitydetails: { type: String },
  report: { type: String },
  reportlink: { type: String },
  photos: [{ title: String, link: String }],
  startdate: { type: Date },
  enddate: { type: Date },
  location: { type: String },
  guests: { type: String },
  status: { type: String, default: "Active" },
  createdby: { type: String },
  createdbyemail: { type: String }
}, { timestamps: true });

sportsNssEventSchema.index({ colid: 1, groupid: 1, event: 1, startdate: 1 });

module.exports = mongoose.model("sportsnsseventds", sportsNssEventSchema);
