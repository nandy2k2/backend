const User = require("../Models/user");

// Helper function to calculate lastlogin (3 days from now)
const calculateLastLogin = () => {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date;
};

// ==========================================
// HELPER: Generate Roll Number
// ==========================================
// ==========================================
// HELPER: Generate Roll Number
// ==========================================
const generateRollNo = async (programcode, admissionyear, colid) => {
  try {
    // Find the last roll number for this program, year, AND college
    // Format: CSE-2025-103
    const rollnoPattern = `${programcode}-${admissionyear}-`;

    // Find all users with this programcode and year, sorted by rollno descending
    const lastUser = await User.findOne({
      colid: colid, // Scope by college ID
      programcode: programcode,
      admissionyear: admissionyear,
      rollno: { $regex: `^${rollnoPattern}`, $options: 'i' }
    }).sort({ rollno: -1 });

    let nextSequence = 1; // Default starting number

    if (lastUser && lastUser.rollno) {
      // Extract the sequence number from the last roll number
      // Example: "CSE-2025-103" -> extract "103"
      const parts = lastUser.rollno.split('-');
      if (parts.length >= 3) { // Ensure correct format
        const lastSequence = parseInt(parts[parts.length - 1]); // Get last part
        if (!isNaN(lastSequence)) {
          nextSequence = lastSequence + 1;
        }
      }
    }

    // Format sequence with leading zeros (e.g., 001, 010, 103)
    const sequenceStr = nextSequence.toString().padStart(3, '0');
    const newRollNo = `${programcode}-${admissionyear}-${sequenceStr}`;

    return newRollNo;
  } catch (error) {
    //console.error("Error generating roll number:", error);
    throw error;
  }
};

// ==========================================
// ADMIN FUNCTIONS
// ==========================================

// Create Single User (Admin)
exports.ds1createuser = async (req, res) => {
  try {
    const userData = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: userData.email, colid: userData.colid }); // Scope uniqueness by email + colid if needed, or just email
    if (existingUser) {
      return res.status(400).json({ message: "User with this email already exists" });
    }

    // Set lastlogin to 3 days from now if not provided
    if (!userData.lastlogin) {
      userData.lastlogin = calculateLastLogin();
    }

    // ✅ AUTO-GENERATE ROLL NUMBER
    if (!userData.rollno && userData.programcode && userData.admissionyear && userData.colid) {
      userData.rollno = await generateRollNo(userData.programcode, userData.admissionyear, userData.colid);
    }

    // ✅ COPY ROLLNO TO REGNO IF REGNO NOT PROVIDED
    if (!userData.regno && userData.rollno) {
      userData.regno = userData.rollno;
    }

    const user = await User.create(userData);
    res.status(201).json({
      message: "User created successfully",
      data: user
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creating user",
      error: error.message
    });
  }
};

// Bulk Create Users (Admin) - OPTIMIZED
exports.ds1bulkcreateuser = async (req, res) => {
  try {
    const users = req.body.users; // Array of user objects

    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ message: "Users array is required" });
    }

    // Add lastlogin to each user (3 days from now)
    const usersWithLastLogin = users.map(user => ({
      ...user,
      lastlogin: user.lastlogin || calculateLastLogin(),
      rollno: user.rollno || null // Ensure rollno field exists
    }));

    // Group users by key: `${colid}-${programcode}-${admissionyear}`
    const groups = {};
    for (const user of usersWithLastLogin) {
      if (!user.colid) {
        // //console.warn("User missing colid:", user.email);
        continue;
      }
      // Only auto-generate if missing rollno and has required fields
      if (!user.rollno && user.programcode && user.admissionyear) {
        const key = `${user.colid}-${user.programcode}-${user.admissionyear}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(user);
      }
    }

    // Fetch max sequence for each group and assign roll numbers
    for (const key in groups) {
      const [colid, programcode, admissionyear] = key.split('-');
      const groupUsers = groups[key];

      // Find the last roll number pattern
      const rollnoPattern = `${programcode}-${admissionyear}-`;
      const lastUser = await User.findOne({
        colid: colid,
        programcode: programcode,
        admissionyear: admissionyear,
        rollno: { $regex: `^${rollnoPattern}`, $options: 'i' }
      }).sort({ rollno: -1 });

      let nextSequence = 1;
      if (lastUser && lastUser.rollno) {
        const parts = lastUser.rollno.split('-');
        const lastSeq = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastSeq)) nextSequence = lastSeq + 1;
      }

      // Assign sequentially in memory
      for (const user of groupUsers) {
        const sequenceStr = nextSequence.toString().padStart(3, '0');
        user.rollno = `${programcode}-${admissionyear}-${sequenceStr}`;
        nextSequence++;
      }
    }

    // Now all users (who needed one) have a rollno.
    // Ensure regno is populated
    for (const user of usersWithLastLogin) {
      if (!user.regno && user.rollno) {
        user.regno = user.rollno;
      }
    }

    const usersWithRollNo = usersWithLastLogin;

    // Validate and filter out duplicates
    // Check duplicates based on email
    const emails = usersWithRollNo.map(u => u.email);
    const existingUsers = await User.find({ email: { $in: emails } });
    const existingEmails = existingUsers.map(u => u.email);

    const newUsers = usersWithRollNo.filter(u => !existingEmails.includes(u.email));

    if (newUsers.length === 0) {
      return res.status(200).json({ // Changed to 200 to allow partial success workflow frontend handling, or just message
        message: "All users already exist or no new valid users found",
        duplicates: existingEmails,
        created: 0
      });
    }

    const createdUsers = await User.insertMany(newUsers, { ordered: false });

    res.status(201).json({
      message: `${createdUsers.length} users created successfully`,
      created: createdUsers.length,
      duplicates: existingEmails.length,
      data: createdUsers
    });
  } catch (error) {
    //console.error("Bulk create error:", error);
    res.status(500).json({
      message: "Error creating users",
      error: error.message
    });
  }
};

// Get All Users with Search and Filters (Admin)
exports.ds1getalluser = async (req, res) => {
  try {
    const {
      colid,
      search,
      role,
      department,
      semester,
      section,
      programcode,
      status,
      page = 1,
      limit = 50,
      excludeRole,
      ...otherFilters
    } = req.query;

    // Build query
    const query = {};
    if (colid) query.colid = parseInt(colid);
    Object.keys(otherFilters).forEach(key => {
      if (otherFilters[key]) {
        // Handle numeric fields
        if (['status', 'srno', 'obtain', 'bonus', 'weightage'].includes(key)) {
          query[key] = parseInt(otherFilters[key]);
        }
        // Handle regex search for text fields
        else if (['name', 'email', 'regno', 'rollno', 'phone', 'role', 'department',
          'semester', 'section', 'programcode', 'admissionyear', 'gender',
          'category', 'fathername', 'mothername'].includes(key)) {
          query[key] = { $regex: String(otherFilters[key]), $options: 'i' };
        }
        // Default: exact match
        else {
          query[key] = otherFilters[key];
        }
      }
    });
    if (role && excludeRole) {
      // Both specified: filter to exact role but exclude the excluded role
      // If they're the same (contradictory), excludeRole wins → no results for that role
      query.role = role === excludeRole ? { $ne: excludeRole } : role;
    } else if (role) {
      query.role = role;
    } else if (excludeRole) {
      query.role = { $ne: excludeRole };
    }
    if (department) query.department = department;
    if (semester) query.semester = semester;
    if (section) query.section = section;
    if (programcode) query.programcode = programcode;
    if (status) query.status = parseInt(status);

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { regno: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const users = await User.find(query)
      .sort({ _id: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.status(200).json({
      data: users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching users",
      error: error.message
    });
  }
};

// Get Single User by ID (Admin)
exports.ds1getuserbyid = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ data: user });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching user",
      error: error.message
    });
  }
};

// Update User (Admin - Full Access)
exports.ds1updateuser = async (req, res) => {
  try {
    const { id } = req.query;
    const updateData = req.body;

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "User updated successfully",
      data: user
    });
  } catch (error) {
    res.status(500).json({
      message: "Error updating user",
      error: error.message
    });
  }
};

// Delete User (Admin)
exports.ds1deleteuser = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "User deleted successfully",
      data: user
    });
  } catch (error) {
    res.status(500).json({
      message: "Error deleting user",
      error: error.message
    });
  }
};

// Bulk Delete Users (Admin)
exports.ds1bulkdeleteuser = async (req, res) => {
  try {
    const { ids } = req.query; // Comma-separated string of IDs
    if (!ids) {
      return res.status(400).json({ message: "User IDs are required" });
    }

    // Convert comma-separated string to array
    const idArray = ids.split(",").map(id => id.trim());
    const result = await User.deleteMany({ _id: { $in: idArray } });

    res.status(200).json({
      message: `${result.deletedCount} users deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({
      message: "Error deleting users",
      error: error.message
    });
  }
};

// ==========================================
// STUDENT FUNCTIONS
// ==========================================

// Get Current Student Profile
exports.ds1getstudentprofile = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ data: user });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching profile",
      error: error.message
    });
  }
};

// Update Student Profile (Limited Fields) - WITH LOGGING
exports.ds1updatestudentprofile = async (req, res) => {
  try {
    const { email } = req.query;
    const updateData = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // GET CURRENT USER DATA FOR COMPARISON
    const currentUser = await User.findOne({ email });
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Define allowed fields for student update
    const allowedFields = [
      // Personal Info
      'phone', 'gender', 'photo', 'category', 'address', 'quota', 'dob',
      // Family Info
      'fathername', 'mothername',
      // Academic Info
      'eligibilityname', 'degree', 'minorsub', 'vocationalsub', 'mdcsub', 'othersub',
      // Merit/Scholarship
      'merit', 'obtain', 'bonus', 'weightage', 'ncctype', 'isdisabled', 'scholarship'
    ];

    // TRACK CHANGES FOR LOGGING
    const changes = [];
    const filteredData = {};

    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        const oldValue = currentUser[key] ? String(currentUser[key]) : "";
        const newValue = updateData[key] ? String(updateData[key]) : "";

        // ONLY LOG IF VALUE ACTUALLY CHANGED
        if (oldValue !== newValue) {
          changes.push({
            fieldName: key,
            oldValue: oldValue,
            newValue: newValue
          });
        }
        filteredData[key] = updateData[key];
      }
    });

    if (Object.keys(filteredData).length === 0) {
      return res.status(400).json({
        message: "No valid fields to update",
        allowedFields
      });
    }

    // UPDATE USER
    const user = await User.findOneAndUpdate(
      { email },
      filteredData,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // CREATE EDIT LOG (THIS WAS MISSING!)
    if (changes.length > 0) {
      const Profileeditlogds = require("../Models/profileeditlogds");
      const { getFieldCategory, getFieldLabel } = require("./ds1profileeditlogctlr");

      // Enrich changes with category and label
      const enrichedChanges = changes.map(change => ({
        ...change,
        category: getFieldCategory(change.fieldName),
        fieldLabel: getFieldLabel(change.fieldName)
      }));

      // SAVE LOG TO DATABASE
      await Profileeditlogds.create({
        colid: user.colid,
        name: user.name,
        regno: user.regno,
        changes: enrichedChanges,
        changeType: "Update",
        totalFieldsChanged: changes.length
      });
    }

    res.status(200).json({
      message: "Profile updated successfully",
      data: user,
      changesLogged: changes.length // RETURN LOG COUNT
    });
  } catch (error) {
    res.status(500).json({
      message: "Error updating profile",
      error: error.message
    });
  }
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

// Get User Statistics (Admin)
exports.ds1getuserstats = async (req, res) => {
  try {
    const { colid } = req.query;
    const query = colid ? { colid: parseInt(colid) } : {};

    const stats = await User.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          byRole: { $push: { role: "$role", count: 1 } },
          byDepartment: { $push: { department: "$department", count: 1 } },
          activeUsers: { $sum: { $cond: [{ $eq: ["$status", 1] }, 1, 0] } },
          inactiveUsers: { $sum: { $cond: [{ $eq: ["$status", 0] }, 1, 0] } }
        }
      }
    ]);

    res.status(200).json({ data: stats[0] });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching statistics",
      error: error.message
    });
  }
};

// ✅ IMPROVED: Get Unique Values for Filters using Aggregation (Admin)
exports.ds1getfilteroptions = async (req, res) => {
  try {
    const { colid } = req.query;
    const matchQuery = colid ? { colid: parseInt(colid) } : {};

    // Use aggregation to get unique values with counts
    const filterOptions = await User.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          roles: [
            { $group: { _id: "$role", count: { $sum: 1 } } },
            { $match: { _id: { $ne: null, $ne: "" } } },
            { $sort: { _id: 1 } },
            { $project: { value: "$_id", label: "$_id", count: 1, _id: 0 } }
          ],
          departments: [
            { $group: { _id: "$department", count: { $sum: 1 } } },
            { $match: { _id: { $ne: null, $ne: "" } } },
            { $sort: { _id: 1 } },
            { $project: { value: "$_id", label: "$_id", count: 1, _id: 0 } }
          ],
          semesters: [
            { $group: { _id: "$semester", count: { $sum: 1 } } },
            { $match: { _id: { $ne: null, $ne: "" } } },
            { $sort: { _id: 1 } },
            { $project: { value: "$_id", label: "$_id", count: 1, _id: 0 } }
          ],
          sections: [
            { $group: { _id: "$section", count: { $sum: 1 } } },
            { $match: { _id: { $ne: null, $ne: "" } } },
            { $sort: { _id: 1 } },
            { $project: { value: "$_id", label: "$_id", count: 1, _id: 0 } }
          ],
          programcodes: [
            { $group: { _id: "$programcode", count: { $sum: 1 } } },
            { $match: { _id: { $ne: null, $ne: "" } } },
            { $sort: { _id: 1 } },
            { $project: { value: "$_id", label: "$_id", count: 1, _id: 0 } }
          ],
          admissionyears: [
            { $group: { _id: "$admissionyear", count: { $sum: 1 } } },
            { $match: { _id: { $ne: null, $ne: "" } } },
            { $sort: { _id: -1 } },
            { $project: { value: "$_id", label: "$_id", count: 1, _id: 0 } }
          ]
        }
      }
    ]);

    res.status(200).json({
      roles: filterOptions[0].roles,
      departments: filterOptions[0].departments,
      semesters: filterOptions[0].semesters,
      sections: filterOptions[0].sections,
      programcodes: filterOptions[0].programcodes,
      admissionyears: filterOptions[0].admissionyears
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching filter options",
      error: error.message
    });
  }
};


exports.ds1getcounsellors = async (req, res) => {
  try {
    const counsellors = await User.find({
      colid: parseInt(req.query.colid),
      role: 'Counsellor',
      status: 1
    })

    return res.status(200).json({
      data: counsellors
    })
  } catch (error) {
    res.status(500).json({
      message: "Error fetching counsellors",
      error: error.message
    });
  }
};

// Get Purchase Users (Store, AO, OE, CMA, PE)
exports.ds1getpurchaseusers = async (req, res) => {
  try {
    const {
      colid,
      search,
      department,
      role, // Extract role from query
      page = 1,
      limit = 10,
    } = req.query;

    const purchaseRoles = ['PE', 'SPE', "OE"];

    // Build query
    const query = {};
    if (colid) query.colid = parseInt(colid);

    // If a specific role is requested and it's a valid purchase role, use it.
    // Otherwise, fetch all purchase roles.
    if (role && purchaseRoles.includes(role)) {
      query.role = role;
    } else {
      query.role = { $in: purchaseRoles };
    }

    if (department) query.department = department;

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { regno: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const users = await User.find(query)
      .sort({ _id: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.status(200).json({
      data: users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching purchase users",
      error: error.message
    });
  }
};
