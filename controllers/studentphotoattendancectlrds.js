const path = require("path");
const multer = require("multer");
const AWS = require("aws-sdk");
const User = require("../Models/user");
const Awsconfig = require("../Models/awsconfig");
const AiConfiguration = require("../Models/aiconfigurationds");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

exports.uploadMiddleware = upload.single("file");
exports.groupPhotosMiddleware = upload.fields([
  { name: "files", maxCount: 10 },
  { name: "file", maxCount: 10 }
]);

const text = (value) => String(value || "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const encodeS3Key = (key) => String(key || "").split("/").map(encodeURIComponent).join("/");
const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === "us-east-1") return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const getDefaultAwsConfig = async (colid) => Awsconfig.findOne({
  colid: Number(colid),
  type: /^aws$/i,
  default: /^yes$/i
}).sort({ _id: -1 }).lean();

const getGeminiConfig = async (colid) => AiConfiguration.findOne({
  colid: Number(colid),
  type: /^Gemini$/i,
  active: /^yes$/i,
  default: /^yes$/i
}).sort({ _id: -1 }).lean()
  || AiConfiguration.findOne({
    colid: Number(colid),
    type: /^Gemini$/i,
    active: /^yes$/i
  }).sort({ _id: -1 }).lean();

const uploadToAws = async ({ colid, buffer, originalname, mimetype, folder }) => {
  const config = await getDefaultAwsConfig(colid);
  if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
    throw new Error("Default AWS configuration is incomplete");
  }
  const cleanName = path.basename(originalname || "photo.jpg").replace(/[^\w.\-() ]/g, "_");
  const key = `${colid}/${folder}/${Date.now()}-${cleanName}`;
  const s3 = new AWS.S3({
    accessKeyId: config.username,
    secretAccessKey: config.password,
    region: config.region
  });
  await s3.putObject({
    Bucket: config.bucket,
    Key: key,
    Body: buffer,
    ContentType: mimetype || "application/octet-stream"
  }).promise();
  return {
    bucket: config.bucket,
    region: config.region,
    key,
    url: s3Url(config.bucket, config.region, key)
  };
};

const studentSelect = "name email phone regno admissionyear academicyear program programcode regulation Major Minor semester section category gender department photo colid status role";
const userSelect = "name email user phone regno admissionyear academicyear program programcode regulation Major Minor semester section category gender department designation institution photo colid status role";

const studentQueryFrom = (source = {}) => {
  const colid = number(source.colid);
  const query = { colid, role: /^Student$/i };
  [
    "admissionyear",
    "academicyear",
    "program",
    "programcode",
    "regulation",
    "Major",
    "Minor",
    "semester",
    "section",
    "category",
    "gender",
    "department"
  ].forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  ["name", "email", "phone", "regno"].forEach((field) => {
    if (text(source[field])) query[field] = new RegExp(escapeRegex(text(source[field])), "i");
  });
  return query;
};

const fetchImageAsBase64 = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load student photo from ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return {
    mimeType: contentType.split(";")[0] || "image/jpeg",
    data: Buffer.from(arrayBuffer).toString("base64")
  };
};

const extractJson = (value) => {
  const raw = text(value).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch (err) {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw err;
  }
};

const callGeminiVision = async ({ apikey, model, groupFile, candidates }) => {
  const parts = [
    {
      text: `You are helping a teacher mark class attendance from a group photo.

The first image is the group classroom photo.
The following images are reference student photos. Each reference image is introduced by text containing studentid, name and regno.

Task:
1. Compare each reference student with the group photo.
2. Return JSON array only.
3. For every candidate return:
   studentid, regno, student, attendance, confidence, reason
4. attendance must be "Present" or "Absent".
5. confidence must be a number from 0 to 100.
6. If uncertain, mark Absent and explain uncertainty briefly.
7. Do not include markdown or extra text.`
    },
    {
      inline_data: {
        mime_type: groupFile.mimetype || "image/jpeg",
        data: groupFile.buffer.toString("base64")
      }
    }
  ];

  candidates.forEach((candidate, index) => {
    parts.push({
      text: `Reference student ${index + 1}: studentid=${candidate.studentid}; name=${candidate.student}; regno=${candidate.regno}`
    });
    parts.push({
      inline_data: {
        mime_type: candidate.photoMimeType,
        data: candidate.photoBase64
      }
    });
  });

  const models = [...new Set([text(model), "gemini-2.5-flash", "gemini-2.0-flash"].filter(Boolean))];
  let lastError = "";
  for (const modelName of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apikey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    });
    const data = await response.json();
    if (response.ok) {
      return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "[]";
    }
    lastError = data.error?.message || `Gemini request failed for ${modelName}`;
  }
  throw new Error(lastError || "Gemini request failed");
};

exports.searchStudents = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await User.find(studentQueryFrom(req.query))
      .select(studentSelect)
      .sort({ name: 1, regno: 1 })
      .limit(1000)
      .lean();
    const options = {};
    const optionFields = [
      "admissionyear",
      "academicyear",
      "program",
      "programcode",
      "regulation",
      "Major",
      "Minor",
      "semester",
      "section",
      "category",
      "gender",
      "department",
      "name",
      "email",
      "phone",
      "regno"
    ];
    await Promise.all(optionFields.map(async (field) => {
      const querySource = { ...req.query, [field]: "" };
      const rows = await User.find(studentQueryFrom(querySource))
        .select(field)
        .sort({ [field]: 1 })
        .limit(1000)
        .lean();
      options[field] = [...new Set(rows.map((row) => text(row[field])).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }));
    res.json({ success: true, data, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadStudentPhoto = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const studentid = text(req.body.studentid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!studentid) return res.status(400).json({ success: false, message: "studentid is required" });
    if (!req.file) return res.status(400).json({ success: false, message: "Photo file is required" });
    if (!/^image\//i.test(req.file.mimetype || "")) {
      return res.status(400).json({ success: false, message: "Only image files are allowed" });
    }
    const uploaded = await uploadToAws({
      colid,
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      folder: "student-photos"
    });
    const data = await User.findOneAndUpdate(
      { _id: studentid, colid, role: /^Student$/i },
      { photo: uploaded.url },
      { new: true }
    ).select(studentSelect).lean();
    if (!data) return res.status(404).json({ success: false, message: "Student not found" });
    res.json({ success: true, data, url: uploaded.url });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.searchUsersForPhoto = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    [
      "role", "admissionyear", "academicyear", "program", "programcode", "regulation",
      "Major", "Minor", "semester", "section", "category", "gender", "department", "designation"
    ].forEach((field) => {
      if (text(req.query[field])) query[field] = text(req.query[field]);
    });
    ["name", "email", "phone", "regno"].forEach((field) => {
      if (text(req.query[field])) query[field] = new RegExp(escapeRegex(text(req.query[field])), "i");
    });
    const data = await User.find(query).select(userSelect).sort({ name: 1, email: 1 }).limit(1000).lean();
    const optionFields = [
      "role", "admissionyear", "academicyear", "program", "programcode", "regulation",
      "Major", "Minor", "semester", "section", "category", "gender", "department",
      "designation", "name", "email", "phone", "regno"
    ];
    const options = {};
    await Promise.all(optionFields.map(async (field) => {
      const querySource = { ...req.query, [field]: "" };
      const optionQuery = { colid };
      [
        "role", "admissionyear", "academicyear", "program", "programcode", "regulation",
        "Major", "Minor", "semester", "section", "category", "gender", "department", "designation"
      ].forEach((item) => {
        if (text(querySource[item])) optionQuery[item] = text(querySource[item]);
      });
      ["name", "email", "phone", "regno"].forEach((item) => {
        if (text(querySource[item])) optionQuery[item] = new RegExp(escapeRegex(text(querySource[item])), "i");
      });
      const rows = await User.find(optionQuery).select(field).sort({ [field]: 1 }).limit(1000).lean();
      options[field] = [...new Set(rows.map((row) => text(row[field])).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }));
    res.json({ success: true, data, options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.uploadUserPhoto = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    const userid = text(req.body.userid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!userid) return res.status(400).json({ success: false, message: "userid is required" });
    if (!req.file) return res.status(400).json({ success: false, message: "Photo file is required" });
    if (!/^image\//i.test(req.file.mimetype || "")) {
      return res.status(400).json({ success: false, message: "Only image files are allowed" });
    }
    const uploaded = await uploadToAws({
      colid,
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      folder: "user-photos"
    });
    const data = await User.findOneAndUpdate(
      { _id: userid, colid },
      { photo: uploaded.url },
      { new: true }
    ).select(userSelect).lean();
    if (!data) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data, url: uploaded.url });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.analyzePhotoAttendance = async (req, res) => {
  try {
    const colid = number(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const groupFiles = [
      ...(req.files?.files || []),
      ...(req.files?.file || []),
      ...(req.file ? [req.file] : [])
    ];
    if (!groupFiles.length) return res.status(400).json({ success: false, message: "At least one group photo is required" });
    if (groupFiles.some((file) => !/^image\//i.test(file.mimetype || ""))) {
      return res.status(400).json({ success: false, message: "Only image files are allowed" });
    }

    const students = JSON.parse(req.body.students || "[]");
    if (!Array.isArray(students) || !students.length) {
      return res.status(400).json({ success: false, message: "Select at least one student" });
    }

    const groupPhotos = await Promise.all(groupFiles.map((file) => uploadToAws({
      colid,
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      folder: "nep-lms/photo-attendance"
    })));

    const aiConfig = await getGeminiConfig(colid);
    if (!aiConfig?.apikey) {
      return res.status(400).json({ success: false, message: "Active/default Gemini AI configuration is missing" });
    }

    const usable = [];
    const missing = [];
    for (const student of students) {
      const photo = text(student.photo);
      if (!photo) {
        missing.push({
          studentid: text(student.studentid || student._id),
          regno: text(student.regno),
          student: text(student.name || student.student),
          attendance: "Absent",
          confidence: 0,
          reason: "No reference photo available"
        });
        continue;
      }
      try {
        const image = await fetchImageAsBase64(photo);
        usable.push({
          studentid: text(student.studentid || student._id),
          regno: text(student.regno),
          student: text(student.name || student.student),
          photoMimeType: image.mimeType,
          photoBase64: image.data
        });
      } catch (err) {
        missing.push({
          studentid: text(student.studentid || student._id),
          regno: text(student.regno),
          student: text(student.name || student.student),
          attendance: "Absent",
          confidence: 0,
          reason: "Reference photo could not be loaded"
        });
      }
    }

    const analyzedRows = [];
    if (usable.length) {
      for (let index = 0; index < groupFiles.length; index += 1) {
        const raw = await callGeminiVision({
          apikey: aiConfig.apikey,
          model: req.body.model,
          groupFile: groupFiles[index],
          candidates: usable
        });
        const parsed = extractJson(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((row) => analyzedRows.push({
            ...row,
            photoIndex: index + 1,
            photoUrl: groupPhotos[index]?.url || ""
          }));
        }
      }
    }

    const byId = new Map();
    analyzedRows.forEach((row) => {
      const studentid = text(row.studentid);
      const existing = byId.get(studentid);
      const currentPresent = /^present$/i.test(text(row.attendance));
      const existingPresent = /^present$/i.test(text(existing?.attendance));
      if (!existing || (currentPresent && !existingPresent) || Number(row.confidence || 0) > Number(existing.confidence || 0)) {
        byId.set(studentid, row);
      }
    });
    missing.forEach((row) => {
      const studentid = text(row.studentid);
      if (!byId.has(studentid)) byId.set(studentid, row);
    });
    const data = students.map((student) => {
      const studentid = text(student.studentid || student._id);
      const result = byId.get(studentid);
      const presentIn = analyzedRows
        .filter((row) => text(row.studentid) === studentid && /^present$/i.test(text(row.attendance)))
        .map((row) => `Photo ${row.photoIndex}`)
        .join(", ");
      return {
        studentid,
        _id: studentid,
        student: text(student.name || student.student),
        name: text(student.name || student.student),
        email: text(student.email || student.studentemail),
        phone: text(student.phone || student.studentphone),
        regno: text(student.regno),
        photo: text(student.photo),
        attendanceText: /^present$/i.test(text(result?.attendance)) ? "Present" : "Absent",
        attendance: /^present$/i.test(text(result?.attendance)) ? 1 : 0,
        confidence: Number(result?.confidence || 0),
        reason: presentIn ? `${text(result?.reason)} Found in ${presentIn}` : text(result?.reason)
      };
    });

    res.json({
      success: true,
      data,
      groupPhotoUrl: groupPhotos[0]?.url || "",
      groupPhotoUrls: groupPhotos.map((item) => item.url),
      analyzed: usable.length,
      missingPhotos: missing.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
