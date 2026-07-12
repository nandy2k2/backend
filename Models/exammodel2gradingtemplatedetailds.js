const mongoose = require("mongoose");

const examModel2GradingTemplateDetailSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    templatename: { type: String, trim: true },
    templateid: { type: String, trim: true, required: true, index: true },
    frommarks: { type: Number, default: 0 },
    tomarks: { type: Number, default: 0 },
    gradepoint: { type: Number, default: 0 },
    grade: { type: String, trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("exammodel2gradingtemplatedetailds", examModel2GradingTemplateDetailSchema);
