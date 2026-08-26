const User = require('../Models/user');
const UserUploadedDocument = require('../Models/useruploadeddocumentds');
const UserProfileApprovalWorkflow = require('../Models/userprofileapprovalworkflowds');
const UserProfileEditRequest = require('../Models/userprofileeditrequestds');
const UserDocumentApprovalRequest = require('../Models/userdocumentapprovalrequestds');
const userProfileAuditLogController = require('./userprofileauditlogctlrds');
const { createApprovalTasks, completeApprovalTasks } = require('../utils/approvalTaskHelper');

const clean = (value) => String(value || '').trim();
const number = (value) => Number(value || 0);
const isAll = (value) => /^all$/i.test(clean(value));

const normalizeCustomFields = (customFields) => {
  if (!customFields) return {};
  if (customFields instanceof Map) return Object.fromEntries(customFields);
  if (typeof customFields === 'object') return customFields;
  return {};
};

const setUserValue = (user, field, value) => {
  if (field.startsWith('customFields.')) {
    const key = field.replace('customFields.', '');
    const current = normalizeCustomFields(user.customFields);
    current[key] = value;
    user.customFields = current;
    user.markModified('customFields');
  } else {
    user[field] = value;
  }
};

const workflowFilter = (colid, role, type) => ({
  colid,
  role,
  status: { $ne: 'Inactive' },
  $or: [{ requesttype: type }, { requesttype: 'All' }, { requesttype: '' }, { requesttype: { $exists: false } }]
});

const getWorkflow = async (colid, role, type) => UserProfileApprovalWorkflow
  .find(workflowFilter(colid, role, type))
  .sort({ level: 1, approverrole: 1, approvername: 1 })
  .lean();

const nextLevel = (workflow, currentLevel) => {
  const levels = [...new Set(workflow.map((item) => number(item.level)).filter(Boolean))].sort((a, b) => a - b);
  return levels.find((level) => level > number(currentLevel)) || null;
};

const canApproveAtLevel = (workflow, level, approveremail, approverrole) => workflow.some((row) => {
  if (number(row.level) !== number(level)) return false;
  const emailOk = !clean(row.approveremail) || isAll(row.approveremail) || clean(row.approveremail).toLowerCase() === clean(approveremail).toLowerCase();
  const roleOk = !clean(row.approverrole) || isAll(row.approverrole) || clean(row.approverrole).toLowerCase() === clean(approverrole).toLowerCase();
  return emailOk && roleOk;
});

const workflowRowsAtLevel = (workflow = [], level) => workflow.filter((row) => number(row.level) === number(level));

async function addProfileFieldTasks(request, field, workflow) {
  for (const approver of workflowRowsAtLevel(workflow, field.level)) {
    await createApprovalTasks({
      colid: request.colid,
      user: request.owneruser,
      createdby: request.ownername || request.owneruser,
      academicyear: '',
      approvername: approver.approvername,
      approveremail: approver.approveremail,
      approverrole: approver.approverrole,
      title: `Approve profile field ${field.label || field.field} for ${request.ownername || request.owneruser}`,
      category: 'User profile approval',
      pagelink: '/userprofileapproval',
      comments: `Profile field ${field.label || field.field} is pending approval at level ${field.level}.`,
      referenceModel: 'userprofileeditrequestds',
      referenceId: `${request._id}:${field.field}`,
      level: field.level
    });
  }
}

async function addDocumentTasks(request, workflow) {
  for (const approver of workflowRowsAtLevel(workflow, request.level)) {
    await createApprovalTasks({
      colid: request.colid,
      user: request.owneruser,
      createdby: request.ownername || request.owneruser,
      academicyear: '',
      approvername: approver.approvername,
      approveremail: approver.approveremail,
      approverrole: approver.approverrole,
      title: `Approve document ${request.documentname || request.originalname} for ${request.ownername || request.owneruser}`,
      category: 'User document approval',
      pagelink: '/userprofileapproval',
      comments: `Document ${request.documentname || request.originalname} is pending approval at level ${request.level}.`,
      referenceModel: 'userdocumentapprovalrequestds',
      referenceId: request._id,
      level: request.level
    });
  }
}

const resolveRequestStatus = (statuses) => {
  const list = statuses.map(clean);
  if (!list.length) return 'Pending';
  if (list.every((status) => status === 'Approved')) return 'Approved';
  if (list.every((status) => status === 'Rejected')) return 'Rejected';
  if (list.some((status) => status === 'Pending')) return 'Pending';
  return 'Partially Approved';
};

exports.getWorkflows = async (req, res) => {
  try {
    const filter = { colid: number(req.query.colid) };
    if (clean(req.query.role)) filter.role = clean(req.query.role);
    const data = await UserProfileApprovalWorkflow.find(filter).sort({ role: 1, requesttype: 1, level: 1 }).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.saveWorkflow = async (req, res) => {
  try {
    const payload = {
      colid: number(req.body.colid),
      role: clean(req.body.role),
      requesttype: clean(req.body.requesttype) || 'All',
      level: number(req.body.level),
      approverrole: clean(req.body.approverrole),
      approvername: clean(req.body.approvername),
      approveremail: clean(req.body.approveremail),
      status: clean(req.body.status) || 'Active',
      user: clean(req.body.user)
    };
    if (!payload.colid || !payload.role || !payload.level) return res.status(400).json({ msg: 'Role and level are required' });
    const data = req.body.id || req.body._id
      ? await UserProfileApprovalWorkflow.findOneAndUpdate({ _id: req.body.id || req.body._id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await UserProfileApprovalWorkflow.create(payload);
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteWorkflow = async (req, res) => {
  try {
    const data = await UserProfileApprovalWorkflow.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ msg: 'Workflow row not found' });
    res.json({ msg: 'Deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const data = await User.find({ colid, role: { $ne: 'Student' } }).select('name email role department').sort({ name: 1 }).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getMyStatus = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const owneruser = clean(req.query.owneruser || req.query.user);
    const [profile, documents] = await Promise.all([
      UserProfileEditRequest.find({ colid, owneruser }).sort({ createdAt: -1 }).lean(),
      UserDocumentApprovalRequest.find({ colid, owneruser }).sort({ createdAt: -1 }).lean()
    ]);
    res.json({ profile, documents });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getPendingApprovals = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const approveremail = clean(req.query.approveremail || req.query.user);
    const approverrole = clean(req.query.approverrole || req.query.role);
    const profileRequests = await UserProfileEditRequest.find({ colid, status: 'Pending' }).sort({ createdAt: -1 }).lean();
    const documentRequests = await UserDocumentApprovalRequest.find({ colid, status: 'Pending' }).sort({ createdAt: -1 }).lean();
    const profile = [];
    for (const request of profileRequests) {
      const workflow = await getWorkflow(colid, request.role, 'Profile');
      request.fields.filter((field) => field.status === 'Pending' && canApproveAtLevel(workflow, field.level, approveremail, approverrole))
        .forEach((field) => profile.push({ ...field, requestid: request._id, owneruser: request.owneruser, ownername: request.ownername, role: request.role, createdAt: request.createdAt }));
    }
    const documents = [];
    for (const request of documentRequests) {
      const workflow = await getWorkflow(colid, request.role, 'Document');
      if (canApproveAtLevel(workflow, request.level, approveremail, approverrole)) documents.push(request);
    }
    res.json({ profile, documents });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.actOnProfileField = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const request = await UserProfileEditRequest.findOne({ _id: req.body.requestid, colid });
    if (!request) return res.status(404).json({ msg: 'Profile edit request not found' });
    const field = request.fields.find((item) => item.field === clean(req.body.field));
    if (!field) return res.status(404).json({ msg: 'Field request not found' });
    if (field.status !== 'Pending') return res.status(400).json({ msg: 'This field is already processed' });

    const workflow = await getWorkflow(colid, request.role, 'Profile');
    if (!canApproveAtLevel(workflow, field.level, clean(req.body.approveremail || req.body.user), clean(req.body.approverrole || req.body.role))) {
      return res.status(403).json({ msg: 'You are not configured to approve this level' });
    }

    const action = /^reject/i.test(clean(req.body.action)) ? 'Rejected' : 'Approved';
    const previousLevel = field.level;
    field.decisions.push({
      level: field.level,
      action,
      comments: clean(req.body.comments),
      approvername: clean(req.body.approvername),
      approveremail: clean(req.body.approveremail || req.body.user),
      date: new Date()
    });
    field.comments = clean(req.body.comments);
    await completeApprovalTasks({
      colid,
      approveremail: clean(req.body.approveremail || req.body.user),
      category: 'User profile approval',
      referenceModel: 'userprofileeditrequestds',
      referenceId: `${request._id}:${field.field}`,
      level: previousLevel,
      comments: `Profile field ${field.label || field.field} ${action.toLowerCase()} by ${clean(req.body.approvername || req.body.user)}`
    });

    if (action === 'Rejected') {
      field.status = 'Rejected';
    } else {
      const upcomingLevel = nextLevel(workflow, field.level);
      if (upcomingLevel) {
        field.level = upcomingLevel;
        field.status = 'Pending';
        await addProfileFieldTasks(request, field, workflow);
      } else {
        const user = await User.findOne({
          colid,
          $or: [
            { email: request.owneruser },
            { user: request.owneruser },
            { regno: request.owneruser }
          ]
        });
        if (!user) return res.status(404).json({ msg: 'User not found for applying approved field' });
        setUserValue(user, field.field, field.newvalue);
        await user.save({ validateBeforeSave: false });
        field.status = 'Approved';
      }
    }
    request.status = resolveRequestStatus(request.fields.map((item) => item.status));
    await request.save();
    await userProfileAuditLogController.createAuditLog(req, {
      colid,
      action,
      requesttype: 'Profile',
      role: request.role,
      owneruser: request.owneruser,
      ownername: request.ownername,
      actorname: clean(req.body.approvername),
      actoremail: clean(req.body.approveremail || req.body.user),
      actorrole: clean(req.body.approverrole || req.body.role),
      field: field.field,
      label: field.label,
      oldvalue: field.oldvalue,
      newvalue: field.newvalue,
      status: field.status,
      comments: clean(req.body.comments),
      requestid: String(request._id),
      details: { level: field.level, requeststatus: request.status }
    });
    res.json({ msg: `Field ${action.toLowerCase()}`, request });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.actOnDocument = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const request = await UserDocumentApprovalRequest.findOne({ _id: req.body.requestid, colid });
    if (!request) return res.status(404).json({ msg: 'Document approval request not found' });
    if (request.status !== 'Pending') return res.status(400).json({ msg: 'This document is already processed' });
    const workflow = await getWorkflow(colid, request.role, 'Document');
    if (!canApproveAtLevel(workflow, request.level, clean(req.body.approveremail || req.body.user), clean(req.body.approverrole || req.body.role))) {
      return res.status(403).json({ msg: 'You are not configured to approve this level' });
    }

    const action = /^reject/i.test(clean(req.body.action)) ? 'Rejected' : 'Approved';
    const previousLevel = request.level;
    request.decisions.push({
      level: request.level,
      action,
      comments: clean(req.body.comments),
      approvername: clean(req.body.approvername),
      approveremail: clean(req.body.approveremail || req.body.user),
      date: new Date()
    });
    request.comments = clean(req.body.comments);
    await completeApprovalTasks({
      colid,
      approveremail: clean(req.body.approveremail || req.body.user),
      category: 'User document approval',
      referenceModel: 'userdocumentapprovalrequestds',
      referenceId: request._id,
      level: previousLevel,
      comments: `Document ${request.documentname || request.originalname} ${action.toLowerCase()} by ${clean(req.body.approvername || req.body.user)}`
    });
    if (action === 'Rejected') {
      request.status = 'Rejected';
      await UserUploadedDocument.findOneAndUpdate({ _id: request.documentid, colid }, { status: 'Rejected', remarks: request.comments });
    } else {
      const upcomingLevel = nextLevel(workflow, request.level);
      if (upcomingLevel) {
        request.level = upcomingLevel;
        request.status = 'Pending';
        await addDocumentTasks(request, workflow);
      } else {
        request.status = 'Approved';
        await UserUploadedDocument.findOneAndUpdate({ _id: request.documentid, colid }, { status: 'Approved', remarks: request.comments });
      }
    }
    await request.save();
    await userProfileAuditLogController.createAuditLog(req, {
      colid,
      action,
      requesttype: 'Document',
      role: request.role,
      owneruser: request.owneruser,
      ownername: request.ownername,
      actorname: clean(req.body.approvername),
      actoremail: clean(req.body.approveremail || req.body.user),
      actorrole: clean(req.body.approverrole || req.body.role),
      field: request.documentname,
      label: request.documentname,
      status: request.status,
      comments: clean(req.body.comments),
      requestid: String(request._id),
      details: {
        level: request.level,
        documentid: request.documentid,
        url: request.url,
        originalname: request.originalname
      }
    });
    res.json({ msg: `Document ${action.toLowerCase()}`, request });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.updateUserApprovalStatus = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const identifier = clean(req.body.email || req.body.owneruser || req.body.user || req.body.regno);
    const status = clean(req.body.profileapprovalstatus || req.body.status);
    const comments = clean(req.body.profileapprovalcomments || req.body.comments);
    if (!colid || !identifier) return res.status(400).json({ msg: 'colid and student identifier are required' });
    if (!['Approved', 'Pending', 'Rejected'].includes(status)) return res.status(400).json({ msg: 'Approval status must be Approved, Pending or Rejected' });

    const user = await User.findOneAndUpdate(
      {
        colid,
        role: 'Student',
        $or: [
          { email: identifier },
          { user: identifier },
          { regno: identifier }
        ]
      },
      {
        $set: {
          profileapprovalstatus: status,
          profileapprovalcomments: comments
        }
      },
      { new: true, runValidators: false }
    ).lean();
    if (!user) return res.status(404).json({ msg: 'Student not found' });

    await userProfileAuditLogController.createAuditLog(req, {
      colid,
      action: 'Profile Status Updated',
      requesttype: 'Profile',
      role: 'Student',
      owneruser: user.email || user.user || user.regno,
      ownername: user.name,
      actorname: clean(req.body.approvername),
      actoremail: clean(req.body.approveremail || req.body.user),
      actorrole: clean(req.body.approverrole || req.body.role),
      field: 'profileapprovalstatus',
      label: 'Profile Approval Status',
      newvalue: status,
      status,
      comments,
      details: { profileapprovalcomments: comments }
    });
    res.json({ msg: 'Student profile approval status saved', user });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getReport = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const [profile, documents] = await Promise.all([
      UserProfileEditRequest.find({ colid }).lean(),
      UserDocumentApprovalRequest.find({ colid }).lean()
    ]);
    const summaryMap = new Map();
    const addSummary = (role, type, status) => {
      const key = `${role || 'NA'}|${type}|${status || 'Pending'}`;
      const current = summaryMap.get(key) || { role: role || 'NA', requesttype: type, status: status || 'Pending', count: 0 };
      current.count += 1;
      summaryMap.set(key, current);
    };
    profile.forEach((request) => request.fields.forEach((field) => addSummary(request.role, 'Profile', field.status)));
    documents.forEach((request) => addSummary(request.role, 'Document', request.status));
    res.json({ summary: [...summaryMap.values()], profile, documents });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
