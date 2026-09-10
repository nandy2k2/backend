const mongoose = require("mongoose");

const conductExamCoordinatorSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, required: true, trim: true },
  program: { type: String, required: true, trim: true },
  programcode: { type: String, required: true, trim: true },
  facultyname: { type: String, required: true, trim: true },
  facultyemail: { type: String, required: true, trim: true },
  status: { type: String, trim: true, default: "Active" },
  name: { type: String, trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });

conductExamCoordinatorSchema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  programcode: 1,
  facultyemail: 1
}, { unique: true });

module.exports = mongoose.model("conductexamcoordinatords", conductExamCoordinatorSchema);
