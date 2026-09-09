const mongoose = require("mongoose");

const EventReportRagGeneratedSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  request_id: { type: String, trim: true, default: "" },
  event_title: { type: String, trim: true, default: "" },
  event_type: { type: String, trim: true, default: "" },
  event_date: { type: String, trim: true, default: "" },
  venue: { type: String, trim: true, default: "" },
  organizer: { type: String, trim: true, default: "" },
  program: { type: String, trim: true, default: "" },
  department: { type: String, trim: true, default: "" },
  audience: { type: String, trim: true, default: "" },
  participants_count: { type: Number, default: 0 },
  duration: { type: String, trim: true, default: "" },
  tone: { type: String, trim: true, default: "formal" },
  request_json: { type: Object, default: {} },
  similar_events: { type: Array, default: [] },
  report_markdown: { type: String, default: "" },
  report_html: { type: String, default: "" },
  ragserver: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, default: "Generated" },
  name: { type: String, trim: true, default: "" },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

EventReportRagGeneratedSchema.index({ colid: 1, event_date: 1, event_type: 1 });

module.exports = mongoose.model("eventreportraggeneratedds", EventReportRagGeneratedSchema);
