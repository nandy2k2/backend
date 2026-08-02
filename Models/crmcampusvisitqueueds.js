const mongoose = require("mongoose");

const crmCampusVisitQueueSchema = new mongoose.Schema(
  {
    tokennumber: { type: String, trim: true, index: true },
    leadid: { type: mongoose.Schema.Types.ObjectId, ref: "crmh1", index: true },
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    course_interested: { type: String, trim: true },
    source: { type: String, trim: true, default: "Campus Visit" },
    visitdate: { type: String, trim: true },
    visittime: { type: String, trim: true },
    purpose: { type: String, trim: true },
    status: { type: String, trim: true, default: "Waiting" },
    counselorname: { type: String, trim: true },
    counseloremail: { type: String, trim: true },
    takenat: { type: Date },
    comments: { type: String, trim: true },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

crmCampusVisitQueueSchema.index({ colid: 1, tokennumber: 1 }, { unique: true });
crmCampusVisitQueueSchema.index({ colid: 1, status: 1, visitdate: 1 });

module.exports = mongoose.models.crmcampusvisitqueueds || mongoose.model("crmcampusvisitqueueds", crmCampusVisitQueueSchema);
