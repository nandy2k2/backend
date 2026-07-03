const mongoose = require("mongoose");

const transportDriverSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    licenseno: { type: String, trim: true },
    licenseexpiry: { type: Date },
    address: { type: String },
    assignedvehicle: { type: String },
    emergencycontact: { type: String },
    status: { type: String, default: "Active" },
    user: { type: String }
  },
  { timestamps: true }
);

transportDriverSchema.index({ colid: 1, name: 1 });
transportDriverSchema.index({ colid: 1, email: 1 });

module.exports = mongoose.models.transportdriverds || mongoose.model("transportdriverds", transportDriverSchema);
