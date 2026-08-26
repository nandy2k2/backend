const AcademicNewTask = require("../Models/academicnewtaskds");
const User = require("../Models/user");

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const dueDate = (days = 7) => {
  const start = new Date();
  const due = new Date(start);
  due.setDate(due.getDate() + days);
  return { start, due };
};

const assigneesFor = async ({ colid, approvername, approveremail, approverrole }) => {
  const email = text(approveremail);
  if (email && email.toLowerCase() !== "all") {
    return [{ name: text(approvername) || email, email }];
  }
  const role = text(approverrole);
  if (!role) return [];
  const users = await User.find({ colid: num(colid), role: new RegExp(`^${role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })
    .select("name email user")
    .limit(500)
    .lean();
  return users.map((user) => ({ name: user.name || user.email || user.user || role, email: user.email || user.user || "" })).filter((row) => row.email);
};

exports.createApprovalTasks = async ({
  colid,
  user,
  createdby,
  academicyear,
  approvername,
  approveremail,
  approverrole,
  title,
  category = "Approval",
  pagelink,
  comments,
  referenceModel,
  referenceId,
  level,
  criticality = "High",
  days = 7
}) => {
  const scopedColid = num(colid);
  if (scopedColid === undefined) return [];
  const assignees = await assigneesFor({ colid: scopedColid, approvername, approveremail, approverrole });
  const { start, due } = dueDate(days);
  const docs = [];
  for (const assignee of assignees) {
    const query = {
      colid: scopedColid,
      facultyemail: assignee.email,
      status: { $ne: "Completed" },
      category,
      ...(referenceModel ? { referenceModel } : {}),
      ...(referenceId ? { referenceId: String(referenceId) } : {}),
      ...(level !== undefined && level !== null ? { referenceLevel: String(level) } : {})
    };
    const payload = {
      colid: scopedColid,
      user: text(user),
      createdby: text(createdby),
      academicyear: text(academicyear),
      faculty: assignee.name,
      facultyemail: assignee.email,
      task: text(title) || category,
      category,
      criticality,
      pagelink: text(pagelink),
      startdate: start,
      duedate: due,
      status: "New",
      comments: text(comments),
      referenceModel: text(referenceModel),
      referenceId: text(referenceId),
      referenceLevel: level !== undefined && level !== null ? text(level) : ""
    };
    const row = await AcademicNewTask.findOneAndUpdate(query, payload, { upsert: true, new: true, setDefaultsOnInsert: true });
    docs.push(row);
  }
  return docs;
};

exports.completeApprovalTasks = async ({ colid, approveremail, category, referenceModel, referenceId, level, comments }) => {
  const scopedColid = num(colid);
  if (scopedColid === undefined) return { modifiedCount: 0 };
  const query = {
    colid: scopedColid,
    status: { $ne: "Completed" },
    ...(text(approveremail) ? { facultyemail: text(approveremail) } : {}),
    ...(text(category) ? { category: text(category) } : {}),
    ...(text(referenceModel) ? { referenceModel: text(referenceModel) } : {}),
    ...(text(referenceId) ? { referenceId: text(referenceId) } : {}),
    ...(level !== undefined && level !== null ? { referenceLevel: text(level) } : {})
  };
  return AcademicNewTask.updateMany(query, {
    $set: {
      status: "Completed",
      comments: text(comments) || "Approval task completed"
    }
  });
};
