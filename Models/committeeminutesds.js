const mongoose = require("mongoose");

const attendeeSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, trim: true },
  role: { type: String, trim: true },
  department: { type: String, trim: true },
  designation: { type: String, trim: true }
}, { _id: false });

const committeeMinutesSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  committeeid: { type: String, trim: true, required: true, index: true },
  committeename: { type: String, trim: true },
  minutes: { type: String, trim: true },
  agenda: { type: String, trim: true },
  description: { type: String, trim: true },
  memberspresent: [attendeeSchema],
  discussion: { type: String, trim: true },
  actionitems: { type: String, trim: true },
  meetingdate: { type: Date, index: true },
  issues: { type: String, trim: true },
  filelink: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.models.committeeminutesds || mongoose.model("committeeminutesds", committeeMinutesSchema);
