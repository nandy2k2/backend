const path = require('path');
const multer = require('multer');
const AWS = require('aws-sdk');
const User = require('../Models/user');
const Awsconfig = require('../Models/awsconfig');
const UserDocumentRequirement = require('../Models/userdocumentrequirementds');
const UserUploadedDocument = require('../Models/useruploadeddocumentds');
const UserProfileApprovalWorkflow = require('../Models/userprofileapprovalworkflowds');
const UserDocumentApprovalRequest = require('../Models/userdocumentapprovalrequestds');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const clean = (value) => String(value || '').trim();
const number = (value) => Number(value || 0);
const encodeS3Key = (key) => String(key || '').split('/').map(encodeURIComponent).join('/');

const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === 'us-east-1') return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const getAwsConfig = async (colid) => {
  const base = { colid: number(colid), type: /^aws$/i };
  const defaultConfig = await Awsconfig.findOne({ ...base, default: /^Yes$/i }).sort({ _id: -1 }).lean();
  if (defaultConfig) return defaultConfig;
  return Awsconfig.findOne(base).sort({ _id: -1 }).lean();
};

const documentWorkflow = async (colid, role) => UserProfileApprovalWorkflow.find({
  colid,
  role,
  status: { $ne: 'Inactive' },
  $or: [{ requesttype: 'Document' }, { requesttype: 'All' }, { requesttype: '' }, { requesttype: { $exists: false } }]
}).sort({ level: 1 }).lean();

exports.uploadMiddleware = upload.single('file');

exports.getRoles = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const userRoles = await User.distinct('role', { colid });
    const configuredRoles = await UserDocumentRequirement.distinct('role', { colid });
    const roles = [...new Set([...userRoles, ...configuredRoles, 'Student', 'Faculty', 'Admin', 'All'].filter(Boolean))]
      .map(String)
      .sort((a, b) => a.localeCompare(b));
    res.json(roles);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getCurrentUserRole = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const user = clean(req.query.user);
    if (!colid || !user) return res.json({ role: '' });
    const data = await User.findOne({
      colid,
      $or: [
        { email: user },
        { user },
        { regno: user }
      ]
    }).select('role email user regno name').lean();
    res.json({ role: data?.role || '', user: data || null });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getRequirements = async (req, res) => {
  try {
    const filter = { colid: number(req.query.colid) };
    if (clean(req.query.role)) filter.role = clean(req.query.role);
    if (clean(req.query.status)) filter.status = clean(req.query.status);
    const data = await UserDocumentRequirement.find(filter).sort({ role: 1, category: 1, order: 1, documentname: 1 }).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.saveRequirement = async (req, res) => {
  try {
    const payload = {
      colid: number(req.body.colid),
      role: clean(req.body.role),
      documentname: clean(req.body.documentname),
      category: clean(req.body.category),
      order: number(req.body.order),
      description: clean(req.body.description),
      mandatory: clean(req.body.mandatory) || 'Yes',
      status: clean(req.body.status) || 'Active',
      user: clean(req.body.user)
    };
    if (!payload.role || !payload.documentname) {
      return res.status(400).json({ msg: 'Role and document name are required' });
    }

    let data;
    if (req.body.id || req.body._id) {
      data = await UserDocumentRequirement.findOneAndUpdate(
        { _id: req.body.id || req.body._id, colid: payload.colid },
        payload,
        { new: true, runValidators: true }
      );
    } else {
      data = await UserDocumentRequirement.create(payload);
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteRequirement = async (req, res) => {
  try {
    const data = await UserDocumentRequirement.findOneAndDelete({
      _id: req.body.id || req.body._id,
      colid: number(req.body.colid)
    });
    if (!data) return res.status(404).json({ msg: 'Document requirement not found' });
    res.json({ msg: 'Deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.bulkRequirements = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const user = clean(req.body.user);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    let inserted = 0;
    let updated = 0;
    const errors = [];

    for (const item of items) {
      const role = clean(item.role || item.Role);
      const documentname = clean(item.documentname || item['Document Name'] || item.Document);
      if (!role || !documentname) {
        errors.push(`Row ${item.rowNumber || ''}: role and documentname required`);
        continue;
      }
      const payload = {
        colid,
        role,
        documentname,
        category: clean(item.category || item.Category),
        order: number(item.order || item.Order),
        description: clean(item.description || item.Description),
        mandatory: clean(item.mandatory || item.Mandatory) || 'Yes',
        status: clean(item.status || item.Status) || 'Active',
        user
      };
      const result = await UserDocumentRequirement.findOneAndUpdate(
        { colid, role, documentname },
        payload,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (result.createdAt && result.updatedAt && String(result.createdAt) === String(result.updatedAt)) inserted += 1;
      else updated += 1;
    }
    res.json({ inserted, updated, errors });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getUploads = async (req, res) => {
  try {
    const filter = { colid: number(req.query.colid) };
    if (clean(req.query.role)) filter.role = clean(req.query.role);
    if (clean(req.query.owneruser)) filter.owneruser = clean(req.query.owneruser);
    const data = await UserUploadedDocument.find(filter).sort({ createdAt: -1 }).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: 'Select a file to upload' });
    const colid = number(req.body.colid);
    const documentname = clean(req.body.documentname);
    const role = clean(req.body.role);
    const owneruser = clean(req.body.owneruser || req.body.user);
    if (!colid || !documentname || !role || !owneruser) {
      return res.status(400).json({ msg: 'Role, user and document name are required' });
    }
    const workflow = await documentWorkflow(colid, role);
    if (!workflow.length) return res.status(400).json({ msg: `Document approval workflow is not configured for role ${role}` });

    const config = await getAwsConfig(colid);
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ msg: 'AWS configuration is incomplete' });
    }

    const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, '_');
    const key = `${colid}/user-documents/${role}/${owneruser}/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({
      accessKeyId: config.username,
      secretAccessKey: config.password,
      region: config.region
    });

    await s3.putObject({
      Bucket: config.bucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }).promise();

    const data = await UserUploadedDocument.findOneAndUpdate(
      {
        colid,
        owneruser,
        role,
        documentname
      },
      {
        colid,
        role,
        documentrequirementid: clean(req.body.documentrequirementid),
        documentname,
        description: clean(req.body.description),
        owneruser,
        ownername: clean(req.body.ownername),
        uploadedby: clean(req.body.uploadedby || req.body.user),
        awsconfigid: String(config._id),
        bucket: config.bucket,
        region: config.region,
        key,
        filename: cleanName,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: s3Url(config.bucket, config.region, key),
        status: 'Pending',
        remarks: clean(req.body.remarks)
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await UserDocumentApprovalRequest.findOneAndUpdate(
      { colid, documentid: String(data._id), status: 'Pending' },
      {
        colid,
        role,
        owneruser,
        ownername: clean(req.body.ownername),
        documentid: String(data._id),
        documentname,
        url: data.url,
        originalname: data.originalname,
        level: 1,
        status: 'Pending',
        comments: ''
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteUpload = async (req, res) => {
  try {
    const data = await UserUploadedDocument.findOneAndDelete({
      _id: req.body.id || req.body._id,
      colid: number(req.body.colid)
    });
    if (!data) return res.status(404).json({ msg: 'Uploaded document not found' });
    res.json({ msg: 'Deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
