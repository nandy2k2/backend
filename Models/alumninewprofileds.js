const mongoose = require("mongoose");

const alumniNewProfileSchema = new mongoose.Schema(
  {
    colid: { type: Number, index: true },
    userid: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    useremail: { type: String, trim: true, index: true },
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    photo: { type: String, trim: true },
    company: { type: String, trim: true },
    designation: { type: String, trim: true },
    sector: { type: String, trim: true },
    industry: { type: String, trim: true },
    city: { type: String, trim: true },
    country: { type: String, trim: true },
    latitude: { type: Number },
    longitude: { type: Number },
    linkedin: { type: String, trim: true },
    website: { type: String, trim: true },
    skills: { type: String, trim: true },
    professionalsummary: { type: String, trim: true },
    currentstatus: { type: String, trim: true, default: "Active" },
    allowsearch: { type: String, trim: true, default: "Yes" },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

alumniNewProfileSchema.index({ colid: 1, useremail: 1 }, { unique: true });
alumniNewProfileSchema.index({ colid: 1, company: 1, sector: 1, city: 1, country: 1 });

module.exports = mongoose.model("alumninewprofileds", alumniNewProfileSchema);
