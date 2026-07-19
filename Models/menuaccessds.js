const mongoose = require('mongoose');

const menuaccessdsschema = new mongoose.Schema({
  colid: {
    type: Number,
    required: [true, 'Please enter colid']
  },
  menugroup: {
    type: String,
    required: [true, 'Please enter menu group']
  },
  groupname: {
    type: String
  },
  title: {
    type: String,
    required: [true, 'Please enter title']
  },
  path: {
    type: String,
    required: [true, 'Please enter path']
  },
  role: {
    type: String,
    required: [true, 'Please enter role']
  },
  access: {
    type: String,
    enum: ['Allow', 'Deny'],
    default: 'Allow'
  },
  user: {
    type: String
  },
  status1: {
    type: String
  },
  comments: {
    type: String
  }
}, { timestamps: true });

module.exports = mongoose.model('menuaccessds', menuaccessdsschema);
