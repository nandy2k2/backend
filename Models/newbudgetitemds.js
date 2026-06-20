const mongoose = require("mongoose");

const NewBudgetItemSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  academicyear: { type: String, required: true },
  department: { type: String, required: true },
  category: { type: String, required: true },
  categorytype: { type: String },
  item: { type: String, required: true },
  amount: { type: Number, default: 0 },
  utilized: { type: Number, default: 0 },
  remaining: { type: Number, default: 0 },
  status: { type: String, default: "Draft" },
  stage: { type: String, default: "Draft" },
  currentlevel: { type: Number, default: 0 },
  submittedby: { type: String },
  submittedbyname: { type: String },
  submittedrole: { type: String },
  remarks: { type: String },
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
    amount: Number,
    time: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model("newbudgetitemds", NewBudgetItemSchema);
