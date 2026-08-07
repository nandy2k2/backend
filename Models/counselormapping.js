const mongoose = require("mongoose");

const counselorMappingSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    counselorname: { type: String, trim: true, required: true },
    counseloremail: { type: String, trim: true, required: true },
    user: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" }
  },
  { timestamps: true }
);

counselorMappingSchema.index(
  { colid: 1, academicyear: 1, regulation: 1, programcode: 1, counseloremail: 1 },
  { unique: true }
);

module.exports = mongoose.model("counselormapping", counselorMappingSchema);
