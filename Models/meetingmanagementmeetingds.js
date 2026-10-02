const mongoose = require("mongoose");

const meetingManagementMeetingSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  title: { type: String, trim: true, required: true },
  agenda: { type: String, trim: true },
  discussion: { type: String, trim: true },
  meetingdate: { type: Date, index: true },
  userspresent: [{ type: String, trim: true }],
  userspresentemail: [{ type: String, trim: true }],
  domain: { type: String, trim: true, index: true },
  keywords: { type: String, trim: true },
  meetinglink: { type: String, trim: true },
  externalmembers: { type: String, trim: true },
  issues: { type: String, trim: true },
  documentlink: { type: String, trim: true },
  mode: { type: String, trim: true, enum: ["online", "offline", "Online", "Offline", ""], default: "online" },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model("meetingmanagementmeetingds", meetingManagementMeetingSchema);
