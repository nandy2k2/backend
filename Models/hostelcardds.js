const mongoose = require("mongoose");

const hostelCardSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    assignmentid: { type: String },
    studentid: { type: String },
    student: { type: String, required: true },
    studentemail: { type: String },
    studentphone: { type: String },
    regno: { type: String },
    photo: { type: String },
    institution: { type: String },
    buildingname: { type: String },
    hosteltype: { type: String },
    guesttype: { type: String },
    block: { type: String },
    floor: { type: String },
    roomno: { type: String },
    roomtype: { type: String },
    bedno: { type: Number },
    program: { type: String },
    programcode: { type: String },
    templateid: { type: String },
    templatename: { type: String },
    html: { type: String },
    status: { type: String, default: "Active" },
    user: { type: String }
  },
  { timestamps: true }
);

hostelCardSchema.index({ colid: 1, regno: 1, buildingname: 1 });

module.exports = mongoose.models.hostelcardds || mongoose.model("hostelcardds", hostelCardSchema);
