const mongoose = require("mongoose");

const facultyAvailabilitySchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, default: "" },
    facultyname: { type: String, trim: true, required: true },
    facultyemail: { type: String, trim: true, required: true },
    dayofweek: { type: String, trim: true, required: true },
    availabilitydate: { type: String, trim: true, default: "" },
    dayofmonth: { type: Number },
    starttime: { type: String, trim: true, required: true },
    endtime: { type: String, trim: true, required: true },
    reason: { type: String, trim: true, default: "" },
    remarks: { type: String, trim: true, default: "" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

facultyAvailabilitySchema.index({ colid: 1, facultyemail: 1, dayofweek: 1, starttime: 1 });

module.exports = mongoose.model("facultyavailabilityds", facultyAvailabilitySchema);
