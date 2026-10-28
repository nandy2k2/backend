const mongoose = require('mongoose');
const base = { colid: { type: Number, required: true }, academicyear: String, leadid: { type: mongoose.Schema.Types.ObjectId, required: true }, lead: String, leademail: String, leadphone: String, createdby: String, updatedby: String };
const task = new mongoose.Schema({ ...base, task: { type: String, required: true, trim: true }, duedate: { type: Date, required: true }, status: { type: String, enum: ['Open','Pending','Closed'], default: 'Open' }, interactionid: String }, { timestamps: true });
task.index({ colid: 1, leadid: 1, interactionid: 1 }, { unique: true, partialFilterExpression: { interactionid: { $type: 'string' } } });
task.index({ colid: 1, status: 1, duedate: 1 });
const note = new mongoose.Schema({ ...base, note: { type: String, required: true, trim: true } }, { timestamps: true });
note.index({ colid: 1, leadid: 1, createdAt: -1 });
module.exports = { Task: mongoose.models.crm2leadtaskds || mongoose.model('crm2leadtaskds', task), Note: mongoose.models.crm2leadnoteds || mongoose.model('crm2leadnoteds', note) };
