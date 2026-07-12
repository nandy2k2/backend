const mongoose = require("mongoose");

const examModel2GradingTemplateSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    templatedescription: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("exammodel2gradingtemplateds", examModel2GradingTemplateSchema);
