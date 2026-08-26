const mongoose = require("mongoose");

const mouActivitySchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  mouid: { type: mongoose.Schema.Types.ObjectId, ref: "institutionmouds", index: true },
  mou: { type: String, trim: true },
  academicyear: { type: String, trim: true, index: true },
  activity: { type: String, trim: true },
  activitydate: { type: Date },
  description: { type: String, trim: true },
  filelink: { type: String, trim: true },
  brochurelink: { type: String, trim: true },
  reportlink: { type: String, trim: true },
  guest: { type: String, trim: true },
  location: { type: String, trim: true },
  attendancelist: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.models.institutionmouactivityds || mongoose.model("institutionmouactivityds", mouActivitySchema);
