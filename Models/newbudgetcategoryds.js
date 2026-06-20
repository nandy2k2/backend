const mongoose = require("mongoose");

const NewBudgetCategorySchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  category: { type: String, required: true },
  type: { type: String, required: true },
  active: { type: String, default: "Yes" },
  description: { type: String },
  user: { type: String }
}, { timestamps: true });

module.exports = mongoose.model("newbudgetcategoryds", NewBudgetCategorySchema);
