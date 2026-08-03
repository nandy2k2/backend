const User = require('../Models/user');
const Institution = require('../Models/institutions');
const https = require('https');

const clean = (value) => String(value || '').trim();
const dateAfterDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
const normEmail = (value) => clean(value).toLowerCase();

const verifyGoogleCredential = (credential) => new Promise((resolve, reject) => {
  const token = encodeURIComponent(clean(credential));
  if (!token) return reject(new Error('Google credential is required'));
  https.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`, (response) => {
    let raw = '';
    response.on('data', (chunk) => { raw += chunk; });
    response.on('end', () => {
      try {
        const data = JSON.parse(raw || '{}');
        if (response.statusCode !== 200) return reject(new Error(data.error_description || data.error || 'Google token verification failed'));
        if (data.email_verified !== true && data.email_verified !== 'true') return reject(new Error('Google email is not verified'));
        const configuredClientId = clean(process.env.GOOGLE_CLIENT_ID || process.env.REACT_APP_GOOGLE_CLIENT_ID);
        if (configuredClientId && data.aud !== configuredClientId) return reject(new Error('Google token audience does not match configured client id'));
        resolve(data);
      } catch (err) {
        reject(err);
      }
    });
  }).on('error', reject);
});

exports.createPublicAccount = async (req, res) => {
  try {
    const hasGoogleCredential = Boolean(clean(req.body.googleCredential));
    const googleProfile = hasGoogleCredential ? await verifyGoogleCredential(req.body.googleCredential) : null;
    const name = clean(googleProfile?.name || req.body.name);
    const email = normEmail(googleProfile?.email || req.body.email);
    const phone = clean(req.body.phone);
    const password = hasGoogleCredential ? (clean(req.body.password) || 'Password@123') : clean(req.body.password);
    const department = clean(req.body.department);
    const institution = clean(req.body.institution);
    const photo = clean(googleProfile?.picture || req.body.photo) || 'NA';
    const googleemail = hasGoogleCredential ? email : normEmail(req.body.googleemail);

    if (hasGoogleCredential && (!phone || !department || !institution)) {
      return res.status(400).json({
        success: false,
        message: 'Phone, department and institution are required after Google authentication'
      });
    }

    if (!name || !email || !phone || !password || !department || !institution) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, phone, password, department and institution are required'
      });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const maxUser = await User.findOne({ colid: { $type: 'number' } })
      .sort({ colid: -1 })
      .select('colid')
      .lean();
    const colid = Number(maxUser?.colid || 0) + 1;

    await Institution.create({
      name,
      user: email,
      colid,
      admincolid: colid,
      institutionname: institution,
      institutioncode: String(colid),
      address: 'NA',
      state: 'NA',
      district: 'NA',
      type: 'genai',
      logo: 'NA',
      status: 'Ok',
      comments: hasGoogleCredential ? 'Google self signup' : 'Self signup'
    });

    const user = await User.create({
      email,
      googleemail,
      name,
      phone,
      password,
      role: 'All',
      regno: 'NA',
      program: 'NA',
      programcode: 'NA',
      admissionyear: 'NA',
      academicyear: 'NA',
      rollno: 'NA',
      semester: 'NA',
      section: 'NA',
      gender: 'Not specified',
      state: 'NA',
      city: 'NA',
      district: 'NA',
      pincode: 'NA',
      department,
      photo,
      guardianname: 'NA',
      guardianmobile: 'NA',
      guardianemail: 'NA',
      category: 'NA',
      address: 'NA',
      quota: 'NA',
      user: email,
      addedby: 'Self signup',
      status1: 'Active',
      comments: 'Self signup',
      colid,
      status: 1,
      lastlogin: dateAfterDays(3),
      fathername: 'NA',
      mothername: 'NA',
      dob: 'NA',
      eligibilityname: 'NA',
      degree: 'NA',
      regulation: 'NA',
      samestate: 'NA',
      Major: 'NA',
      Minor: 'NA',
      AEC: 'NA',
      SEC: 'NA',
      VAC: 'NA',
      IDC: 'NA',
      isdisabled: 'No',
      institution
    });

    res.json({
      success: true,
      message: 'Account created successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        colid: user.colid,
        role: user.role,
        institution: user.institution,
        department: user.department,
        password: hasGoogleCredential ? password : undefined,
        googleemail: user.googleemail,
        photo: user.photo
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
