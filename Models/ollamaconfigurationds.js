const mongoose = require('mongoose');

const OllamaConfigurationSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  name: { type: String, required: true },
  serveraddress: { type: String, default: 'http://localhost:11434' },
  modelname: { type: String, default: 'llama3.1' },
  description: { type: String, default: '' },
  active: { type: String, default: 'Yes' },
  default: { type: String, default: 'No' },
  user: { type: String, default: '' }
}, { timestamps: true });

OllamaConfigurationSchema.index({ colid: 1, name: 1 });
OllamaConfigurationSchema.index({ colid: 1, active: 1, default: 1 });

module.exports = mongoose.model('ollamaconfigurationds', OllamaConfigurationSchema);
