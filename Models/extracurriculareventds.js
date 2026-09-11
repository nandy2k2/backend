const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  activityid: { type: mongoose.Schema.Types.ObjectId, ref: "extracurricularactivityds", required: true, index: true },
  activity: { type: String, trim: true },
  activitytype: { type: String, trim: true },
  event: { type: String, trim: true, required: true },
  eventdescription: { type: String, trim: true },
  objective: { type: String, trim: true },
  agenda: { type: String, trim: true },
  description: { type: String, trim: true },
  activitydetails: { type: String, trim: true },
  report: { type: String, trim: true },
  reportlink: { type: String, trim: true },
  startdate: { type: Date },
  enddate: { type: Date },
  guests: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" },
  createdby: { type: String, trim: true },
  createdbyemail: { type: String, trim: true, index: true }
}, { timestamps: true });

module.exports = mongoose.models.extracurriculareventds || mongoose.model("extracurriculareventds", schema);
