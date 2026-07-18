const User = require('../Models/user');

const clean = (value) => String(value || '').trim();
const dateAfterDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

exports.createPublicAccount = async (req, res) => {
  try {
    const name = clean(req.body.name);
    const email = clean(req.body.email).toLowerCase();
    const phone = clean(req.body.phone);
    const password = clean(req.body.password);
    const department = clean(req.body.department);
    const institution = clean(req.body.institution);

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

    const user = await User.create({
      email,
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
      photo: 'NA',
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
        institution: user.institution
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
