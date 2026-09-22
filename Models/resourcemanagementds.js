const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema(
  {
    resourcetypeid: { type: String, trim: true, default: "" },
    resourcetype: { type: String, trim: true, required: true },
    resourcename: { type: String, trim: true, required: true },
    resourceid: { type: String, trim: true, required: true },
    campus: { type: String, trim: true, default: "" },
    building: { type: String, trim: true, default: "" },
    floor: { type: String, trim: true, default: "" },
    introductiondate: { type: String, trim: true, default: "" },
    retirementdate: { type: String, trim: true, default: "" },
    owner: { type: String, trim: true, default: "" },
    owneremail: { type: String, trim: true, default: "" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

resourceSchema.index({ colid: 1, resourcetype: 1, resourceid: 1 });

module.exports = mongoose.model("resourcemanagementds", resourceSchema);
