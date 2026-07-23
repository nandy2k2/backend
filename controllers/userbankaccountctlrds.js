const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const User = require("../Models/user");
const Awsconfig = require("../Models/awsconfig");
const UserBankAccount = require("../Models/userbankaccountds");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const clean = (value) => String(value || "").trim();
const number = (value) => Number(value || 0);
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

const ownerPayload = (body) => ({
  owneruser: clean(body.owneruser),
  ownername: clean(body.ownername),
  ownerrole: clean(body.ownerrole),
  regno: clean(body.regno),
  department: clean(body.department)
});

exports.uploadMiddleware = upload.single("file");

exports.searchUsers = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const q = clean(req.query.q || req.query.search);
    const filter = { colid };
    if (q) {
      filter.$or = [
        { name: new RegExp(q, "i") },
        { email: new RegExp(q, "i") },
        { phone: new RegExp(q, "i") },
        { regno: new RegExp(q, "i") }
      ];
    }
    const data = await User.find(filter)
      .select("name email phone regno role department academicyear program programcode semester section")
      .sort({ name: 1 })
      .limit(50)
      .lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.getAccounts = async (req, res) => {
  try {
    const filter = { colid: number(req.query.colid) };
    if (clean(req.query.owneruser)) filter.owneruser = clean(req.query.owneruser);
    if (clean(req.query.ownerrole)) filter.ownerrole = clean(req.query.ownerrole);
    if (clean(req.query.status)) filter.status = clean(req.query.status);
    const data = await UserBankAccount.find(filter).sort({ isdefault: 1, updatedAt: -1 }).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.saveAccount = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const payload = {
      colid,
      ...ownerPayload(req.body),
      bankname: clean(req.body.bankname),
      branchname: clean(req.body.branchname),
      accountholdername: clean(req.body.accountholdername),
      accountnumber: clean(req.body.accountnumber),
      ifsccode: clean(req.body.ifsccode).toUpperCase(),
      accounttype: clean(req.body.accounttype),
      upiid: clean(req.body.upiid),
      isdefault: clean(req.body.isdefault) || "No",
      status: clean(req.body.status) || "Active",
      remarks: clean(req.body.remarks),
      updatedby: clean(req.body.user),
      updatedbyname: clean(req.body.name)
    };

    if (!payload.owneruser || !payload.bankname || !payload.accountnumber) {
      return res.status(400).json({ msg: "User, bank name and account number are required" });
    }

    if (clean(req.body.attachmenturl)) {
      payload.attachment = {
        url: clean(req.body.attachmenturl),
        sourcetype: "Link",
        uploadedat: new Date()
      };
    }

    if (req.file) {
      const config = await getAwsConfig(colid);
      if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
        return res.status(400).json({ msg: "AWS configuration is incomplete" });
      }
      const safeName = path.basename(req.file.originalname).replace(/[^\w.\-() ]/g, "_");
      const key = `${colid}/bank-accounts/${payload.owneruser}/${Date.now()}-${safeName}`;
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
      payload.attachment = {
        url: s3Url(config.bucket, config.region, key),
        sourcetype: "Upload",
        filename: safeName,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        awsconfigid: String(config._id),
        bucket: config.bucket,
        region: config.region,
        key,
        uploadedat: new Date()
      };
    }

    let data;
    if (req.body.id || req.body._id) {
      data = await UserBankAccount.findOneAndUpdate(
        { _id: req.body.id || req.body._id, colid },
        payload,
        { new: true, runValidators: true }
      );
    } else {
      data = await UserBankAccount.create({ ...payload, createdby: clean(req.body.user), createdbyname: clean(req.body.name) });
    }

    if (!data) return res.status(404).json({ msg: "Bank account not found" });
    if (payload.isdefault === "Yes") {
      await UserBankAccount.updateMany(
        { colid, owneruser: payload.owneruser, _id: { $ne: data._id } },
        { $set: { isdefault: "No" } }
      );
    }
    const fresh = await UserBankAccount.findById(data._id).lean();
    res.json(fresh);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const data = await UserBankAccount.findOneAndDelete({
      _id: req.body.id || req.body._id,
      colid: number(req.body.colid)
    });
    if (!data) return res.status(404).json({ msg: "Bank account not found" });
    res.json({ msg: "Deleted" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
