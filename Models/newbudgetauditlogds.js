const mongoose = require("mongoose");

const NewBudgetAuditLogSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  budgetitemid: { type: mongoose.Schema.Types.ObjectId, ref: "newbudgetitemds" },
  academicyear: String,
  department: String,
  category: String,
  categorytype: String,
  item: String,
  amount: Number,
  status: String,
  stage: String,
  level: Number,
  action: { type: String, required: true },
  olddata: mongoose.Schema.Types.Mixed,
  newdata: mongoose.Schema.Types.Mixed,
  comments: String,
  username: String,
  useremail: String,
  role: String,
  timeofactivity: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("newbudgetauditlogds", NewBudgetAuditLogSchema);
