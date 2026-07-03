const mongoose = require("mongoose");

const hostelBedRequestSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    buildingid: { type: mongoose.Schema.Types.ObjectId, ref: "hostelbuildingmapds" },
    roomid: { type: mongoose.Schema.Types.ObjectId, ref: "hostelroommapds" },
    buildingname: { type: String, trim: true },
    hosteltype: { type: String, trim: true },
    guesttype: { type: String, trim: true },
    block: { type: String, trim: true },
    floor: { type: String, trim: true },
    roomno: { type: String, trim: true },
    roomtype: { type: String, trim: true },
    residenttype: { type: String, trim: true },
    bedno: { type: Number, required: true },
    studentid: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true },
    studentphone: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    regno: { type: String, trim: true },
    status: { type: String, default: "Pending", index: true },
    applieddate: { type: Date, default: Date.now },
    approveddate: { type: Date },
    approvedby: { type: String },
    approvedbyname: { type: String },
    comments: { type: String },
    assignmentid: { type: String },
    user: { type: String }
  },
  { timestamps: true }
);

hostelBedRequestSchema.index({ colid: 1, studentemail: 1, status: 1 });
hostelBedRequestSchema.index({ colid: 1, roomid: 1, bedno: 1, status: 1 });

module.exports = mongoose.models.hostelbedrequestds || mongoose.model("hostelbedrequestds", hostelBedRequestSchema);
