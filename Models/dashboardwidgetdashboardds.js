const mongoose = require("mongoose");

const dashboardWidgetDashboardSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  dashboardname: { type: String, required: true, trim: true },
  role: { type: String, required: true, trim: true, index: true },
  description: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, default: "Active" },
  widgets: [{
    widgetid: { type: String, required: true, trim: true },
    title: { type: String, trim: true, default: "" },
    order: { type: Number, default: 0 }
  }],
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

dashboardWidgetDashboardSchema.index({ colid: 1, role: 1, dashboardname: 1 });

module.exports = mongoose.model("dashboardwidgetdashboardds", dashboardWidgetDashboardSchema);
