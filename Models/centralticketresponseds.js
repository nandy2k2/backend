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

const centralTicketResponseSchema = new mongoose.Schema(
  {
    ticketid: { type: mongoose.Schema.Types.ObjectId, ref: "centralticketds", index: true },
    ticketno: { type: String, trim: true, index: true },
    response: { type: String, trim: true },
    status: { type: String, trim: true },
    assignedto: { type: String, trim: true },
    assignedtoemail: { type: String, trim: true },
    respondedby: { type: String, trim: true },
    respondedbyemail: { type: String, trim: true },
    attachments: [attachmentSchema],
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

centralTicketResponseSchema.index({ colid: 1, ticketid: 1, createdAt: 1 });

module.exports = mongoose.models.centralticketresponseds || mongoose.model("centralticketresponseds", centralTicketResponseSchema);
