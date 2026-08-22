const mongoose = require("mongoose");

const MyCodeCustomDataSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, required: true, index: true },
  pageId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  modelName: { type: String, required: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdby: { type: String, default: "" }
}, { timestamps: true });

MyCodeCustomDataSchema.index({ colid: 1, user: 1, pageId: 1, modelName: 1 });

module.exports = mongoose.models.mycodecustomdatads || mongoose.model("mycodecustomdatads", MyCodeCustomDataSchema);
