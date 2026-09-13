const ConductExam = require("../Models/conductexamds");
const ConductExamCourse = require("../Models/conductexamcourseds");
const ConductExamRoll = require("../Models/conductexamrollds");
const PaperSetter = require("../Models/conductexampapersetterds");
const Moderator = require("../Models/conductexammoderatords");
const Stationary = require("../Models/conductexamstationaryds");
const InvigilatorAllocation = require("../Models/conductexaminvigilatorallocationds");
const GradingTemplate = require("../Models/exammodel2gradingtemplateds");
const GradingTemplateDetail = require("../Models/exammodel2gradingtemplatedetailds");
const InsDetails = require("../Models/insdetails");

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const uniqueSorted = (values = []) => Array.from(new Set(values.map(text).filter(Boolean)))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const same = (a, b) => text(a).toLowerCase() === text(b).toLowerCase();
const programKey = (row = {}) => text(row.programcode) || text(row.program);
const courseKey = (row = {}) => [
  row.programcode,
  row.semester,
  row.coursecode
].map(text).join("||");
const roomKey = (row = {}) => [
  row.examdate,
  row.slot,
  row.campus,
  row.building,
  row.room
].map(text).join("||");

const countMatches = (courseKeys, rows) => {
  const set = new Set(rows.map(courseKey).filter(Boolean));
  return courseKeys.filter((key) => set.has(key)).length;
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const exams = await ConductExam.find({ colid }).select("academicyear examname examcode").sort({ academicyear: -1, examname: 1 }).lean();
    const courseExams = await ConductExamCourse.find({ colid }).select("academicyear exam examcode").sort({ academicyear: -1, exam: 1 }).lean();
    const all = [
      ...exams.map((row) => ({ academicyear: row.academicyear, exam: row.examname, examcode: row.examcode })),
      ...courseExams.map((row) => ({ academicyear: row.academicyear, exam: row.exam, examcode: row.examcode }))
    ];
    res.json({
      success: true,
      options: {
        academicyear: uniqueSorted(all.map((row) => row.academicyear)),
        exams: all
          .filter((row) => text(row.academicyear) && text(row.examcode))
          .reduce((acc, row) => {
            const key = `${text(row.academicyear)}||${text(row.examcode)}`;
            if (!acc.map.has(key)) {
              acc.map.set(key, true);
              acc.data.push({ academicyear: text(row.academicyear), exam: text(row.exam), examcode: text(row.examcode), label: `${text(row.exam) || text(row.examcode)} (${text(row.examcode)})` });
            }
            return acc;
          }, { map: new Map(), data: [] }).data
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to load exam conduct doctor options" });
  }
};

exports.report = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    const academicyear = text(req.query.academicyear);
    const examcode = text(req.query.examcode);
    if (colid === undefined || !academicyear || !examcode) {
      return res.status(400).json({ success: false, message: "colid, academic year and exam code are required" });
    }

    const examDoc = await ConductExam.findOne({ colid, academicyear, examcode }).lean();
    const exam = text(req.query.exam || examDoc?.examname);
    const filter = { colid, academicyear, examcode };
    const [courses, rolls, setters, moderators, stationary, invigilators, templates, templateDetails, institution] = await Promise.all([
      ConductExamCourse.find(filter).sort({ program: 1, semester: 1, course: 1 }).lean(),
      ConductExamRoll.find(filter).select("program programcode semester course coursecode student regno").lean(),
      PaperSetter.find(filter).select("program programcode semester course coursecode papersetteremail status").lean(),
      Moderator.find(filter).select("program programcode semester course coursecode moderatoremail status").lean(),
      Stationary.find({ colid, academicyear }).lean(),
      InvigilatorAllocation.find(filter).lean(),
      GradingTemplate.find({ colid, academicyear, status: { $not: /^inactive$/i } }).lean(),
      GradingTemplateDetail.find({ colid, academicyear }).lean(),
      InsDetails.findOne({ colid }).sort({ _id: -1 }).lean()
    ]);

    const programs = new Map();
    courses.forEach((row) => {
      const key = programKey(row);
      if (!key) return;
      if (!programs.has(key)) programs.set(key, { key, program: text(row.program), programcode: text(row.programcode), regulation: text(row.regulation), semesters: new Set() });
      if (text(row.semester)) programs.get(key).semesters.add(text(row.semester));
    });
    rolls.forEach((row) => {
      const key = programKey(row);
      if (!key || programs.has(key)) return;
      programs.set(key, { key, program: text(row.program), programcode: text(row.programcode), regulation: "", semesters: new Set([text(row.semester)].filter(Boolean)) });
    });

    const byProgram = (rows) => rows.reduce((map, row) => {
      const key = programKey(row);
      if (!key) return map;
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
      return map;
    }, new Map());

    const coursesByProgram = byProgram(courses);
    const rollsByProgram = byProgram(rolls);
    const settersByProgram = byProgram(setters);
    const moderatorsByProgram = byProgram(moderators);
    const stationaryByProgram = byProgram(stationary);
    const invigilatorRooms = new Set(invigilators.map(roomKey).filter(Boolean));
    const totalGradingSchemes = templates.length || uniqueSorted(templateDetails.map((row) => row.templateid)).length;
    const totalGradingDetails = templateDetails.length;

    const programDetails = Array.from(programs.values()).map((program, index) => {
      const programCourses = coursesByProgram.get(program.key) || [];
      const programCourseKeys = uniqueSorted(programCourses.map(courseKey));
      const paperSetterCount = countMatches(programCourseKeys, settersByProgram.get(program.key) || []);
      const moderatorCount = countMatches(programCourseKeys, moderatorsByProgram.get(program.key) || []);
      const timetableCount = programCourseKeys.filter((key) => {
        const row = programCourses.find((item) => courseKey(item) === key);
        return text(row?.examdate) && text(row?.examslot);
      }).length;
      const programRolls = rollsByProgram.get(program.key) || [];
      const uniqueStudents = new Set(programRolls.map((row) => text(row.regno)).filter(Boolean));
      const stationaryCount = (stationaryByProgram.get(program.key) || []).filter((row) => !text(row.regulation) || !program.regulation || same(row.regulation, program.regulation)).length;
      const readiness = [
        programCourseKeys.length > 0,
        totalGradingSchemes > 0,
        totalGradingDetails > 0,
        paperSetterCount === programCourseKeys.length && programCourseKeys.length > 0,
        moderatorCount === programCourseKeys.length && programCourseKeys.length > 0,
        timetableCount === programCourseKeys.length && programCourseKeys.length > 0,
        uniqueStudents.size > 0,
        stationaryCount > 0,
        invigilatorRooms.size > 0
      ];
      const readinesspercent = Number(((readiness.filter(Boolean).length / readiness.length) * 100).toFixed(2));
      return {
        id: program.key || index,
        academicyear,
        exam,
        examcode,
        program: program.program,
        programcode: program.programcode,
        regulation: program.regulation,
        semesters: Array.from(program.semesters).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(", "),
        coursecount: programCourseKeys.length,
        gradingtemplatecount: totalGradingSchemes,
        gradingtemplatedetailcount: totalGradingDetails,
        vivagradingtemplatecount: totalGradingSchemes,
        vivagradingtemplatedetailcount: totalGradingDetails,
        papersettercoursecount: paperSetterCount,
        moderatorcoursecount: moderatorCount,
        timetablecoursecount: timetableCount,
        stationarycount: stationaryCount,
        invigilatorroomcount: invigilatorRooms.size,
        examrollcount: programRolls.length,
        studentcount: uniqueStudents.size,
        readinesspercent,
        status: readinesspercent === 100 ? "Ready" : readinesspercent >= 60 ? "Partial" : "Pending",
        mismatch: [
          programCourseKeys.length ? "" : "No exam courses",
          totalGradingSchemes ? "" : "No grading template",
          totalGradingDetails ? "" : "No grading template details",
          paperSetterCount === programCourseKeys.length && programCourseKeys.length ? "" : "Paper setter pending",
          moderatorCount === programCourseKeys.length && programCourseKeys.length ? "" : "Moderator pending",
          timetableCount === programCourseKeys.length && programCourseKeys.length ? "" : "Exam timetable pending",
          uniqueStudents.size ? "" : "No examroll students",
          stationaryCount ? "" : "No stationery details",
          invigilatorRooms.size ? "" : "No invigilator room allocation"
        ].filter(Boolean).join("; ") || "Ready"
      };
    }).sort((a, b) => a.program.localeCompare(b.program) || a.programcode.localeCompare(b.programcode));

    const courseDetails = courses.map((row, index) => {
      const key = courseKey(row);
      const paperSetters = setters.filter((item) => courseKey(item) === key);
      const courseModerators = moderators.filter((item) => courseKey(item) === key);
      const courseRolls = rolls.filter((item) => courseKey(item) === key);
      return {
        id: `${key}-${index}`,
        program: row.program,
        programcode: row.programcode,
        semester: row.semester,
        course: row.course,
        coursecode: row.coursecode,
        coursetype: row.coursetype,
        examdate: row.examdate || "",
        examslot: row.examslot || "",
        papersetter: paperSetters.length ? "Yes" : "No",
        moderator: courseModerators.length ? "Yes" : "No",
        examrollcount: courseRolls.length,
        studentcount: new Set(courseRolls.map((item) => text(item.regno)).filter(Boolean)).size,
        status: paperSetters.length && courseModerators.length && text(row.examdate) && text(row.examslot) && courseRolls.length ? "Ready" : "Pending",
        mismatch: [
          paperSetters.length ? "" : "Paper setter missing",
          courseModerators.length ? "" : "Moderator missing",
          text(row.examdate) && text(row.examslot) ? "" : "Date/slot missing",
          courseRolls.length ? "" : "Examroll missing"
        ].filter(Boolean).join("; ") || "Ready"
      };
    });

    const semesterStudentDetails = Array.from(rolls.reduce((map, row) => {
      const key = [row.programcode, row.semester].map(text).join("||");
      const item = map.get(key) || { id: key, program: row.program, programcode: row.programcode, semester: row.semester, examrollcount: 0, students: new Set() };
      item.examrollcount += 1;
      if (text(row.regno)) item.students.add(text(row.regno));
      map.set(key, item);
      return map;
    }, new Map()).values()).map((row) => ({ ...row, studentcount: row.students.size, students: undefined }));

    const sum = (field) => programDetails.reduce((total, row) => total + (number(row[field], 0) || 0), 0);
    const readyPrograms = programDetails.filter((row) => row.status === "Ready").length;
    const partialPrograms = programDetails.filter((row) => row.status === "Partial").length;
    const pendingPrograms = programDetails.filter((row) => row.status === "Pending").length;

    res.json({
      success: true,
      institution,
      exam: { academicyear, exam, examcode },
      summary: {
        programs: programDetails.length,
        courses: sum("coursecount"),
        gradingTemplates: totalGradingSchemes,
        vivaGradingTemplates: totalGradingSchemes,
        paperSetterCourses: sum("papersettercoursecount"),
        moderatorCourses: sum("moderatorcoursecount"),
        timetableCourses: sum("timetablecoursecount"),
        stationaryPrograms: programDetails.filter((row) => row.stationarycount > 0).length,
        invigilatorRooms: invigilatorRooms.size,
        examrollRows: sum("examrollcount"),
        students: sum("studentcount"),
        readyPrograms,
        partialPrograms,
        pendingPrograms
      },
      charts: {
        readiness: [
          { name: "Ready", count: readyPrograms },
          { name: "Partial", count: partialPrograms },
          { name: "Pending", count: pendingPrograms }
        ],
        coverage: [
          { name: "Courses", count: sum("coursecount") },
          { name: "Paper Setter", count: sum("papersettercoursecount") },
          { name: "Moderator", count: sum("moderatorcoursecount") },
          { name: "Timetable", count: sum("timetablecoursecount") },
          { name: "Students", count: sum("studentcount") },
          { name: "Rooms", count: invigilatorRooms.size }
        ],
        programStudents: programDetails.map((row) => ({ name: row.programcode || row.program, students: row.studentcount })),
        programCourses: programDetails.map((row) => ({ name: row.programcode || row.program, courses: row.coursecount, timetable: row.timetablecoursecount }))
      },
      programDetails,
      courseDetails,
      semesterStudentDetails
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to run exam conduct doctor" });
  }
};
