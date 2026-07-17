const mongoose = require("mongoose");

const programwiseaccessschema = new mongoose.Schema(
  {
    colid: {
      type: Number,
      required: [true, "Please enter colid"],
      index: true
    },
    username: {
      type: String,
      trim: true
    },
    useremail: {
      type: String,
      required: [true, "Please enter user email"],
      trim: true,
      index: true
    },
    userid: {
      type: String,
      trim: true
    },
    program: {
      type: String,
      trim: true
    },
    programcode: {
      type: String,
      required: [true, "Please enter program code"],
      trim: true,
      index: true
    },
    department: {
      type: String,
      trim: true
    },
    createdby: {
      type: String,
      trim: true
    },
    user: {
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

programwiseaccessschema.index({ colid: 1, useremail: 1, programcode: 1 }, { unique: true });

module.exports =
  mongoose.models.programwiseaccessds || mongoose.model("programwiseaccessds", programwiseaccessschema);
