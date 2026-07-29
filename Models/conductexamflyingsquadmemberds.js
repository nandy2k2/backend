const mongoose = require("mongoose");

const conductExamFlyingSquadMemberSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    squadid: { type: String, trim: true, required: true, index: true },
    squadname: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    exam: { type: String, trim: true },
    examcode: { type: String, trim: true },
    membername: { type: String, trim: true, required: true },
    memberemail: { type: String, trim: true, required: true },
    role: { type: String, trim: true, default: "Member" },
    phone: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

conductExamFlyingSquadMemberSchema.index({ colid: 1, squadid: 1, memberemail: 1 }, { unique: true });

module.exports = mongoose.models.conductexamflyingsquadmemberds || mongoose.model("conductexamflyingsquadmemberds", conductExamFlyingSquadMemberSchema);
