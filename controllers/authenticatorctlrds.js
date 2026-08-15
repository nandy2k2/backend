const crypto = require("crypto");
const User = require("../Models/user");

const GLOBAL_MANDATORY_DATE = new Date("2026-08-15T00:00:00.000Z");
const AUTHENTICATOR_NO_MANDATORY_DATE = new Date("2027-01-01T00:00:00.000Z");
const NEW_ACCOUNT_GRACE_DAYS = 5;
const TRUST_DEVICE_DAYS = 3;
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

function signingKey(user) {
  return crypto
    .createHash("sha256")
    .update(`${process.env.JWT_SECRET || "campus-technology"}:${user.authenticatorsecret || ""}:${user.authenticatorsetupdate ? new Date(user.authenticatorsetupdate).getTime() : ""}`)
    .digest();
}

function signPayload(payload, user) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", signingKey(user)).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function readSignedPayload(token, user) {
  const [body, sig] = clean(token).split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", signingKey(user)).update(body).digest("base64url");
  const given = Buffer.from(sig);
  const target = Buffer.from(expected);
  if (given.length !== target.length || !crypto.timingSafeEqual(given, target)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function createTrustToken(user, deviceId) {
  const now = Date.now();
  return signPayload({
    sub: String(user._id),
    colid: Number(user.colid),
    email: normEmail(user.email),
    deviceId: clean(deviceId),
    iat: now,
    exp: now + TRUST_DEVICE_DAYS * 24 * 60 * 60 * 1000
  }, user);
}

function verifyTrustToken(user, token, deviceId) {
  const payload = readSignedPayload(token, user);
  if (!payload) return false;
  return String(payload.sub) === String(user._id)
    && Number(payload.colid) === Number(user.colid)
    && normEmail(payload.email) === normEmail(user.email)
    && clean(payload.deviceId) === clean(deviceId)
    && Number(payload.exp || 0) > Date.now();
}

function accountCreatedAt(user) {
  if (user?.createdAt) return new Date(user.createdAt);
  if (user?._id?.getTimestamp) return user._id.getTimestamp();
  return new Date();
}

function buildTwoFactorStatus(user) {
  if (!user || isStudent(user)) return { applicable: false, required: false, skipAllowed: true };
  const now = new Date();
  const createdAt = accountCreatedAt(user);
  const graceUntil = new Date(createdAt.getTime() + NEW_ACCOUNT_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const userEnabled = clean(user.authenticator).toLowerCase() === "yes";
  const userMandatoryDate = user.authenticatordate ? new Date(user.authenticatordate) : null;
  const mandatoryDate = userMandatoryDate && !Number.isNaN(userMandatoryDate.getTime())
    ? userMandatoryDate
    : (userEnabled ? GLOBAL_MANDATORY_DATE : AUTHENTICATOR_NO_MANDATORY_DATE);
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
    authenticatorNoMandatoryDate: AUTHENTICATOR_NO_MANDATORY_DATE,
    newAccountGraceUntil: graceUntil,
    message: skipAllowed
      ? `Authenticator is mandatory for this account after ${mandatoryDate.toISOString().slice(0, 10)}. New accounts may skip for ${NEW_ACCOUNT_GRACE_DAYS} days.`
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

async function findManagedUser(bodyOrQuery = {}) {
  const colid = Number(bodyOrQuery.colid);
  const id = clean(bodyOrQuery.id);
  if (!id || !colid) return null;
  return User.findOne({
    _id: id,
    colid,
    $nor: [{ role: /^student$/i }]
  });
}

function otpauthUrl(user, secret) {
  const issuer = encodeURIComponent("CampusTechnology");
  const label = encodeURIComponent(`CampusTechnology:${user.email}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

exports.statusForUser = buildTwoFactorStatus;

exports.listManagedUsers = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "College id is required" });
    const search = clean(req.query.search);
    const query = {
      colid,
      $nor: [{ role: /^student$/i }]
    };
    if (search) {
      query.$and = [{
        $or: ["name", "email", "googleemail", "role", "department", "designation"].map((field) => ({
          [field]: { $regex: search, $options: "i" }
        }))
      }];
    }
    const data = await User.find(query)
      .select("name email googleemail role department designation regno status colid authenticator authenticatordate authenticatorsetupdate")
      .sort({ role: 1, name: 1, email: 1 })
      .lean();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

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
    if (!user.authenticatorsetupdate) user.authenticatorsetupdate = new Date();
    if (!user.authenticatordate) user.authenticatordate = new Date();
    await user.save();
    const trustDevice = req.body.trustDevice === true || clean(req.body.trustDevice).toLowerCase() === "yes";
    const deviceId = clean(req.body.deviceId);
    const trustToken = trustDevice && deviceId ? createTrustToken(user, deviceId) : "";
    res.json({
      success: true,
      twofa: buildTwoFactorStatus(user),
      trustToken,
      trustedUntil: trustToken ? new Date(Date.now() + TRUST_DEVICE_DAYS * 24 * 60 * 60 * 1000) : null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.trustCheck = async (req, res) => {
  try {
    const user = await findUser(req.body);
    if (!user) return res.status(404).json({ success: false, trusted: false, message: "User not found" });
    if (isStudent(user)) return res.json({ success: true, trusted: true, twofa: buildTwoFactorStatus(user) });
    const twofa = buildTwoFactorStatus(user);
    if (!twofa.applicable || !twofa.setupComplete) return res.json({ success: true, trusted: false, twofa });
    const trusted = verifyTrustToken(user, req.body.trustToken, req.body.deviceId);
    res.json({ success: true, trusted, twofa });
  } catch (err) {
    res.status(500).json({ success: false, trusted: false, message: err.message });
  }
};

exports.adminUpdate = async (req, res) => {
  try {
    const user = await findManagedUser(req.body);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    user.authenticator = clean(req.body.authenticator || user.authenticator || "No") === "Yes" ? "Yes" : "No";
    if (Object.prototype.hasOwnProperty.call(req.body, "authenticatordate")) {
      user.authenticatordate = req.body.authenticatordate ? new Date(req.body.authenticatordate) : undefined;
    }
    if (req.body.resetsecret === true || req.body.resetsecret === "Yes") {
      user.authenticatorsecret = undefined;
      user.authenticatorsetupdate = undefined;
    }
    await user.save();
    res.json({ success: true, data: user, twofa: buildTwoFactorStatus(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.adminBulkUpdate = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(clean).filter(Boolean) : [];
    if (!colid) return res.status(400).json({ success: false, message: "College id is required" });
    if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one user" });

    const hasAuthenticator = ["Yes", "No"].includes(clean(req.body.authenticator));
    const hasDate = Object.prototype.hasOwnProperty.call(req.body, "authenticatordate");
    const resetSecret = req.body.resetsecret === true || req.body.resetsecret === "Yes";
    if (!hasAuthenticator && !hasDate && !resetSecret) {
      return res.status(400).json({ success: false, message: "Select at least one bulk action" });
    }

    const users = await User.find({
      _id: { $in: ids },
      colid,
      $nor: [{ role: /^student$/i }]
    });
    if (!users.length) return res.status(404).json({ success: false, message: "No matching users found" });

    const updated = [];
    for (const user of users) {
      if (hasAuthenticator) user.authenticator = clean(req.body.authenticator);
      if (hasDate) {
        user.authenticatordate = req.body.authenticatordate ? new Date(req.body.authenticatordate) : undefined;
      }
      if (resetSecret) {
        user.authenticatorsecret = undefined;
        user.authenticatorsetupdate = undefined;
      }
      await user.save();
      updated.push({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        authenticator: user.authenticator,
        authenticatordate: user.authenticatordate,
        authenticatorsetupdate: user.authenticatorsetupdate
      });
    }

    res.json({
      success: true,
      matched: users.length,
      updated: updated.length,
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
