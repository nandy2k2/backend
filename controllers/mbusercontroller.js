const User = require('./../Models/user');

const getFutureDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 365);
    return d;
};

const defaultAuthenticatorForRole = (role, value) => {
    if (value === 'Yes' || value === 'No') return value;
    return String(role || '').toLowerCase() === 'student' ? 'No' : 'Yes';
};

// ✅ Create single user
exports.mbCreateUser = async (req, res) => {
    try {
        const data = req.body;

        //console.log(req.body);

        if (data.role === 'student') {
            return res.status(400).json({ message: 'Not allowed' });
        }

        const finalData = {
            ...data,

            // // 🔒 enforced fields
            // user: req.headers['x-user'], // from global1.user
            // colid: req.headers['x-colid'], // from global1.colid

             // 🔑 required from frontend
            user: data.user,
            colid: data.colid,

            institution: data.institution,
            department: data.department,
            designation: data.designation,
            role: data.role,
            authenticator: defaultAuthenticatorForRole(data.role, data.authenticator),
            admissionyear: data.admissionyear,
            joiningdate: data.joiningdate || data.dateofjoining,

            // 🎯 defaults
            status: 1,
            lastlogin: getFutureDate(),

            regno: "NA",
            programcode: "NA",
            semester: "NA",
            section: "NA",

        };
        //console.log(finalData);

        const user = await User.create(finalData);
        res.json(user);


    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ Bulk create
exports.mbBulkCreateUsers = async (req, res) => {
    try {
        const users = req.body;

        const mapped = users.map(u => ({
            ...u,
            // user: req.headers['x-user'],
            // colid: req.headers['x-colid'],

            user: u.user,
            colid: u.colid,
            authenticator: defaultAuthenticatorForRole(u.role, u.authenticator),

            status: 1,
            lastlogin: getFutureDate(),

            regno: "NA",
            programcode: "NA",
            semester: "NA",
            section: "NA",

            admissionyear: u.admissionyear || u.joiningyear || "NA",
            designation: u.designation || "",
            joiningdate: u.joiningdate || u.dateofjoining || ""
        }));

        const result = await User.insertMany(mapped);
        res.json(result);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ✅ Get users by colid
exports.mbGetUsers = async (req, res) => {
    try {
        const { colid } = req.query;
        //console.log(req.query);

        const users = await User.find({
            colid,
            role: { $ne: 'Student' }
        }).lean();

        //console.log(users);

        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ✅ Update
exports.mbUpdateUser = async (req, res) => {
    try {
        const id = req.params.id || req.body.id;
        const data = { ...req.body };
        delete data.id;
        delete data._id;

        if (String(data.role || '').toLowerCase() === 'student') {
            return res.status(400).json({ message: 'Not allowed' });
        }

        const updated = await User.findByIdAndUpdate(id, data, { new: true, runValidators: true });
        if (!updated) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ✅ Delete
exports.mbDeleteUser = async (req, res) => {
    try {
        const id = req.params.id || req.body.id;
        const deleted = await User.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.mbBulkDeleteUsers = async (req, res) => {
    try {
        const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
        const colid = req.body.colid;
        if (!ids.length) {
            return res.status(400).json({ error: 'Select at least one user' });
        }
        const deleted = await User.deleteMany({
            _id: { $in: ids },
            colid,
            role: { $ne: 'Student' }
        });
        res.json({ success: true, deleted: deleted.deletedCount || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
