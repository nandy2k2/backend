const mongoose = require("mongoose");

const crmTelecallerMappingSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    telecallername: { type: String, trim: true },
    telecalleremail: { type: String, trim: true, index: true },
    type: { type: String, trim: true, enum: ["Telecaller", "Campus Visit Counselor"], default: "Telecaller" },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

crmTelecallerMappingSchema.index({ colid: 1, academicyear: 1, programcode: 1, telecalleremail: 1, type: 1 }, { unique: true });

module.exports = mongoose.models.crmtelecallermappingds || mongoose.model("crmtelecallermappingds", crmTelecallerMappingSchema);
