const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const InstitutionPolicy = require("../Models/institutionpolicyds");
const Awsconfig = require("../Models/awsconfig");

const upload = multer({ storage: multer.memoryStorage() });
const clean = (value) => String(value || "").trim();
const policyTypes = ["Privacy Policy", "Terms and Conditions", "Refund Policy"];

const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const getDefaultAwsConfig = async (colid) => {
  const query = { colid: Number(colid), type: /^aws$/i };
  return Awsconfig.findOne(query).sort({ default: -1, _id: -1 }).lean();
};

const buildQuery = (source = {}) => {
  const query = {};
  if (source.colid) query.colid = Number(source.colid);
  if (source.policytype) query.policytype = clean(source.policytype);
  if (source.status) query.status = clean(source.status);
  return query;
};

exports.uploadMiddleware = upload.single("file");

exports.getPolicyTypes = async (req, res) => {
  res.json({ success: true, policytypes: policyTypes });
};

exports.getPolicies = async (req, res) => {
  try {
    const query = buildQuery(req.query);
    if (!query.colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await InstitutionPolicy.find(query).sort({ policytype: 1, updatedAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.savePolicy = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const policytype = clean(req.body.policytype);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!policytype) return res.status(400).json({ success: false, message: "Policy type is required" });

    const payload = {
      colid,
      user: clean(req.body.user),
      name: clean(req.body.name),
      policytype,
      title: clean(req.body.title) || policytype,
      description: clean(req.body.description),
      sourcetype: clean(req.body.sourcetype) || (req.file ? "Upload" : "Link"),
      url: clean(req.body.url),
      status: clean(req.body.status) || "Active"
    };

    if (req.file) {
      const config = await getDefaultAwsConfig(colid);
      if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
        return res.status(400).json({ success: false, message: "Default AWS configuration is incomplete" });
      }
      const cleanName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
      const safeType = policytype.replace(/[^\w-]+/g, "_");
      const key = `${colid}/institution-policies/${safeType}/${Date.now()}-${cleanName}`;
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
      Object.assign(payload, {
        sourcetype: "Upload",
        url: s3Url(config.bucket, config.region, key),
        awsconfigid: String(config._id),
        bucket: config.bucket,
        region: config.region,
        key,
        filename: cleanName,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    }

    if (!payload.url) return res.status(400).json({ success: false, message: "Upload a file or provide a link" });

    const data = req.body.id
      ? await InstitutionPolicy.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
      : await InstitutionPolicy.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "Policy not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deletePolicy = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const policy = await InstitutionPolicy.findOne({ _id: req.body.id, colid });
    if (!policy) return res.status(404).json({ success: false, message: "Policy not found" });

    if (policy.key && policy.bucket) {
      const config = await Awsconfig.findOne({ _id: policy.awsconfigid, colid }).lean();
      if (config?.username && config?.password) {
        const s3 = new AWS.S3({
          accessKeyId: config.username,
          secretAccessKey: config.password,
          region: policy.region || config.region
        });
        await s3.deleteObject({ Bucket: policy.bucket, Key: policy.key }).promise().catch(() => {});
      }
    }

    await InstitutionPolicy.findByIdAndDelete(policy._id);
    res.json({ success: true, message: "Policy deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
