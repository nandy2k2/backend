const mongoose = require("mongoose");

const examModel2ClassConfigurationSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true, required: true },
    fromsgpa: { type: Number, default: 0 },
    tosgpa: { type: Number, default: 0 },
    classassigned: { type: String, trim: true, required: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

examModel2ClassConfigurationSchema.index({
  colid: 1,
  academicyear: 1,
  programcode: 1,
  fromsgpa: 1,
  tosgpa: 1,
  classassigned: 1
});

module.exports = mongoose.model("exammodel2classconfigurationds", examModel2ClassConfigurationSchema);
