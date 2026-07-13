const mongoose = require("mongoose");

const assetNewTrackingSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: "assetnewitemds", index: true },
  assetid: { type: String, required: true, trim: true, index: true },
  itemmasterid: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewitemmasterds" },
  requisitionid: { type: mongoose.Schema.Types.ObjectId, ref: "newrequisitionds" },
  store: { type: String, trim: true },
  category: { type: String, trim: true },
  item: { type: String, trim: true },
  description: { type: String, trim: true },
  action: { type: String, default: "Assignment", trim: true },
  assignmentdate: { type: Date, default: Date.now },
  fromname: { type: String, trim: true },
  fromemail: { type: String, trim: true },
  toname: { type: String, trim: true },
  toemail: { type: String, trim: true },
  department: { type: String, trim: true },
  penaltytype: { type: String, trim: true },
  penaltyamount: { type: Number, default: 0 },
  agreementtext: { type: String, trim: true },
  remarks: { type: String, trim: true },
  createdby: { type: String, trim: true },
  createdbyname: { type: String, trim: true }
}, { timestamps: true });

assetNewTrackingSchema.index({ colid: 1, assignmentdate: -1 });

module.exports = mongoose.models.assetnewtrackingds
  || mongoose.model("assetnewtrackingds", assetNewTrackingSchema, "assetnewtrackingds");
