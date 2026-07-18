const mongoose = require('mongoose');

const organizationHierarchySchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  employeename: { type: String, default: '' },
  employeeemail: { type: String, required: true },
  department: { type: String, default: '' },
  managername: { type: String, default: '' },
  manageremail: { type: String, required: true },
  managerdepartment: { type: String, default: '' },
  status: { type: String, default: 'Active' },
  user: { type: String, default: '' },
  comments: { type: String, default: '' }
}, { timestamps: true });

organizationHierarchySchema.index({ colid: 1, employeeemail: 1, manageremail: 1 }, { unique: true });

module.exports = mongoose.model('organizationhierarchyds', organizationHierarchySchema);
