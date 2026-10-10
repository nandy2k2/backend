const RegulationCourseMap = require("../Models/regulationcoursemapds");
const AssessmentComponent = require("../Models/assessmentcomponentds");

const allowedTypes = new Set(["Major", "Minor", "IDC", "MDC", "AEC", "SEC", "VAC"]);
const allowedCourseTypes = new Set(["Theory", "Practical"]);
const allowedDeliveryTypes = new Set(["Compulsory", "Elective"]);
const allowedPayTypes = new Set(["Paid", "Unpaid"]);
const allowedElectiveTypes = new Set(["Open", "Programwise", "Internal", "External", "Mooc", ""]);
const allowedGroupTypes = new Set(["Best", "Average"]);
const allowedScoreTypes = new Set(["Internal", "External"]);
const allowedComponentTypes = new Set(["Theory", "Practical", "Viva"]);

const text = (value) => String(value || "").trim();
const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const cleanCoursePayload = (input = {}) => ({
  academicyear: text(input.academicyear || input.academicYear),
  regulation: text(input.regulation),
  subject: text(input.subject),
  type: allowedTypes.has(text(input.type)) ? text(input.type) : "",
  semester: text(input.semester),
  program: text(input.program),
  programcode: text(input.programcode),
  faculty: text(input.faculty),
  institution: text(input.institution),
  department: text(input.department),
  course: text(input.course),
  coursecode: text(input.coursecode),
  coursetype: allowedCourseTypes.has(text(input.coursetype || input.courseType)) ? text(input.coursetype || input.courseType) : "Theory",
  deliverytype: allowedDeliveryTypes.has(text(input.deliverytype || input.deliveryType)) ? text(input.deliverytype || input.deliveryType) : "Compulsory",
  paytype: allowedPayTypes.has(text(input.paytype || input.payType)) ? text(input.paytype || input.payType) : "Unpaid",
  electivetype: allowedElectiveTypes.has(text(input.electivetype || input.electiveType)) ? text(input.electivetype || input.electiveType) : "",
  prerequisitecourse: text(input.prerequisitecourse || input.prerequisiteCourse),
  prerequisitecoursecode: text(input.prerequisitecoursecode || input.prerequisiteCourseCode),
  coursemastercode: text(input.coursemastercode || input.courseMasterCode),
  credit: toNumber(input.credit) || 0,
  amount: toNumber(input.amount) || 0,
  colid: toNumber(input.colid),
  user: text(input.user),
  status: text(input.status) || "Active"
});

const validateCourse = (payload) => {
  if (payload.colid === undefined) return "colid is required";
  if (!payload.academicyear) return "Academic year is required";
  if (!payload.regulation) return "Regulation is required";
  if (!payload.type) return "Type is required";
  if (!payload.subject) return "Subject is required";
  if (!payload.semester) return "Semester is required";
  if (!payload.program) return "Program is required";
  if (!payload.programcode) return "Program code is required";
  if (!payload.course) return "Course is required";
  if (!payload.coursecode) return "Course code is required";
  return "";
};

const cleanComponentPayload = (input = {}, course = {}) => {
  const parsedWeightage = toNumber(input.weightage);
  return {
    academicyear: course.academicyear,
    regulation: course.regulation,
    program: course.program,
    programcode: course.programcode,
    type: course.type,
    subject: course.subject,
    semester: course.semester,
    course: course.course,
    coursecode: course.coursecode,
    assessmentgroup: text(input.assessmentgroup || input.assessmentGroup),
    grouptype: allowedGroupTypes.has(text(input.grouptype || input.groupType)) ? text(input.grouptype || input.groupType) : undefined,
    scoretype: allowedScoreTypes.has(text(input.scoretype || input.scoreType)) ? text(input.scoretype || input.scoreType) : undefined,
    componenttype: allowedComponentTypes.has(text(input.componenttype || input.componentType)) ? text(input.componenttype || input.componentType) : undefined,
    assessmentcomponent: text(input.assessmentcomponent || input.assessmentComponent),
    marks: toNumber(input.marks) || 0,
    passmarks: toNumber(input.passmarks || input.passMarks) || 0,
    weightage: parsedWeightage === undefined ? 1 : parsedWeightage,
    credits: toNumber(input.credits || input.credit) ?? course.credit ?? 0,
    colid: course.colid,
    user: course.user,
    status: text(input.status) || "Active"
  };
};

const validateComponent = (payload) => {
  if (!payload.componenttype) return "Component type is required";
  if (!payload.assessmentcomponent) return "Assessment component is required";
  if (payload.weightage < 0 || payload.weightage > 1) return "Please enter a valid value between 0 and 1";
  return "";
};

exports.saveCombinedCourseAssessment = async (req, res) => {
  try {
    const course = cleanCoursePayload({ ...(req.body.course || req.body), colid: req.body.colid, user: req.body.user });
    const courseError = validateCourse(course);
    if (courseError) return res.status(400).json({ success: false, message: courseError });

    const componentRows = Array.isArray(req.body.components) ? req.body.components : [];
    const components = [];
    const componentErrors = [];
    componentRows.forEach((row, index) => {
      const empty = !text(row.assessmentcomponent) && !text(row.componenttype) && !text(row.assessmentgroup) && !text(row.scoretype);
      if (empty) return;
      const payload = cleanComponentPayload(row, course);
      const error = validateComponent(payload);
      if (error) componentErrors.push({ rowNumber: index + 1, message: error });
      else components.push(payload);
    });
    if (componentErrors.length) return res.status(400).json({ success: false, message: "Assessment component validation failed", errors: componentErrors });

    const courseFilter = {
      colid: course.colid,
      academicyear: course.academicyear,
      regulation: course.regulation,
      programcode: course.programcode,
      type: course.type,
      subject: course.subject,
      semester: course.semester,
      coursecode: course.coursecode
    };
    const savedCourse = await RegulationCourseMap.findOneAndUpdate(courseFilter, course, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });

    const savedComponents = [];
    for (const component of components) {
      const componentFilter = {
        colid: component.colid,
        academicyear: component.academicyear,
        regulation: component.regulation,
        programcode: component.programcode,
        type: component.type,
        coursecode: component.coursecode,
        assessmentgroup: component.assessmentgroup,
        grouptype: component.grouptype,
        scoretype: component.scoretype,
        componenttype: component.componenttype,
        assessmentcomponent: component.assessmentcomponent
      };
      const saved = await AssessmentComponent.findOneAndUpdate(componentFilter, component, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
      savedComponents.push(saved);
    }

    res.json({ success: true, course: savedCourse, components: savedComponents, message: "Course map and assessment components saved" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
