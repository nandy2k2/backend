const mongoose = require("mongoose");

const mindMapSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: "" },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, default: "" },
    programcode: { type: String, trim: true, required: true },
    type: { type: String, trim: true, default: "" },
    subject: { type: String, trim: true, default: "" },
    semester: { type: String, trim: true, required: true },
    course: { type: String, trim: true, required: true },
    coursecode: { type: String, trim: true, required: true },
    classid: { type: String, trim: true, default: "" },
    classdate: { type: String, trim: true, default: "" },
    classtime: { type: String, trim: true, default: "" },
    faculty: { type: String, trim: true, default: "" },
    facultyemail: { type: String, trim: true, required: true },
    nodes: { type: Array, default: [] },
    edges: { type: Array, default: [] },
    status: { type: String, trim: true, default: "Draft" },
    published: { type: String, trim: true, default: "No" },
    publisheddate: { type: Date },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

mindMapSchema.index({ colid: 1, academicyear: 1, programcode: 1, semester: 1, coursecode: 1, facultyemail: 1 });
mindMapSchema.index({ colid: 1, published: 1, academicyear: 1, programcode: 1, semester: 1, coursecode: 1 });

module.exports = mongoose.model("neplmsmindmapds", mindMapSchema);
