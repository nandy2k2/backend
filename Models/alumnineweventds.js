const mongoose = require("mongoose");

const alumniNewEventSchema = new mongoose.Schema(
  {
    colid: { type: Number, index: true },
    title: { type: String, trim: true },
    description: { type: String, trim: true },
    eventdate: { type: String, trim: true },
    starttime: { type: String, trim: true },
    venue: { type: String, trim: true },
    city: { type: String, trim: true },
    country: { type: String, trim: true },
    registrationstart: { type: String, trim: true },
    registrationend: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    createdby: { type: String, trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

alumniNewEventSchema.index({ colid: 1, eventdate: 1, status: 1 });

module.exports = mongoose.model("alumnineweventds", alumniNewEventSchema);
