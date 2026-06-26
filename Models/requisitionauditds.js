const mongoose = require("mongoose");

const requisitionAuditSchema = new mongoose.Schema({
  colid: { type: Number, index: true },
  requisitionid: { type: mongoose.Schema.Types.ObjectId, ref: "newrequisitionds" },
  department: { type: String, trim: true },
  store: { type: String, trim: true },
  category: { type: String, trim: true },
  item: { type: String, trim: true },
  action: { type: String, trim: true },
  status: { type: String, trim: true },
  stage: { type: String, trim: true },
  level: { type: Number },
  comments: { type: String, trim: true },
  username: { type: String, trim: true },
  useremail: { type: String, trim: true },
  role: { type: String, trim: true },
  olddata: mongoose.Schema.Types.Mixed,
  newdata: mongoose.Schema.Types.Mixed,
  timeofactivity: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.models.newrequisitionauditds
  || mongoose.model("newrequisitionauditds", requisitionAuditSchema, "newrequisitionauditds");
