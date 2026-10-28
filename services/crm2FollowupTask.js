const { Task } = require('../Models/crm2leadrecordsds');
async function syncFollowupTask(colid, lead, interactionid, values, user) {
  const query = { colid, leadid: lead._id, interactionid: String(interactionid) };
  if (!values.nextfollowupdate) {
    await Task.updateOne(query, { $set: { status: 'Closed', updatedby: user } });
    return;
  }
  await Task.findOneAndUpdate(query, {
    $set: { ...(values.academicyear || lead.academicyear ? { academicyear: values.academicyear || lead.academicyear } : {}), lead: lead.name, leademail: lead.email || '', leadphone: lead.phone || '', task: `Follow up: ${values.details}`, duedate: values.nextfollowupdate, updatedby: user },
    $setOnInsert: { ...query, status: 'Open', createdby: user }
  }, { upsert: true, new: true, runValidators: true });
}
async function closeFollowupTasks(colid, leadid, ids, user) {
  await Task.updateMany({ colid, leadid, interactionid: { $in: ids.map(String) } }, { $set: { status: 'Closed', updatedby: user } });
}
module.exports = { syncFollowupTask, closeFollowupTasks };
