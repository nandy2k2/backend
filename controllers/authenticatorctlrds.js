const crypto = require("crypto");
const User = require("../Models/user");

const GLOBAL_MANDATORY_DATE = new Date("2026-08-15T00:00:00.000Z");
const NEW_ACCOUNT_GRACE_DAYS = 5;
const STEP_SECONDS = 30;
const DIGITS = 6;

const clean = (value) => String(value ?? "").trim();
const normEmail = (value) => clean(value).toLowerCase();
const escapeRegex = (value) => clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isStudent = (user) => clean(user?.role).toLowerCase() === "student";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    out += base32Alphabet[parseInt(chunk, 2)];
  }
  return out;
}

function base32Decode(secret) {
  const normalized = clean(secret).replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";
  for (const char of normalized) {
    const value = base32Alphabet.indexOf(char);
    if (value < 0) continue;
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret, counter) {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  buffer.writeUInt32BE(high, 0);
  buffer.writeUInt32BE(low, 4);
  const hmac = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(binary % (10 ** DIGITS)).padStart(DIGITS, "0");
}

function verifyTotp(secret, token) {
  const code = clean(token).replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code) || !secret) return false;
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (let drift = -1; drift <= 1; drift += 1) {
    if (hotp(secret, counter + drift) === code) return true;
  }
  return false;
}

function accountCreatedAt(user) {
  if (user?.createdAt) return new Date(user.createdAt);
  if (user?._id?.getTimestamp) return user._id.getTimestamp();
  return new Date();
}

function earlierDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? new Date(a) : new Date(b);
}

function buildTwoFactorStatus(user) {
  if (!user || isStudent(user)) return { applicable: false, required: false, skipAllowed: true };
  const now = new Date();
  const createdAt = accountCreatedAt(user);
  const graceUntil = new Date(createdAt.getTime() + NEW_ACCOUNT_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const userEnabled = clean(user.authenticator).toLowerCase() === "yes";
  const mandatoryDate = userEnabled
    ? earlierDate(user.authenticatordate || GLOBAL_MANDATORY_DATE, GLOBAL_MANDATORY_DATE)
    : GLOBAL_MANDATORY_DATE;
  const withinNewAccountGrace = now.getTime() < graceUntil.getTime();
  const requiredByDate = now.getTime() >= mandatoryDate.getTime();
  const required = userEnabled ? requiredByDate : (requiredByDate && !withinNewAccountGrace);
  const setupComplete = Boolean(user.authenticatorsecret && userEnabled);
  const skipAllowed = !required || withinNewAccountGrace;
  return {
    applicable: true,
    enabled: userEnabled,
    setupComplete,
    required,
    skipAllowed,
    mandatoryDate,
    globalMandatoryDate: GLOBAL_MANDATORY_DATE,
    newAccountGraceUntil: graceUntil,
    message: skipAllowed
      ? `Authenticator is mandatory after ${GLOBAL_MANDATORY_DATE.toISOString().slice(0, 10)}. New accounts may skip for ${NEW_ACCOUNT_GRACE_DAYS} days.`
      : "Authenticator verification is mandatory for this login."
  };
}

async function findUser(bodyOrQuery = {}) {
  const colid = Number(bodyOrQuery.colid);
  const email = normEmail(bodyOrQuery.email || bodyOrQuery.user);
  const id = clean(bodyOrQuery.id);
  if (id && colid) return User.findOne({ _id: id, colid });
  if (!email || !colid) return null;
  return User.findOne({ colid, email: new RegExp(`^${escapeRegex(email)}$`, "i") });
}

function otpauthUrl(user, secret) {
  const issuer = encodeURIComponent("CampusTechnology");
  const label = encodeURIComponent(`CampusTechnology:${user.email}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

exports.statusForUser = buildTwoFactorStatus;

exports.setup = async (req, res) => {
  try {
    const user = await findUser(req.body);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (isStudent(user)) return res.json({ success: true, twofa: buildTwoFactorStatus(user) });
    if (!user.authenticatorsecret) {
      user.authenticatorsecret = generateSecret();
      await user.save();
    }
    res.json({
      success: true,
      secret: user.authenticatorsecret,
      otpauth: otpauthUrl(user, user.authenticatorsecret),
      twofa: buildTwoFactorStatus(user)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.verify = async (req, res) => {
  try {
    const user = await findUser(req.body);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (isStudent(user)) return res.json({ success: true, twofa: buildTwoFactorStatus(user) });
    if (!user.authenticatorsecret) return res.status(400).json({ success: false, message: "Authenticator is not set up" });
    if (!verifyTotp(user.authenticatorsecret, req.body.code)) {
      return res.status(400).json({ success: false, message: "Invalid authenticator code" });
    }
    user.authenticator = "Yes";
    user.authenticatorsetupdate = new Date();
    if (!user.authenticatordate) user.authenticatordate = new Date();
    await user.save();
    res.json({ success: true, twofa: buildTwoFactorStatus(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.adminUpdate = async (req, res) => {
  try {
    const user = await findUser(req.body);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    user.authenticator = clean(req.body.authenticator || user.authenticator || "No") === "Yes" ? "Yes" : "No";
    user.authenticatordate = req.body.authenticatordate ? new Date(req.body.authenticatordate) : undefined;
    if (req.body.resetsecret === true || req.body.resetsecret === "Yes") {
      user.authenticatorsecret = undefined;
      user.authenticatorsetupdate = undefined;
      if (user.authenticator === "Yes") user.authenticator = "No";
    }
    await user.save();
    res.json({ success: true, data: user, twofa: buildTwoFactorStatus(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
