const mongoose = require("mongoose");

const userLocationSchema = new mongoose.Schema(
  {
    userid: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    user: { type: String, trim: true },
    useremail: { type: String, trim: true, index: true },
    role: { type: String, trim: true },
    city: { type: String, trim: true },
    country: { type: String, trim: true },
    latitude: { type: Number },
    longitude: { type: Number },
    lattitude: { type: Number },
    published: { type: String, trim: true, default: "Yes" },
    colid: { type: Number, required: true, index: true },
    updatedby: { type: String, trim: true }
  },
  { timestamps: true }
);

userLocationSchema.index({ colid: 1, role: 1, city: 1, country: 1 });
userLocationSchema.index({ colid: 1, useremail: 1 }, { unique: true });

module.exports = mongoose.model("userlocationds", userLocationSchema);
