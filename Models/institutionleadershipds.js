const mongoose = require("mongoose");

const institutionLeadershipSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    institution: { type: String, trim: true, required: true, index: true },
    institutioncode: { type: String, trim: true },
    userid: { type: String, trim: true },
    user: { type: String, trim: true },
    useremail: { type: String, trim: true, required: true, index: true },
    name: { type: String, trim: true },
    leadershiprole: { type: String, trim: true },
    governingbodymember: { type: String, trim: true, default: "No" },
    appointmentdate: { type: Date },
    retirementdate: { type: Date },
    status: { type: String, trim: true, default: "Active" },
    createdby: { type: String, trim: true }
  },
  { timestamps: true }
);

institutionLeadershipSchema.index({ colid: 1, institution: 1, useremail: 1, leadershiprole: 1 }, { unique: true });

module.exports = mongoose.models.institutionleadershipds || mongoose.model("institutionleadershipds", institutionLeadershipSchema);
