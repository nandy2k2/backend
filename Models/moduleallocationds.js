const mongoose = require("mongoose");

const moduleAllocationSchema = new mongoose.Schema(
  {
    order: { type: Number, default: 0 },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    course: { type: String, trim: true, required: true },
    coursecode: { type: String, trim: true, required: true },
    facultyname: { type: String, trim: true, required: true },
    facultyemail: { type: String, trim: true, required: true },
    facultydepartment: { type: String, trim: true },
    modules: [{ type: String, trim: true }],
    topics: [{ type: String, trim: true }],
    module: { type: String, trim: true },
    topic: { type: String, trim: true },
    weightage: { type: Number, default: 0 },
    refbook: { type: String, trim: true },
    description: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    workloadid: { type: mongoose.Schema.Types.ObjectId, ref: "workloadassignmentds" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true },
    name: { type: String, trim: true }
  },
  { timestamps: true }
);

moduleAllocationSchema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  programcode: 1,
  coursecode: 1,
  facultyemail: 1
});

module.exports = mongoose.models.moduleallocationds || mongoose.model("moduleallocationds", moduleAllocationSchema);
