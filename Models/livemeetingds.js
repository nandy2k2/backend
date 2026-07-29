const mongoose = require('mongoose');

const liveMeetingSchema = new mongoose.Schema({
  colid: { type: Number, required: true },
  hostName: String,
  hostEmail: String,
  title: String,
  description: String,
  startDateTime: Date,
  endDateTime: Date,
  internalParticipants: [{
    name: String,
    email: String,
    role: String,
    department: String
  }],
  internalParticipantEmails: [String],
  externalParticipants: [{
    email: String,
    status: { type: String, default: 'Invited' }
  }],
  externalParticipantEmails: [String],
  publicJoinToken: String,
  meetingLink: String,
  externalMeetingLink: String,
  status: { type: String, default: 'Scheduled' },
  createdBy: String
}, { timestamps: true });

liveMeetingSchema.index({ colid: 1, startDateTime: 1 });
liveMeetingSchema.index({ colid: 1, hostEmail: 1 });
liveMeetingSchema.index({ colid: 1, internalParticipantEmails: 1 });
liveMeetingSchema.index({ publicJoinToken: 1 });

module.exports = mongoose.model('livemeetingds', liveMeetingSchema);
