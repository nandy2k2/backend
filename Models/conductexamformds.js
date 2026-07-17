const mongoose = require("mongoose");

const examFormFieldSchema = new mongoose.Schema(
  {
    fieldname: { type: String, trim: true, required: true },
    label: { type: String, trim: true, required: true },
    fieldtype: { type: String, trim: true, default: "Text" },
    required: { type: String, trim: true, default: "No" },
    options: { type: String, trim: true, default: "" },
    order: { type: Number, default: 0 }
  },
  { _id: true }
);

const examFormTabSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    order: { type: Number, default: 0 },
    fields: [examFormFieldSchema]
  },
  { _id: true }
);

const examFormDocumentSchema = new mongoose.Schema(
  {
    documenttype: { type: String, trim: true, required: true },
    required: { type: String, trim: true, default: "No" },
    order: { type: Number, default: 0 }
  },
  { _id: true }
);

const conductExamFormSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    formname: { type: String, required: true, trim: true },
    formid: { type: String, required: true, trim: true, index: true },
    academicyear: { type: String, required: true, trim: true },
    program: { type: String, required: true, trim: true },
    programcode: { type: String, required: true, trim: true },
    examtype: { type: String, enum: ["Regular", "Supplementary"], required: true },
    status: { type: String, trim: true, default: "Active" },
    instructions: { type: String, trim: true, default: "" },
    mandatorycriteria: { type: String, trim: true, default: "" },
    validationcriteria: { type: String, trim: true, default: "" },
    tabs: [examFormTabSchema],
    documents: [examFormDocumentSchema],
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

conductExamFormSchema.index({ colid: 1, formid: 1 }, { unique: true });

module.exports = mongoose.model("conductexamformds", conductExamFormSchema);
