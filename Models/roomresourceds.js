const mongoose = require("mongoose");

const roomResourceSchema = new mongoose.Schema(
  {
    campus: { type: String, trim: true, required: true },
    building: { type: String, trim: true, required: true },
    floor: { type: String, trim: true, required: true },
    roomno: { type: String, trim: true, required: true },
    capacity: { type: Number, default: 0 },
    examcapacity: { type: Number, default: 0 },
    type: { type: String, trim: true, default: "Classroom" },
    labcourse: { type: String, trim: true, default: "" },
    labcoursecode: { type: String, trim: true, default: "" },
    roomownername: { type: String, trim: true, default: "" },
    roomowneremail: { type: String, trim: true, default: "" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

roomResourceSchema.index({ colid: 1, campus: 1, building: 1, floor: 1, roomno: 1 });

module.exports = mongoose.model("roomresourceds", roomResourceSchema);
