const mongoose = require("mongoose");

const rawDataManagementSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    year: { type: String, trim: true, default: "" },
    sourcename: { type: String, trim: true, required: true },
    status: { type: String, trim: true, default: "New", index: true },
    employee: { type: String, trim: true, default: "" },
    employeeemail: { type: String, trim: true, default: "", index: true },
    name: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    category: { type: String, trim: true, default: "NA" },
    course_interested: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, default: "" },
    programcode: { type: String, trim: true, default: "" },
    program_type: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },
    comments: { type: String, trim: true, default: "" },
    rawpayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    crmleadid: { type: String, trim: true, default: "" },
    crmcopiedat: { type: Date },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

rawDataManagementSchema.index({ colid: 1, sourcename: 1, status: 1 });
rawDataManagementSchema.index({ colid: 1, phone: 1, email: 1 });

module.exports = mongoose.model("rawdatamanagementds", rawDataManagementSchema);
