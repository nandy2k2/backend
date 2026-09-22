const mongoose = require("mongoose");

const roomTimeOwnerSchema = new mongoose.Schema(
  {
    roomid: { type: String, trim: true, required: true, index: true },
    roomno: { type: String, trim: true, default: "" },
    campus: { type: String, trim: true, default: "" },
    building: { type: String, trim: true, default: "" },
    floor: { type: String, trim: true, default: "" },
    owner: { type: String, trim: true, default: "" },
    owneremail: { type: String, trim: true, default: "" },
    fromtime: { type: String, trim: true, default: "" },
    totime: { type: String, trim: true, default: "" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

roomTimeOwnerSchema.index({ colid: 1, roomid: 1, fromtime: 1, totime: 1 });

module.exports = mongoose.model("roomtimeownerds", roomTimeOwnerSchema);
