const mongoose = require("mongoose");

const conductExamModeratorPanelSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, required: true, trim: true },
  program: { type: String, required: true, trim: true },
  programcode: { type: String, required: true, trim: true },
  panelname: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" },
  name: { type: String, trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });

conductExamModeratorPanelSchema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  programcode: 1,
  panelname: 1
}, { unique: true });

module.exports = mongoose.model("conductexammoderatorpanelds", conductExamModeratorPanelSchema);
