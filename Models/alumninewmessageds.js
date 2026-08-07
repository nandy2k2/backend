const mongoose = require("mongoose");

const alumniMessageSchema = new mongoose.Schema(
  {
    senderrole: { type: String, trim: true },
    senderemail: { type: String, trim: true },
    sendername: { type: String, trim: true },
    message: { type: String, trim: true },
    attachment: { type: String, trim: true },
    date: { type: Date, default: Date.now }
  },
  { _id: true }
);

const alumniNewMessageSchema = new mongoose.Schema(
  {
    colid: { type: Number, index: true },
    alumniemail: { type: String, trim: true, index: true },
    alumniname: { type: String, trim: true },
    studentemail: { type: String, trim: true, index: true },
    studentregno: { type: String, trim: true },
    studentname: { type: String, trim: true },
    subject: { type: String, trim: true },
    messages: [alumniMessageSchema],
    status: { type: String, trim: true, default: "Open" },
    lastmessageat: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

alumniNewMessageSchema.index({ colid: 1, alumniemail: 1, studentemail: 1 });

module.exports = mongoose.model("alumninewmessageds", alumniNewMessageSchema);
