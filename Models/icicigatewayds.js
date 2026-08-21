const mongoose = require('mongoose');

const icicigatewaydsschema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please enter name']
  },
  user: {
    type: String,
    required: [true, 'Please enter user']
  },
  colid: {
    type: Number,
    required: [true, 'Please enter colid']
  },
  program: {
    type: String,
    default: ''
  },
  programcode: {
    type: String,
    default: ''
  },
  merchantid: {
    type: String,
    required: [true, 'Please enter merchant id']
  },
  aggregatorid: {
    type: String,
    required: [true, 'Please enter aggregator id']
  },
  secretkey: {
    type: String,
    required: [true, 'Please enter secret key']
  },
  environment: {
    type: String,
    enum: ['test', 'prod'],
    default: 'test'
  },
  saleurl: {
    type: String
  },
  commandurl: {
    type: String
  },
  settlementurl: {
    type: String
  },
  isactive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String
  }
}, { timestamps: true });

icicigatewaydsschema.index({ colid: 1 });
icicigatewaydsschema.index({ colid: 1, isactive: 1 });
icicigatewaydsschema.index({ colid: 1, programcode: 1, isactive: 1 });

const icicigatewayds = mongoose.models.icicigatewayds || mongoose.model('icicigatewayds', icicigatewaydsschema);
module.exports = icicigatewayds;
