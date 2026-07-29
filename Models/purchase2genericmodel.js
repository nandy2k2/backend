const mongoose = require("mongoose");

module.exports = function purchase2GenericModel(modelName, fields = {}) {
  const schema = new mongoose.Schema(
    {
      name: { type: String, trim: true },
      user: { type: String, trim: true },
      colid: { type: Number, required: true, index: true },
      ...fields
    },
    { timestamps: true, strict: false }
  );
  schema.index({ colid: 1, createdAt: -1 });
  return mongoose.models[modelName] || mongoose.model(modelName, schema);
};
