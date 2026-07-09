const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const User = require("../Models/user");
const Awsconfig = require("../Models/awsconfig");
const UserAcademicDetail = require("../Models/useracademicdetailds");
const UserEmploymentDetail = require("../Models/useremploymentdetailds");
const UserProfileDocumentRequirement = require("../Models/userprofiledocumentrequirementds");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const clean = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const escapeRegex = (value) => clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const getAwsConfig = async (colid) => {
  const base = { colid: number(colid), type: /^aws$/i };
  const defaultConfig = await Awsconfig.findOne({ ...base, default: /^Yes$/i }).sort({ _id: -1 }).lean();
  if (defaultConfig) return defaultConfig;
  return Awsconfig.findOne(base).sort({ _id: -1 }).lean();
};

const ownerFilter = (source = {}) => {
  const filter = { colid: number(source.colid) };
  if (clean(source.owneruser)) filter.owneruser = clean(source.owneruser);
  if (clean(source.role)) filter.role = clean(source.role);
  return filter;
};

exports.uploadMiddleware = upload.single("file");

exports.searchUsers = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const search = clean(req.query.search);
    const filter = { colid, role: { $not: /^Student$/i } };
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }, { department: regex }, { designation: regex }];
    }
    const users = await User.find(filter)
      .select("name email phone role department designation institution photo customFields")
      .sort({ name: 1 })
      .limit(250)
      .lean();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRequirements = async (req, res) => {
  try {
    const filter = { colid: number(req.query.colid) };
    if (clean(req.query.role)) filter.role = clean(req.query.role);
    if (clean(req.query.type)) filter.type = clean(req.query.type);
    if (clean(req.query.status)) filter.status = clean(req.query.status);
    const data = await UserProfileDocumentRequirement.find(filter).sort({ role: 1, type: 1, order: 1, documentname: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveRequirement = async (req, res) => {
  try {
    const payload = {
      colid: number(req.body.colid),
      role: clean(req.body.role),
      type: clean(req.body.type),
      documentname: clean(req.body.documentname),
      description: clean(req.body.description),
      mandatory: clean(req.body.mandatory) || "Yes",
      order: number(req.body.order),
      status: clean(req.body.status) || "Active",
      user: clean(req.body.user)
    };
    if (!payload.role || !payload.type || !payload.documentname) {
      return res.status(400).json({ success: false, message: "Role, type and document name are required" });
    }
    const id = req.body.id || req.body._id;
    const data = id
      ? await UserProfileDocumentRequirement.findOneAndUpdate({ _id: id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await UserProfileDocumentRequirement.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteRequirement = async (req, res) => {
  try {
    const data = await UserProfileDocumentRequirement.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Document requirement not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.bulkRequirements = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const user = clean(req.body.user);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    let saved = 0;
    const errors = [];
    for (const item of items) {
      const role = clean(item.role || item.Role);
      const type = clean(item.type || item.Type);
      const documentname = clean(item.documentname || item.Document || item["Document Name"]);
      if (!role || !type || !documentname) {
        errors.push(`Row ${item.rowNumber || ""}: role, type and documentname are required`);
        continue;
      }
      await UserProfileDocumentRequirement.findOneAndUpdate(
        { colid, role, type, documentname },
        {
          colid,
          role,
          type,
          documentname,
          description: clean(item.description || item.Description),
          mandatory: clean(item.mandatory || item.Mandatory) || "Yes",
          order: number(item.order || item.Order),
          status: clean(item.status || item.Status) || "Active",
          user
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    res.json({ success: true, saved, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const academicPayload = (body = {}) => ({
  colid: number(body.colid),
  owneruser: clean(body.owneruser || body.user),
  ownername: clean(body.ownername),
  role: clean(body.role),
  qualification: clean(body.qualification),
  specialization: clean(body.specialization),
  universityboard: clean(body.universityboard),
  institutecollege: clean(body.institutecollege),
  passingyear: clean(body.passingyear),
  percentagecgpa: clean(body.percentagecgpa),
  modeofstudy: clean(body.modeofstudy),
  status: clean(body.status) || "Active",
  user: clean(body.user)
});

const employmentPayload = (body = {}) => ({
  colid: number(body.colid),
  owneruser: clean(body.owneruser || body.user),
  ownername: clean(body.ownername),
  role: clean(body.role),
  organizationname: clean(body.organizationname),
  designation: clean(body.designation),
  employmenttype: clean(body.employmenttype),
  dateofjoining: clean(body.dateofjoining),
  lastworkingdate: clean(body.lastworkingdate),
  totalexperience: clean(body.totalexperience),
  lastdrawnsalary: number(body.lastdrawnsalary),
  reasonforleaving: clean(body.reasonforleaving),
  status: clean(body.status) || "Active",
  user: clean(body.user)
});

exports.listAcademic = async (req, res) => {
  try {
    const data = await UserAcademicDetail.find(ownerFilter(req.query)).sort({ passingyear: -1, qualification: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveAcademic = async (req, res) => {
  try {
    const payload = academicPayload(req.body);
    if (!payload.colid || !payload.owneruser || !payload.qualification) {
      return res.status(400).json({ success: false, message: "User and qualification are required" });
    }
    const id = req.body.id || req.body._id;
    const data = id
      ? await UserAcademicDetail.findOneAndUpdate({ _id: id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await UserAcademicDetail.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteAcademic = async (req, res) => {
  try {
    const data = await UserAcademicDetail.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Academic detail not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listEmployment = async (req, res) => {
  try {
    const data = await UserEmploymentDetail.find(ownerFilter(req.query)).sort({ dateofjoining: -1, organizationname: 1 }).lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveEmployment = async (req, res) => {
  try {
    const payload = employmentPayload(req.body);
    if (!payload.colid || !payload.owneruser || !payload.organizationname) {
      return res.status(400).json({ success: false, message: "User and organization name are required" });
    }
    const id = req.body.id || req.body._id;
    const data = id
      ? await UserEmploymentDetail.findOneAndUpdate({ _id: id, colid: payload.colid }, payload, { new: true, runValidators: true })
      : await UserEmploymentDetail.create(payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteEmployment = async (req, res) => {
  try {
    const data = await UserEmploymentDetail.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Employment detail not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.uploadDetailDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Select a file to upload" });
    const colid = number(req.body.colid);
    const detailtype = clean(req.body.detailtype);
    const id = clean(req.body.id);
    const documentname = clean(req.body.documentname);
    if (!colid || !id || !documentname || !["Academic Details", "Employment Details"].includes(detailtype)) {
      return res.status(400).json({ success: false, message: "Detail type, record and document name are required" });
    }
    const Model = detailtype === "Academic Details" ? UserAcademicDetail : UserEmploymentDetail;
    const record = await Model.findOne({ _id: id, colid });
    if (!record) return res.status(404).json({ success: false, message: "Record not found" });

    const config = await getAwsConfig(colid);
    if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
      return res.status(400).json({ success: false, message: "AWS configuration is incomplete" });
    }

    const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
    const key = `${colid}/profile-details/${detailtype.replace(/\s+/g, "-")}/${record.owneruser}/${Date.now()}-${cleanName}`;
    const s3 = new AWS.S3({ accessKeyId: config.username, secretAccessKey: config.password, region: config.region });
    await s3.putObject({ Bucket: config.bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }).promise();

    const document = {
      documentname,
      description: clean(req.body.description),
      url: s3Url(config.bucket, config.region, key),
      filename: cleanName,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      key,
      uploadedat: new Date(),
      uploadedby: clean(req.body.uploadedby || req.body.user)
    };
    record.documents = (record.documents || []).filter((doc) => clean(doc.documentname) !== documentname);
    record.documents.push(document);
    await record.save();
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.profile = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const owneruser = clean(req.query.owneruser || req.query.user);
    if (!colid || !owneruser) return res.status(400).json({ success: false, message: "User is required" });
    let user = await User.findOne({ colid, email: owneruser }).lean();
    if (!user && clean(req.query.emailonly) !== "Yes") {
      user = await User.findOne({ colid, $or: [{ user: owneruser }, { regno: owneruser }] }).lean();
    }
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    const ownerEmail = new RegExp(`^${escapeRegex(user.email)}$`, "i");
    const [academic, employment] = await Promise.all([
      UserAcademicDetail.find({ colid, owneruser: ownerEmail }).sort({ passingyear: -1 }).lean(),
      UserEmploymentDetail.find({ colid, owneruser: ownerEmail }).sort({ dateofjoining: -1 }).lean()
    ]);
    res.json({ success: true, user, academic, employment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
