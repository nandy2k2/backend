const User = require("../Models/user");
const HrEmployeeAttendance = require("../Models/hremployeeattendanceds");
const OrganizationHierarchy = require("../Models/organizationhierarchyds");
const Institution = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const iso = (date) => date.toISOString().slice(0, 10);
const monthName = (date) => date.toLocaleString("en-US", { month: "long" });
const uniqueSorted = (values = []) => [...new Set(values.map(text).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const getInstitution = (colid) => Institution.findOne({ colid }).sort({ _id: -1 }).lean();

const dateRange = (from, to) => {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const dates = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(new Date(cursor));
  }
  return dates;
};

const baseDateQuery = (source = {}) => {
  const colid = toNumber(source.colid);
  if (colid === undefined) return { error: "colid is required" };
  const dates = dateRange(source.fromdate, source.todate);
  if (!dates.length) return { error: "Valid from date and to date are required" };
  return { colid, dates, query: { colid, date: { $gte: iso(dates[0]), $lte: iso(dates[dates.length - 1]) } } };
};

exports.generateDummyAttendance = async (req, res) => {
  try {
    const built = baseDateQuery(req.body);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    const users = await User.find({ colid: built.colid, role: { $not: /^Student$/i } })
      .select("name email user role department designation")
      .lean();
    if (!users.length) return res.status(400).json({ success: false, message: "No non-student users found" });
    const ops = [];
    users.forEach((employee, userIndex) => {
      built.dates.forEach((date, dateIndex) => {
        const present = (userIndex + dateIndex) % 7 !== 0;
        ops.push({
          updateOne: {
            filter: {
              colid: built.colid,
              employeeemail: text(employee.email || employee.user),
              date: iso(date)
            },
            update: {
              $set: {
                academicyear: text(req.body.academicyear) || String(date.getFullYear()),
                month: monthName(date),
                date: iso(date),
                employeename: text(employee.name || employee.email || employee.user),
                employeeemail: text(employee.email || employee.user),
                role: text(employee.role),
                attendance: present ? 1 : 0,
                status: present ? "Present" : "Absent",
                intime: present ? "09:30" : "",
                outtime: present ? "17:30" : "",
                islate: present && (userIndex + dateIndex) % 11 === 0 ? "Yes" : "No",
                isearly: present && (userIndex + dateIndex) % 13 === 0 ? "Yes" : "No",
                approvalstatus: "Approved",
                actiontype: "Dummy",
                currentlevel: 0,
                colid: built.colid,
                user: text(req.body.user)
              }
            },
            upsert: true
          }
        });
      });
    });
    const result = ops.length ? await HrEmployeeAttendance.bulkWrite(ops, { ordered: false }) : { upsertedCount: 0, modifiedCount: 0 };
    res.json({
      success: true,
      users: users.length,
      days: built.dates.length,
      generated: ops.length,
      upserted: result.upsertedCount || 0,
      modified: result.modifiedCount || 0
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to generate dummy HR attendance" });
  }
};

exports.dashboardOptions = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const users = await User.find({ colid, role: { $not: /^Student$/i } }).select("department role").lean();
    res.json({
      success: true,
      options: {
        departments: uniqueSorted(users.map((row) => row.department)),
        roles: uniqueSorted(users.map((row) => row.role))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load HR attendance options" });
  }
};

exports.departmentDashboard = async (req, res) => {
  try {
    const built = baseDateQuery(req.query);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    const [attendanceRows, users, institution] = await Promise.all([
      HrEmployeeAttendance.find(built.query).lean(),
      User.find({ colid: built.colid, role: { $not: /^Student$/i } }).select("name email user role department").lean(),
      getInstitution(built.colid)
    ]);
    const userMap = new Map(users.map((user) => [text(user.email || user.user).toLowerCase(), user]));
    const map = new Map();
    attendanceRows.forEach((row) => {
      const user = userMap.get(text(row.employeeemail).toLowerCase()) || {};
      const department = text(user.department || row.department) || "Not specified";
      const item = map.get(department) || { id: department, department, present: 0, absent: 0, total: 0, percentage: 0 };
      if (num(row.attendance) === 1 || text(row.status).toLowerCase() === "present") item.present += 1;
      else item.absent += 1;
      item.total += 1;
      map.set(department, item);
    });
    const table = [...map.values()].map((row) => ({
      ...row,
      percentage: row.total ? Number(((row.present / row.total) * 100).toFixed(2)) : 0
    })).sort((a, b) => b.percentage - a.percentage);
    const totals = table.reduce((acc, row) => {
      acc.present += row.present;
      acc.absent += row.absent;
      acc.total += row.total;
      return acc;
    }, { present: 0, absent: 0, total: 0 });
    totals.percentage = totals.total ? Number(((totals.present / totals.total) * 100).toFixed(2)) : 0;
    res.json({
      success: true,
      data: {
        cards: [
          { key: "total", label: "Total Records", value: totals.total, tone: "#2563eb" },
          { key: "present", label: "Present", value: totals.present, tone: "#16a34a" },
          { key: "absent", label: "Absent", value: totals.absent, tone: "#dc2626" },
          { key: "percentage", label: "Attendance %", value: totals.percentage, suffix: "%", tone: "#7c3aed" }
        ],
        totals,
        table,
        charts: {
          departmentwise: table.map((row) => ({ label: row.department, percentage: row.percentage, present: row.present, absent: row.absent })),
          presentAbsent: [
            { label: "Present", count: totals.present },
            { label: "Absent", count: totals.absent }
          ]
        },
        institution: institution || {}
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load HR attendance dashboard" });
  }
};

exports.teamReport = async (req, res) => {
  try {
    const built = baseDateQuery(req.query);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    const manageremail = text(req.query.manageremail || req.query.user);
    if (!manageremail) return res.status(400).json({ success: false, message: "manager email is required" });
    const mappings = await OrganizationHierarchy.find({
      colid: built.colid,
      manageremail: new RegExp(`^${manageremail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      status: { $ne: "Inactive" }
    }).lean();
    const emails = uniqueSorted(mappings.map((row) => row.employeeemail));
    if (!emails.length) {
      const institution = await getInstitution(built.colid);
      return res.json({ success: true, data: { cards: [], table: [], daily: [], charts: { userwise: [], presentAbsent: [] }, institution: institution || {} } });
    }
    const [rows, institution] = await Promise.all([
      HrEmployeeAttendance.find({ ...built.query, employeeemail: { $in: emails } }).lean(),
      getInstitution(built.colid)
    ]);
    const rowMap = new Map(rows.map((row) => [`${text(row.employeeemail).toLowerCase()}||${text(row.date)}`, row]));
    const table = [];
    const userSummary = new Map();
    mappings.forEach((employee) => {
      const email = text(employee.employeeemail);
      built.dates.forEach((date) => {
        const key = `${email.toLowerCase()}||${iso(date)}`;
        const row = rowMap.get(key);
        const present = row ? (num(row.attendance) === 1 || text(row.status).toLowerCase() === "present") : false;
        const item = userSummary.get(email) || { id: email, employee: text(employee.employeename), employeeemail: email, department: text(employee.department), present: 0, absent: 0, total: 0, percentage: 0 };
        if (present) item.present += 1;
        else item.absent += 1;
        item.total += 1;
        userSummary.set(email, item);
        table.push({
          id: `${email}-${iso(date)}`,
          employee: text(employee.employeename),
          employeeemail: email,
          department: text(employee.department),
          date: iso(date),
          status: present ? "Present" : "Absent"
        });
      });
    });
    const userwise = [...userSummary.values()].map((row) => ({
      ...row,
      percentage: row.total ? Number(((row.present / row.total) * 100).toFixed(2)) : 0
    }));
    const totals = userwise.reduce((acc, row) => {
      acc.present += row.present;
      acc.absent += row.absent;
      acc.total += row.total;
      return acc;
    }, { present: 0, absent: 0, total: 0 });
    totals.percentage = totals.total ? Number(((totals.present / totals.total) * 100).toFixed(2)) : 0;
    res.json({
      success: true,
      data: {
        cards: [
          { key: "team", label: "Team Members", value: userwise.length, tone: "#2563eb" },
          { key: "present", label: "Present Days", value: totals.present, tone: "#16a34a" },
          { key: "absent", label: "Absent Days", value: totals.absent, tone: "#dc2626" },
          { key: "percentage", label: "Team Attendance %", value: totals.percentage, suffix: "%", tone: "#7c3aed" }
        ],
        totals,
        table,
        charts: {
          userwise: userwise.map((row) => ({ label: row.employee || row.employeeemail, percentage: row.percentage, present: row.present, absent: row.absent })),
          presentAbsent: [
            { label: "Present", count: totals.present },
            { label: "Absent", count: totals.absent }
          ]
        },
        institution: institution || {}
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load team attendance report" });
  }
};

exports.dailyAbsentReport = async (req, res) => {
  try {
    const built = baseDateQuery(req.query);
    if (built.error) return res.status(400).json({ success: false, message: built.error });
    const department = text(req.query.department);
    const role = text(req.query.role);
    const employeeemail = text(req.query.employeeemail);
    const rowQuery = {
      ...built.query,
      $or: [
        { attendance: 0 },
        { status: /^Absent$/i }
      ]
    };
    if (role) rowQuery.role = role;
    if (employeeemail) rowQuery.employeeemail = new RegExp(`^${employeeemail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

    const userQuery = { colid: built.colid, role: { $not: /^Student$/i } };
    if (department) userQuery.department = department;
    if (role) userQuery.role = role;
    if (employeeemail) {
      userQuery.$or = [
        { email: new RegExp(`^${employeeemail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        { user: new RegExp(`^${employeeemail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
      ];
    }

    const [attendanceRows, users, institution] = await Promise.all([
      HrEmployeeAttendance.find(rowQuery).sort({ date: 1, employeename: 1 }).lean(),
      User.find(userQuery).select("name email user role department designation").lean(),
      getInstitution(built.colid)
    ]);
    const userMap = new Map(users.map((user) => [text(user.email || user.user).toLowerCase(), user]));
    const allowedEmails = new Set(users.map((user) => text(user.email || user.user).toLowerCase()).filter(Boolean));
    const filteredRows = department || employeeemail
      ? attendanceRows.filter((row) => allowedEmails.has(text(row.employeeemail).toLowerCase()))
      : attendanceRows;

    const daywise = new Map();
    const departmentwise = new Map();
    const rolewise = new Map();
    const employeeMap = new Map();
    const table = filteredRows.map((row, index) => {
      const user = userMap.get(text(row.employeeemail).toLowerCase()) || {};
      const rowDepartment = text(user.department || row.department) || "Not specified";
      const rowRole = text(user.role || row.role) || "Not specified";
      const date = text(row.date);
      daywise.set(date, (daywise.get(date) || 0) + 1);
      departmentwise.set(rowDepartment, (departmentwise.get(rowDepartment) || 0) + 1);
      rolewise.set(rowRole, (rolewise.get(rowRole) || 0) + 1);
      employeeMap.set(text(row.employeeemail).toLowerCase(), {
        employeename: text(row.employeename || user.name),
        employeeemail: text(row.employeeemail),
        department: rowDepartment,
        role: rowRole
      });
      return {
        id: String(row._id || `${date}-${index}`),
        date,
        day: date ? new Date(date).toLocaleDateString("en-US", { weekday: "long" }) : "",
        employeename: text(row.employeename || user.name),
        employeeemail: text(row.employeeemail),
        department: rowDepartment,
        role: rowRole,
        designation: text(user.designation),
        status: text(row.status) || "Absent",
        attendance: num(row.attendance),
        approvalstatus: text(row.approvalstatus),
        intime: text(row.intime),
        outtime: text(row.outtime),
        remarks: text(row.finalcomment)
      };
    });
    const mapToChart = (map, labelKey = "label") => [...map.entries()]
      .map(([label, count]) => ({ [labelKey]: label || "Not specified", label: label || "Not specified", count }))
      .sort((a, b) => b.count - a.count);
    const daywiseChart = [...daywise.entries()]
      .map(([date, count]) => ({ date, label: date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const maxDay = daywiseChart.reduce((best, row) => (row.count > (best?.count || 0) ? row : best), null);
    res.json({
      success: true,
      data: {
        cards: [
          { key: "absences", label: "Absent Records", value: table.length, tone: "#dc2626" },
          { key: "employees", label: "Unique Employees", value: employeeMap.size, tone: "#2563eb" },
          { key: "days", label: "Days With Absence", value: daywise.size, tone: "#7c3aed" },
          { key: "peak", label: "Peak Day Absences", value: maxDay?.count || 0, tone: "#ea580c" }
        ],
        totals: {
          absentRecords: table.length,
          uniqueEmployees: employeeMap.size,
          daysWithAbsence: daywise.size,
          peakDate: maxDay?.date || "",
          peakCount: maxDay?.count || 0
        },
        table,
        charts: {
          daywise: daywiseChart,
          departmentwise: mapToChart(departmentwise),
          rolewise: mapToChart(rolewise)
        },
        institution: institution || {}
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load daily absent report" });
  }
};
