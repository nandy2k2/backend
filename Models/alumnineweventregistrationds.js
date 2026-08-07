const mongoose = require("mongoose");

const alumniNewEventRegistrationSchema = new mongoose.Schema(
  {
    colid: { type: Number, index: true },
    eventid: { type: String, trim: true, index: true },
    eventtitle: { type: String, trim: true },
    alumniemail: { type: String, trim: true, index: true },
    alumniname: { type: String, trim: true },
    phone: { type: String, trim: true },
    status: { type: String, trim: true, default: "Registered" },
    registeredat: { type: Date, default: Date.now },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

alumniNewEventRegistrationSchema.index({ colid: 1, eventid: 1, alumniemail: 1 }, { unique: true });

module.exports = mongoose.model("alumnineweventregistrationds", alumniNewEventRegistrationSchema);
