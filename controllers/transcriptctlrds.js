const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const AWS = require('aws-sdk');
const EmailConfiguration = require('../Models/emailconfigurationds');
const AiConfiguration = require('../Models/aiconfigurationds');
const OllamaConfiguration = require('../Models/ollamaconfigurationds');
const Awsconfig = require('../Models/awsconfig');
const AwsFileLibrary = require('../Models/awsfilelibraryds');
const TranscriptMeeting = require('../Models/transcriptmeetingds');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }
});

exports.uploadAudioMiddleware = upload.single('audio');

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const text = (value) => String(value || '').trim();

const encodeS3Key = (key) => String(key || '').split('/').map(encodeURIComponent).join('/');

const s3Url = (bucket, region, key) => {
  const encodedKey = encodeS3Key(key);
  if (region === 'us-east-1') return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const cleanFilename = (filename) => path.basename(filename || 'recorded-media.webm').replace(/[^\w.\-() ]/g, '_');

const getSmtpHost = (config = {}) => {
  if (config.smtp) return config.smtp;
  if (config.smptp) return config.smptp;
  if (/gmail/i.test(config.provider || '')) return 'smtp.gmail.com';
  return '';
};

const createTransporter = (config) => {
  const port = Number(config.port) || 587;
  return nodemailer.createTransport({
    host: getSmtpHost(config),
    port,
    secure: ['yes', 'true'].includes(String(config.secure || '').toLowerCase()) || port === 465,
    auth: {
      user: config.username,
      pass: config.password
    }
  });
};

const loadDefaultEmailConfig = async (colid) => {
  const baseQuery = { colid, isactive: /^Yes$/i };
  return await EmailConfiguration.findOne({ ...baseQuery, default: /^Yes$/i }).lean()
    || await EmailConfiguration.findOne(baseQuery).sort({ updatedAt: -1, createdAt: -1 }).lean();
};

const loadDefaultGeminiConfig = async (colid) => {
  const baseQuery = { colid, type: /^Gemini$/i, active: /^Yes$/i };
  return await AiConfiguration.findOne({ ...baseQuery, default: /^Yes$/i }).lean()
    || await AiConfiguration.findOne(baseQuery).sort({ updatedAt: -1, createdAt: -1 }).lean();
};

const loadOllamaConfig = async (colid, configId) => {
  const baseQuery = { colid, active: /^Yes$/i };
  if (text(configId)) {
    const selected = await OllamaConfiguration.findOne({ ...baseQuery, _id: configId }).lean();
    if (selected) return selected;
  }
  return await OllamaConfiguration.findOne({ ...baseQuery, default: /^Yes$/i }).sort({ _id: -1 }).lean()
    || await OllamaConfiguration.findOne(baseQuery).sort({ _id: -1 }).lean();
};

const loadDefaultAwsConfig = async (colid) => {
  const baseQuery = { colid, type: /^aws$/i };
  return await Awsconfig.findOne({ ...baseQuery, default: /^Yes$/i }).sort({ _id: -1 }).lean()
    || await Awsconfig.findOne(baseQuery).sort({ _id: -1 }).lean();
};

const readGeminiText = (payload = {}) => {
  const parts = payload.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || '').join('\n').trim();
};

const callGeminiText = async ({ colid, model, prompt }) => {
  const config = await loadDefaultGeminiConfig(colid);
  if (!config?.apikey) throw new Error('Default active Gemini AI configuration is missing');
  const selectedModel = text(model) || 'gemini-2.5-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35 }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || 'Gemini analysis failed');
  return readGeminiText(payload);
};

const callOllamaText = async ({ colid, ollamaConfigId, prompt }) => {
  const config = await loadOllamaConfig(colid, ollamaConfigId);
  if (!config?.serveraddress || !config?.modelname) throw new Error('Active Ollama configuration is missing');
  const server = text(config.serveraddress || 'http://localhost:11434').replace(/\/+$/, '');
  const response = await fetch(`${server}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: text(config.modelname), prompt, stream: false, options: { temperature: 0.35 } })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Ollama analysis failed');
  return payload.response || '';
};

const parseGeminiJson = (value) => {
  const raw = text(value);
  if (!raw) return {};
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch (innerErr) {
      return {};
    }
  }
};

const buildTranscriptPrompt = (translateToEnglish) => `Analyze the uploaded audio or video recording and return only valid JSON with these exact keys:
{
  "transcript": "accurate transcript in the original spoken language",
  "englishTranslation": "${translateToEnglish ? 'English translation of the transcript' : ''}",
  "summary": "concise summary of the recording",
  "actionItems": "clear bullet list of action items, decisions, owners, and deadlines if available"
}
Do not include markdown, code fences, or commentary. ${translateToEnglish ? 'Translate the transcript to English.' : 'Keep englishTranslation as an empty string.'}`;

const buildMeetingAnalysisPrompt = ({ meetingTitle, transcript, additionalPrompt }) => `Analyze this meeting transcript and return only valid JSON with these exact keys:
{
  "summary": "clear professional summary of the meeting",
  "actionItems": "bullet list of action items with owners and deadlines where available",
  "decisions": "bullet list of decisions made",
  "risks": "bullet list of open risks or blockers"
}

Meeting title: ${text(meetingTitle) || 'Live meeting'}

Transcript:
${text(transcript)}

Additional user instructions:
${text(additionalPrompt) || 'None'}

Do not include markdown fences or commentary.`;

const uploadTranscriptAudioToAws = async ({ colid, file, user }) => {
  const config = await loadDefaultAwsConfig(colid);
  if (!config?.username || !config?.password || !config?.bucket || !config?.region) {
    throw new Error('Default AWS configuration is missing or incomplete');
  }

  const folder = 'transcript-recordings';
  const filename = cleanFilename(file.originalname);
  const key = `${colid}/${folder}/${Date.now()}-${filename}`;
  const s3 = new AWS.S3({
    accessKeyId: config.username,
    secretAccessKey: config.password,
    region: config.region
  });

  await s3.putObject({
    Bucket: config.bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || 'application/octet-stream'
  }).promise();

  const url = s3Url(config.bucket, config.region, key);
  return AwsFileLibrary.create({
    colid,
    user: user || '',
    uploadedby: user || '',
    awsconfigid: String(config._id),
    configname: config.name || '',
    bucket: config.bucket,
    region: config.region,
    key,
    filename,
    originalname: file.originalname || filename,
    mimetype: file.mimetype || 'application/octet-stream',
    size: file.size,
    url,
    folder,
    description: 'Transcript recorder media'
  });
};

exports.transcribeWithGemini = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, msg: 'colid is required' });
    if (!req.file?.buffer) return res.status(400).json({ success: false, msg: 'Recorded media file is required' });

    const audioFile = await uploadTranscriptAudioToAws({
      colid,
      file: req.file,
      user: text(req.body.user)
    });

    const config = await loadDefaultGeminiConfig(colid);
    if (!config?.apikey) {
      return res.status(400).json({ success: false, msg: 'Default active Gemini AI configuration is missing' });
    }

    const model = text(req.body.model) || 'gemini-2.5-flash';
    const translateToEnglish = ['yes', 'true', '1', 'on'].includes(text(req.body.translateToEnglish).toLowerCase());
    const prompt = text(req.body.prompt) || buildTranscriptPrompt(translateToEnglish);
    const audioBase64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'audio/webm';

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apikey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: audioBase64
              }
            }
          ]
        }]
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      return res.status(400).json({
        success: false,
        msg: payload.error?.message || 'Gemini transcription failed'
      });
    }

    const resultText = readGeminiText(payload);
    const structured = parseGeminiJson(resultText);
    const transcript = text(structured.transcript) || resultText;
    if (!transcript) return res.status(400).json({ success: false, msg: 'Gemini did not return transcript text' });

    const result = {
      success: true,
      transcript,
      englishTranslation: translateToEnglish ? text(structured.englishTranslation) : '',
      summary: text(structured.summary),
      actionItems: text(structured.actionItems),
      audioFile
    };

    const meetingId = text(req.body.meetingId || req.body.meetingid);
    if (meetingId) {
      const updatedMeeting = await TranscriptMeeting.findOneAndUpdate(
        { _id: meetingId, colid },
        {
          transcript: result.transcript,
          englishTranslation: result.englishTranslation,
          summary: result.summary,
          actionItems: result.actionItems,
          audioFile,
          audioUrl: audioFile?.url || '',
          analyzedAt: new Date()
        },
        { new: true }
      ).lean();
      if (!updatedMeeting) return res.status(404).json({ success: false, msg: 'Meeting not found for saving transcript' });
      result.meeting = updatedMeeting;
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
};

const escapeHtml = (value) => text(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

exports.sendTranscriptEmail = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const to = text(req.body.to);
    const cc = text(req.body.cc);
    const subject = text(req.body.subject) || 'Audio transcript';
    const transcript = text(req.body.transcript);
    const senderName = text(req.body.senderName || req.body.name) || 'Institution';

    if (colid === undefined) return res.status(400).json({ success: false, msg: 'colid is required' });
    if (!/\S+@\S+\.\S+/.test(to)) return res.status(400).json({ success: false, msg: 'Valid recipient email is required' });
    if (!transcript) return res.status(400).json({ success: false, msg: 'Transcript text is required' });

    const config = await loadDefaultEmailConfig(colid);
    if (!config?.username || !config?.password || !getSmtpHost(config)) {
      return res.status(400).json({ success: false, msg: 'Default active email configuration is missing or incomplete' });
    }

    const html = transcript
      .split('\n')
      .map((line) => `<p>${escapeHtml(line) || '&nbsp;'}</p>`)
      .join('');

    const transporter = createTransporter(config);
    await transporter.sendMail({
      from: `"${senderName}" <${config.username}>`,
      to,
      cc: cc || undefined,
      subject,
      text: transcript,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827">${html}</div>`
    });

    res.json({ success: true, msg: 'Transcript email sent successfully' });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
};

exports.analyzeTranscriptText = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    if (colid === undefined) return res.status(400).json({ success: false, msg: 'colid is required' });
    const transcript = text(req.body.transcript);
    if (!transcript) return res.status(400).json({ success: false, msg: 'Transcript text is required' });
    const prompt = buildMeetingAnalysisPrompt({
      meetingTitle: req.body.meetingTitle || req.body.title,
      transcript,
      additionalPrompt: req.body.additionalPrompt || req.body.prompt
    });
    const provider = text(req.body.provider).toLowerCase();
    const raw = provider === 'ollama'
      ? await callOllamaText({ colid, ollamaConfigId: req.body.ollamaConfigId || req.body.ollamaId, prompt })
      : await callGeminiText({ colid, model: req.body.model, prompt });
    const structured = parseGeminiJson(raw);
    res.json({
      success: true,
      summary: text(structured.summary) || raw,
      actionItems: text(structured.actionItems),
      decisions: text(structured.decisions),
      risks: text(structured.risks),
      raw
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
};
