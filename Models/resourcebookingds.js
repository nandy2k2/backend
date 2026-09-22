const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    type: { type: String, trim: true, default: "Internal" }
  },
  { _id: false }
);

const resourceBookingSchema = new mongoose.Schema(
  {
    resourcetypeid: { type: String, trim: true, default: "" },
    resourcetype: { type: String, trim: true, default: "" },
    resourceobjectid: { type: String, trim: true, required: true, index: true },
    resourceid: { type: String, trim: true, default: "" },
    resourcename: { type: String, trim: true, default: "" },
    campus: { type: String, trim: true, default: "" },
    building: { type: String, trim: true, default: "" },
    floor: { type: String, trim: true, default: "" },
    starttime: { type: Date, required: true, index: true },
    endtime: { type: Date, required: true, index: true },
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: "" },
    participants: { type: [participantSchema], default: [] },
    emailconfigurationid: { type: String, trim: true, default: "" },
    emailconfiguration: { type: String, trim: true, default: "" },
    notifyparticipants: { type: String, trim: true, default: "No" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" },
    namecreated: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

resourceBookingSchema.index({ colid: 1, resourceobjectid: 1, starttime: 1, endtime: 1 });

module.exports = mongoose.model("resourcebookingds", resourceBookingSchema);
