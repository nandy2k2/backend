const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    section: { type: String, trim: true },
    groupname: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, default: "Active", trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

schema.index({ colid: 1, groupname: 1 }, { unique: true });

module.exports = mongoose.model("neplmsenrollmentgroupds", schema);
