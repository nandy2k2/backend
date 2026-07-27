const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    groupid: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    groupname: { type: String, trim: true },
    faculty: { type: String, trim: true },
    facultyemail: { type: String, trim: true, index: true },
    status: { type: String, default: "Active", trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

schema.index({ colid: 1, groupid: 1, facultyemail: 1 }, { unique: true });

module.exports = mongoose.model("neplmsenrollmentworkloadds", schema);
