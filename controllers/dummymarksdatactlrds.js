const User = require("../Models/user");
const RegulationCourseMap = require("../Models/regulationcoursemapds");
const ExamMarks = require("../Models/examinationmodel2marksds");
const ExamVivaMarks = require("../Models/examinationmodel2vivamarksds");
const ConductExamRoll = require("../Models/conductexamrollds");

const clean = (value) => (value === undefined || value === null ? "" : String(value).trim());
const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const allowedStudentFields = new Set([
  "name", "regno", "email", "phone", "admissionyear", "academicyear", "program", "programcode", "regulation",
  "department", "Major", "Minor", "AEC", "SEC", "VAC", "IDC", "category", "gender", "semester", "section",
  "institution", "state", "city", "status1"
]);

const buildStudentQuery = (colid, filters = []) => {
  const query = { colid, role: { $regex: /^student$/i } };
  filters.forEach((filter) => {
    const field = clean(filter.field);
    const operator = clean(filter.operator || "equals").toLowerCase();
    const value = filter.value;
    if (!allowedStudentFields.has(field)) return;
    if (operator === "notempty") {
      query[field] = { $nin: ["", null] };
      return;
    }
    if (Array.isArray(value)) {
      const values = value.map(clean).filter(Boolean);
      if (values.length) query[field] = { $in: values };
      return;
    }
    const text = clean(value);
    if (!text) return;
    query[field] = operator === "contains" ? { $regex: escapeRegExp(text), $options: "i" } : text;
  });
  return query;
};

const gradeFromPercent = (percentage) => {
  if (percentage >= 90) return { grade: "O", point: 10 };
  if (percentage >= 80) return { grade: "A+", point: 9 };
  if (percentage >= 70) return { grade: "A", point: 8 };
  if (percentage >= 60) return { grade: "B+", point: 7 };
  if (percentage >= 50) return { grade: "B", point: 6 };
  if (percentage >= 40) return { grade: "C", point: 5 };
  return { grade: "F", point: 0 };
};

const normalizeSemesterPlans = (body = {}) => {
  const incoming = Array.isArray(body.semesterPlans) ? body.semesterPlans : [];
  const fallbackAcademicYear = clean(body.academicyear);
  const fallbackExam = clean(body.exam || "Dummy Exam");
  const fallbackExamcode = clean(body.examcode || "DUMMY-EXAM");
  const plans = [];
  for (let semester = 1; semester <= 8; semester += 1) {
    const existing = incoming.find((item) => clean(item.semester) === String(semester)) || {};
    if (incoming.length && existing.selected === false) continue;
    if (incoming.length && !Object.keys(existing).length) continue;
    const academicyear = clean(existing.academicyear || fallbackAcademicYear);
    const exam = clean(existing.exam || `${fallbackExam} Sem ${semester}`);
    const examcode = clean(existing.examcode || `${fallbackExamcode}-S${semester}`);
    plans.push({ semester: String(semester), academicyear, exam, examcode });
  }
  return plans;
};

const dummyCoursesForProgram = async ({ colid, user, regulation, program, programcode, semesterPlans }) => {
  const courses = [];
  const planMap = new Map((semesterPlans || []).map((plan) => [clean(plan.semester), plan]));
  for (let semester = 1; semester <= 8; semester += 1) {
    const plan = planMap.get(String(semester)) || {};
    for (let index = 1; index <= 6; index += 1) {
      courses.push({
        academicyear: clean(plan.academicyear),
        regulation,
        subject: "Major",
        type: "Major",
        semester: String(semester),
        program,
        programcode,
        course: `Dummy Course ${semester}.${index}`,
        coursecode: `${programcode || "PRG"}-S${semester}-C${index}`,
        coursetype: index % 3 === 0 ? "Practical" : "Theory",
        deliverytype: "Compulsory",
        coursemastercode: `${programcode || "PRG"}-DUMMY-${semester}-${index}`,
        credit: index % 3 === 0 ? 2 : 4,
        colid,
        user,
        status: "Active"
      });
    }
  }
  await RegulationCourseMap.bulkWrite(courses.map((course) => ({
    updateOne: {
      filter: {
        colid,
        academicyear: course.academicyear,
        regulation: course.regulation,
        programcode: course.programcode,
        semester: course.semester,
        coursecode: course.coursecode
      },
      update: { $set: course },
      upsert: true
    }
  })), { ordered: false });
  return courses.length;
};

const marksForCase = (caseName, components) => {
  const totals = {
    theorymarks: components.includes("Theory") ? 100 : 0,
    practicaltotal: components.includes("Practical") ? 50 : 0,
    vivatotal: components.includes("Viva") ? 25 : 0
  };
  let theoryobtained = totals.theorymarks ? 68 : 0;
  let practicalobtained = totals.practicaltotal ? 34 : 0;
  let vivaobtained = totals.vivatotal ? 18 : 0;
  if (caseName === "theoryFail" && totals.theorymarks) theoryobtained = 28;
  if (caseName === "practicalFail" && totals.practicaltotal) practicalobtained = 14;
  if (caseName === "bothFail") {
    if (totals.theorymarks) theoryobtained = 26;
    if (totals.practicaltotal) practicalobtained = 12;
    if (totals.vivatotal) vivaobtained = 8;
  }
  if (caseName === "overallFail") {
    if (totals.theorymarks) theoryobtained = 36;
    if (totals.practicaltotal) practicalobtained = 18;
    if (totals.vivatotal) vivaobtained = 8;
  }
  const overalltotalmarks = totals.theorymarks + totals.practicaltotal + totals.vivatotal;
  const overallobtained = theoryobtained + practicalobtained + vivaobtained;
  const theorypercentage = totals.theorymarks ? (theoryobtained / totals.theorymarks) * 100 : 0;
  const practicalpercentage = totals.practicaltotal ? (practicalobtained / totals.practicaltotal) * 100 : 0;
  const vivapercentage = totals.vivatotal ? (vivaobtained / totals.vivatotal) * 100 : 0;
  const overallpercentage = overalltotalmarks ? (overallobtained / overalltotalmarks) * 100 : 0;
  const theory = gradeFromPercent(theorypercentage);
  const practical = gradeFromPercent(practicalpercentage);
  const viva = gradeFromPercent(vivapercentage);
  const overall = gradeFromPercent(overallpercentage);
  const componentFail = (totals.theorymarks && theory.grade === "F") || (totals.practicaltotal && practical.grade === "F") || (totals.vivatotal && viva.grade === "F");
  const finalGrade = componentFail ? { grade: "F", point: 0 } : overall;
  return {
    ...totals,
    theoryobtained,
    theorypercentage: Number(theorypercentage.toFixed(2)),
    theorygradepoint: theory.point,
    theorygrade: totals.theorymarks ? theory.grade : "",
    theorystatus: totals.theorymarks && theory.grade === "F" ? "Fail" : "Pass",
    practicalobtained,
    practicalpercentage: Number(practicalpercentage.toFixed(2)),
    practicalgradepoint: practical.point,
    practicalgrade: totals.practicaltotal ? practical.grade : "",
    practicalstatus: totals.practicaltotal && practical.grade === "F" ? "Fail" : "Pass",
    vivaobtained,
    vivapercentage: Number(vivapercentage.toFixed(2)),
    vivagpa: viva.point,
    vivagrade: totals.vivatotal ? viva.grade : "",
    overalltotalmarks,
    overallobtained,
    overallpercentage: Number(overallpercentage.toFixed(2)),
    overallgradepoint: finalGrade.point,
    overallgrade: finalGrade.grade,
    gpa: finalGrade.point,
    status: finalGrade.grade === "F" ? "Fail" : "Pass"
  };
};

exports.generateDummyMarks = async (req, res) => {
  try {
    const colid = asNumber(req.body.colid);
    const components = Array.isArray(req.body.components) ? req.body.components.map(clean).filter(Boolean) : [];
    const modelType = clean(req.body.modelType || "exammarks");
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!clean(req.body.programcode)) return res.status(400).json({ success: false, message: "Select program" });
    if (!components.length) return res.status(400).json({ success: false, message: "Select at least one component" });
    const semesterPlans = normalizeSemesterPlans(req.body);
    const semesterPlanMap = new Map(semesterPlans.map((plan) => [clean(plan.semester), plan]));

    let createdCourseRows = 0;
    if (req.body.createCourses) {
      createdCourseRows = await dummyCoursesForProgram({
        colid,
        user: clean(req.body.user),
        regulation: clean(req.body.regulation || "Dummy Regulation"),
        program: clean(req.body.program),
        programcode: clean(req.body.programcode),
        semesterPlans
      });
    }

    const studentIds = Array.isArray(req.body.studentIds) ? req.body.studentIds.filter(Boolean) : [];
    const studentQuery = studentIds.length ? { _id: { $in: studentIds }, colid } : buildStudentQuery(colid, req.body.filters || []);
    const students = await User.find({ ...studentQuery, role: { $regex: /^student$/i } }).select("name regno email abcid academicyear admissionyear regulation program programcode semester photo").lean();
    if (!students.length) return res.status(400).json({ success: false, message: "No students found for selected filters" });

    const courseFilter = {
      colid,
      programcode: clean(req.body.programcode),
      status: { $ne: "Deleted" },
      $or: semesterPlans
        .filter((plan) => clean(plan.academicyear))
        .map((plan) => ({ semester: clean(plan.semester), academicyear: clean(plan.academicyear) }))
    };
    if (!courseFilter.$or.length) delete courseFilter.$or;
    if (clean(req.body.regulation)) courseFilter.regulation = clean(req.body.regulation);
    const courses = await RegulationCourseMap.find(courseFilter).sort({ semester: 1, coursecode: 1 }).lean();
    if (!courses.length) return res.status(400).json({ success: false, message: "No courses available. Select create courses or add courses first." });

    const TargetModel = modelType === "exammarks2" ? ExamVivaMarks : ExamMarks;
    const failCases = ["pass", "theoryFail", "practicalFail", "overallFail", "bothFail"];
    const operations = [];
    const examRollOperations = [];
    const skippedSemesters = [];
    let attendedYesRows = 0;
    let attendedNoRows = 0;
    let admitEligibleYesRows = 0;
    let admitEligibleNoRows = 0;
    for (let sIndex = 0; sIndex < students.length; sIndex += 1) {
      const student = students[sIndex];
      for (const plan of semesterPlans) {
        const existingCount = await TargetModel.countDocuments({
          colid,
          regno: clean(student.regno || student.email),
          academicyear: clean(plan.academicyear),
          programcode: clean(req.body.programcode),
          semester: clean(plan.semester)
        });
        if (existingCount >= 6) {
          skippedSemesters.push({
            student: clean(student.name),
            regno: clean(student.regno || student.email),
            semester: clean(plan.semester),
            academicyear: clean(plan.academicyear),
            existingMarks: existingCount,
            reason: "Already has at least 6 subject marks"
          });
          continue;
        }
        const semesterCourses = courses.filter((course) => clean(course.semester) === clean(plan.semester) && clean(course.academicyear) === clean(plan.academicyear));
        semesterCourses.forEach((course, cIndex) => {
          const semesterPlan = semesterPlanMap.get(clean(course.semester)) || {};
          const basePayload = {
            colid,
            academicyear: clean(semesterPlan.academicyear || course.academicyear || req.body.academicyear || student.academicyear || student.admissionyear),
            regulation: clean(req.body.regulation || course.regulation || student.regulation),
            exam: clean(semesterPlan.exam || req.body.exam || "Dummy Exam"),
            examcode: clean(semesterPlan.examcode || req.body.examcode || "DUMMY-EXAM"),
            program: clean(req.body.program || course.program || student.program),
            programcode: clean(req.body.programcode || course.programcode || student.programcode),
            semester: clean(course.semester || student.semester || "1"),
            course: clean(course.course),
            coursecode: clean(course.coursecode),
            student: clean(student.name),
            regno: clean(student.regno || student.email)
          };
          const admitcardeligible = (sIndex + cIndex) % 7 === 0 ? "No" : "Yes";
          const attended = admitcardeligible === "Yes" && (sIndex + cIndex) % 5 !== 0 ? "Yes" : "No";
          if (admitcardeligible === "Yes") admitEligibleYesRows += 1;
          else admitEligibleNoRows += 1;
          if (attended === "Yes") attendedYesRows += 1;
          else attendedNoRows += 1;
          examRollOperations.push({
            updateOne: {
              filter: {
                colid,
                academicyear: basePayload.academicyear,
                regulation: basePayload.regulation,
                examcode: basePayload.examcode,
                programcode: basePayload.programcode,
                semester: basePayload.semester,
                coursecode: basePayload.coursecode,
                regno: basePayload.regno
              },
              update: {
                $set: {
                  ...basePayload,
                  type: clean(course.type || course.subject || "Major") === "Minor" ? "Minor" : "Major",
                  subject: clean(course.subject || course.type || "Major"),
                  email: clean(student.email),
                  phone: clean(student.phone),
                  section: clean(student.section),
                  applied: "Yes",
                  admitcardeligible,
                  attended,
                  attendance: attended,
                  fees: "Yes",
                  disciplinary: "Yes",
                  atkt: "Yes",
                  examdate: clean(req.body.examdate || new Date().toISOString().slice(0, 10)),
                  user: clean(req.body.user)
                }
              },
              upsert: true
            }
          });
          if (attended !== "Yes") return;
          const caseName = failCases[(sIndex + cIndex) % failCases.length];
          const marks = marksForCase(caseName, components);
          const credit = Number(course.credit || 4);
          const payload = {
            ...basePayload,
            credit,
            abcid: clean(student.abcid),
            ...marks,
            gpa: Number((credit * marks.overallgradepoint).toFixed(2)),
            attempt: Number(req.body.attempt || 1),
            type: clean(req.body.type || "Regular"),
            examdate: clean(req.body.examdate || new Date().toISOString().slice(0, 10)),
            resultprocessdate: clean(req.body.resultprocessdate || new Date().toISOString().slice(0, 10)),
            user: clean(req.body.user)
          };
          if (modelType !== "exammarks2") {
            delete payload.vivatotal;
            delete payload.vivaobtained;
            delete payload.vivapercentage;
            delete payload.vivagpa;
            delete payload.vivagrade;
            delete payload.theorystatus;
            delete payload.practicalstatus;
          }
          operations.push({
            updateOne: {
              filter: {
                colid,
                academicyear: payload.academicyear,
                examcode: payload.examcode,
                programcode: payload.programcode,
                semester: payload.semester,
                coursecode: payload.coursecode,
                regno: payload.regno,
                attempt: payload.attempt
              },
              update: { $set: payload },
              upsert: true
            }
          });
        });
      }
    }

    const examRollResult = examRollOperations.length ? await ConductExamRoll.bulkWrite(examRollOperations, { ordered: false }) : { upsertedCount: 0, modifiedCount: 0 };
    const result = operations.length ? await TargetModel.bulkWrite(operations, { ordered: false }) : { upsertedCount: 0, modifiedCount: 0 };
    res.json({
      success: true,
      students: students.length,
      courses: courses.length,
      generated: operations.length,
      examRollGenerated: examRollOperations.length,
      examRollUpserted: examRollResult.upsertedCount || 0,
      examRollModified: examRollResult.modifiedCount || 0,
      attendedYesRows,
      attendedNoRows,
      admitEligibleYesRows,
      admitEligibleNoRows,
      upserted: result.upsertedCount || 0,
      modified: result.modifiedCount || 0,
      modelType,
      components,
      createdCourseRows,
      skipped: skippedSemesters.length,
      skippedSemesters,
      semesterSummary: semesterPlans.map((plan) => {
        const courseCount = courses.filter((course) => clean(course.semester) === clean(plan.semester) && clean(course.academicyear) === clean(plan.academicyear)).length;
        const skippedCount = skippedSemesters.filter((item) => clean(item.semester) === clean(plan.semester) && clean(item.academicyear) === clean(plan.academicyear)).length;
        return {
          ...plan,
          courses: courseCount,
          examRollRows: courseCount * Math.max(students.length - skippedCount, 0),
          marksRows: "Only attended Yes rows",
          skippedStudents: skippedCount
        };
      })
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
