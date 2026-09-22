const mongoose = require('mongoose');

const studentAcademicActivitySchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  activitytype: { type: String, enum: ['Seminar', 'Publication'], required: true },
  academicyear: { type: String, trim: true, default: '' },
  regulation: { type: String, trim: true, default: '' },
  institution: { type: String, trim: true, default: '' },
  department: { type: String, trim: true, default: '' },
  program: { type: String, trim: true, default: '' },
  programcode: { type: String, trim: true, default: '' },
  semester: { type: String, trim: true, default: '' },
  section: { type: String, trim: true, default: '' },
  student: { type: String, trim: true, default: '' },
  regno: { type: String, trim: true, default: '' },
  studentemail: { type: String, trim: true, default: '' },
  title: { type: String, trim: true, default: '' },
  category: { type: String, trim: true, default: '' },
  level: { type: String, trim: true, default: '' },
  organizer: { type: String, trim: true, default: '' },
  venue: { type: String, trim: true, default: '' },
  activitydate: { type: Date },
  journal: { type: String, trim: true, default: '' },
  publicationtype: { type: String, trim: true, default: '' },
  issn: { type: String, trim: true, default: '' },
  doi: { type: String, trim: true, default: '' },
  link: { type: String, trim: true, default: '' },
  filelink: { type: String, trim: true, default: '' },
  status: { type: String, trim: true, default: 'Active' },
  remarks: { type: String, trim: true, default: '' },
  name: { type: String, trim: true, default: '' },
  user: { type: String, trim: true, default: '' }
}, { timestamps: true });

studentAcademicActivitySchema.index({ colid: 1, activitytype: 1, academicyear: 1, programcode: 1, regno: 1 });

module.exports = mongoose.model('studentacademicactivityds', studentAcademicActivitySchema);
