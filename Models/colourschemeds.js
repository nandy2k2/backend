const mongoose = require("mongoose");

const ColourSchemeSchema = new mongoose.Schema({
  colid: { type: Number, required: true, unique: true, index: true },
  name: { type: String, trim: true, default: "Default light blue" },
  appBarStart: { type: String, trim: true, default: "#dce9ff" },
  appBarEnd: { type: String, trim: true, default: "#f7fbff" },
  appBarText: { type: String, trim: true, default: "#1f2a44" },
  drawerBg: { type: String, trim: true, default: "#eff6ff" },
  drawerText: { type: String, trim: true, default: "#1f2a44" },
  drawerActive: { type: String, trim: true, default: "#3f7df6" },
  pageBgStart: { type: String, trim: true, default: "#eef5ff" },
  pageBgEnd: { type: String, trim: true, default: "#f8fbff" },
  cardBg: { type: String, trim: true, default: "#ffffff" },
  primary: { type: String, trim: true, default: "#3f7df6" },
  secondary: { type: String, trim: true, default: "#38bdf8" },
  accent: { type: String, trim: true, default: "#ff7a45" },
  border: { type: String, trim: true, default: "#dbeafe" },
  text: { type: String, trim: true, default: "#263044" },
  mutedText: { type: String, trim: true, default: "#64748b" },
  buttonText: { type: String, trim: true, default: "#ffffff" },
  user: { type: String, trim: true },
  username: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model("colourschemeds", ColourSchemeSchema);
