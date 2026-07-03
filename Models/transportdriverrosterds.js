const mongoose = require("mongoose");

const transportDriverRosterSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    driverid: { type: String },
    drivername: { type: String, required: true, trim: true },
    driveremail: { type: String, trim: true },
    vehicle: { type: String, trim: true },
    vehicleno: { type: String, trim: true },
    route: { type: String, trim: true },
    dutytype: { type: String, default: "Regular" },
    startdatetime: { type: Date, required: true },
    enddatetime: { type: Date, required: true },
    notes: { type: String },
    status: { type: String, default: "Scheduled" },
    user: { type: String }
  },
  { timestamps: true }
);

transportDriverRosterSchema.index({ colid: 1, startdatetime: 1 });
transportDriverRosterSchema.index({ colid: 1, drivername: 1 });
transportDriverRosterSchema.index({ colid: 1, vehicleno: 1 });

module.exports = mongoose.models.transportdriverrosterds || mongoose.model("transportdriverrosterds", transportDriverRosterSchema);
