const mongoose = require("mongoose");

const departmentindentdsschema = new mongoose.Schema({
  name: { type: String, required: true },
  user: { type: String, required: true },
  colid: { type: Number, required: true },
  departmentname: { type: String, trim: true },
  creatorname: { type: String, trim: true },
  creatoruserid: { type: String, trim: true },
  hoiapprovername: { type: String, trim: true },
  hoiapproveruserid: { type: String, trim: true },
  ahoiapprovername: { type: String, trim: true },
  ahoiapproveruserid: { type: String, trim: true },
  institution: { type: String, trim: true },
  institutionshort: { type: String, trim: true },
  isfrozen: { type: Boolean, default: false },
  status: { type: String, trim: true },
  remarks: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model("departmentindentds", departmentindentdsschema);
