const mongoose = require("mongoose");

const transportBusPassSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    studentid: { type: String },
    student: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    regno: { type: String, required: true },
    photo: { type: String },
    institution: { type: String },
    routeid: { type: String },
    routename: { type: String },
    routecode: { type: String },
    semester: { type: String },
    section: { type: String },
    startdate: { type: Date, required: true },
    enddate: { type: Date, required: true },
    templateid: { type: String },
    templatename: { type: String },
    html: { type: String },
    status: { type: String, default: "Active" },
    user: { type: String }
  },
  { timestamps: true }
);

transportBusPassSchema.index({ colid: 1, regno: 1, startdate: 1 });

module.exports = mongoose.models.transportbuspassds || mongoose.model("transportbuspassds", transportBusPassSchema);
