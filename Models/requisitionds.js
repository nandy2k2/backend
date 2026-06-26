const mongoose = require("mongoose");

const requisitionSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  department: { type: String, trim: true },
  store: { type: String, required: true, trim: true },
  storedescription: { type: String, trim: true },
  itemmasterid: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewitemmasterds" },
  category: { type: String, trim: true },
  categorytype: { type: String, trim: true },
  item: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  unit: { type: String, trim: true },
  dimension: { type: String, trim: true },
  quantityavailableatrequest: { type: Number, default: 0 },
  requestedquantity: { type: Number, default: 0 },
  assignedquantity: { type: Number, default: 0 },
  assignmentstatus: { type: String, default: "Not Assigned", trim: true },
  assignmentdetails: { type: String, trim: true },
  assignmentdate: { type: Date },
  status: { type: String, default: "Draft", trim: true },
  stage: { type: String, default: "Draft", trim: true },
  currentlevel: { type: Number, default: 0 },
  submittedby: { type: String, trim: true },
  submittedbyname: { type: String, trim: true },
  submittedrole: { type: String, trim: true },
  rejectedreason: { type: String, trim: true },
  approvedat: { type: Date },
  history: [{
    action: String,
    stage: String,
    level: Number,
    username: String,
    useremail: String,
    role: String,
    comments: String,
    time: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.models.newrequisitionds
  || mongoose.model("newrequisitionds", requisitionSchema, "newrequisitionds");
