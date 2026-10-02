const mongoose = require("mongoose");

const meetingManagementTaskSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  meetingid: { type: mongoose.Schema.Types.ObjectId, ref: "meetingmanagementmeetingds", index: true },
  meeting: { type: String, trim: true },
  domain: { type: String, trim: true, index: true },
  meetingdate: { type: Date, index: true },
  task: { type: String, trim: true, required: true },
  description: { type: String, trim: true },
  duedate: { type: Date, index: true },
  status: { type: String, trim: true, enum: ["Pending", "Closed", "Open", ""], default: "Open", index: true },
  assignedto: [{ type: String, trim: true }],
  assignedtoemail: [{ type: String, trim: true, index: true }],
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model("meetingmanagementtaskds", meetingManagementTaskSchema);
