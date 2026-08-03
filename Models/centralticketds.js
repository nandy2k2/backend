const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    filename: String,
    originalname: String,
    mimetype: String,
    size: Number,
    url: String,
    key: String,
    bucket: String,
    region: String,
    uploadedat: { type: Date, default: Date.now }
  },
  { _id: false }
);

const centralTicketSchema = new mongoose.Schema(
  {
    ticketno: { type: String, trim: true, index: true },
    title: { type: String, trim: true, required: true },
    details: { type: String, trim: true },
    startdatetime: { type: Date },
    status: { type: String, trim: true, default: "Open", index: true },
    priority: { type: String, trim: true, default: "Normal" },
    category: { type: String, trim: true, index: true },
    raisedby: { type: String, trim: true },
    raisedbyemail: { type: String, trim: true, index: true },
    raisedbyrole: { type: String, trim: true },
    assignedto: { type: String, trim: true },
    assignedtoemail: { type: String, trim: true, index: true },
    assignedat: { type: Date },
    firstresponseat: { type: Date },
    closedat: { type: Date },
    attachments: [attachmentSchema],
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

centralTicketSchema.index({ colid: 1, ticketno: 1 }, { unique: true });
centralTicketSchema.index({ colid: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.centralticketds || mongoose.model("centralticketds", centralTicketSchema);
