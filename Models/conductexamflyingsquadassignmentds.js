const mongoose = require("mongoose");

const conductExamFlyingSquadAssignmentSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    squadid: { type: String, trim: true, required: true, index: true },
    squadname: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    exam: { type: String, trim: true },
    examcode: { type: String, trim: true },
    allocationid: { type: String, trim: true, index: true },
    examdate: { type: String, trim: true },
    slot: { type: String, trim: true },
    campus: { type: String, trim: true },
    building: { type: String, trim: true },
    room: { type: String, trim: true },
    remarks: { type: String, trim: true },
    status: { type: String, trim: true, default: "Assigned" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

conductExamFlyingSquadAssignmentSchema.index({ colid: 1, squadid: 1, allocationid: 1 }, { unique: true });

module.exports = mongoose.models.conductexamflyingsquadassignmentds || mongoose.model("conductexamflyingsquadassignmentds", conductExamFlyingSquadAssignmentSchema);
