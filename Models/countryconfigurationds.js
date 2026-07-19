const mongoose = require('mongoose');

const CountryConfigurationSchema = new mongoose.Schema({
  colid: Number,
  country: {
    type: String,
    default: ''
  },
  default: {
    type: String,
    default: 'No'
  },
  status: {
    type: String,
    default: 'Active'
  }
}, { timestamps: true });

CountryConfigurationSchema.index({ colid: 1, default: 1 });

module.exports = mongoose.model('countryconfigurationds', CountryConfigurationSchema);
