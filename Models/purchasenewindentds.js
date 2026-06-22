const mongoose = require("mongoose");

const purchaseNewIndentSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  department: { type: String, required: true },
  category: { type: String, required: true },
  categorytype: { type: String },
  item: { type: String, required: true },
  description: { type: String },
  quantity: { type: Number, default: 0 },
  approximatevalue: { type: Number, default: 0 },
  approximatetotalcost: { type: Number, default: 0 },
  status: { type: String, default: "Draft" },
  stage: { type: String, default: "Draft" },
  procurementstatus: { type: String, default: "Pending RFP" },
  rfpid: { type: String },
  currentlevel: { type: Number, default: 0 },
  submittedby: { type: String },
  submittedbyname: { type: String },
  submittedrole: { type: String },
  rejectedreason: { type: String },
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

module.exports = mongoose.model("purchasenewindentds", purchaseNewIndentSchema);
