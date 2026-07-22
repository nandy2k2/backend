// scholarshipdsctlr.js
const Scholarshipds = require("../Models/scholarshipds");
const User = require("../Models/user");
const AdmissionApplicationDynamic = require("../Models/admissionapplicationdynamic");
const ExaminationModel2Marks = require("../Models/examinationmodel2marksds");
const ExamMarks2 = require("../Models/exammarks2ds");

const clean = (value) => String(value ?? "").trim();
const lower = (value) => clean(value).toLowerCase();
const numberValue = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};
const isAnyValue = (value) => {
  const item = lower(value);
  return !item || ["all", "any", "na", "n/a", "not applicable"].includes(item);
};
const isActiveScholarship = (item) => {
  const status = lower(item.status);
  return !status || ["active", "yes", "1", "open", "available"].includes(status);
};
const matchesAny = (requirement, values) => {
  if (isAnyValue(requirement)) return true;
  const required = lower(requirement);
  return values.some((item) => lower(item) === required);
};
const betweenDates = (startdate, enddate) => {
  const today = new Date();
  const start = startdate ? new Date(startdate) : null;
  const end = enddate ? new Date(enddate) : null;
  if (start && !Number.isNaN(start.getTime()) && today < start) return false;
  if (end && !Number.isNaN(end.getTime()) && today > end) return false;
  return true;
};
const highest = (values) => values.map(numberValue).filter((value) => value !== null).reduce((max, value) => Math.max(max, value), 0);
const getExtraFieldValue = (application, keys) => {
  const extras = application?.extraFields && typeof application.extraFields === "object" ? application.extraFields : {};
  const source = { ...(application?._doc || application || {}), ...extras };
  const wanted = keys.map(lower);
  const foundKey = Object.keys(source).find((key) => wanted.includes(lower(key).replace(/\s+/g, "")) || wanted.includes(lower(key)));
  return foundKey ? source[foundKey] : "";
};
const summarizeOriginalMarks = (rows = []) => {
  const percentages = rows.map((row) => row.overallpercentage);
  const gradepoints = rows.map((row) => row.overallgradepoint);
  const credits = rows.map((row) => numberValue(row.credit) || 0);
  const gpas = rows.map((row) => numberValue(row.gpa) || 0);
  const totalCredits = credits.reduce((sum, value) => sum + value, 0);
  return {
    count: rows.length,
    bestpercentage: highest(percentages),
    bestgradepoint: highest(gradepoints),
    cgpa: totalCredits ? Number((gpas.reduce((sum, value) => sum + value, 0) / totalCredits).toFixed(2)) : highest(gradepoints),
    rows: rows.slice(0, 25)
  };
};
const summarizeMarks2 = (rows = []) => {
  const percentages = rows.map((row) => {
    const obtained = ["thobtained", "probtained", "iatobtained", "iapobtained"].reduce((sum, key) => sum + (numberValue(row[key]) || 0), 0);
    const max = ["thmax", "prmax", "iatmax", "iapmax"].reduce((sum, key) => sum + (numberValue(row[key]) || 0), 0);
    return max ? (obtained / max) * 100 : 0;
  });
  return {
    count: rows.length,
    bestpercentage: Number(highest(percentages).toFixed(2)),
    bestgradepoint: Number((highest(percentages) / 10).toFixed(2)),
    cgpa: Number((highest(percentages) / 10).toFixed(2)),
    rows: rows.slice(0, 25)
  };
};

// Create Scholarship Endpoint
exports.createscholarshipds = async (req, res) => {
  try {
    const { name, user, colid, scholarshipname, amount, category, program, programcode, applicationtype, applicationwebsite, startdate, enddate } = req.body;
    const newScholarship = await Scholarshipds.create({
      name,
      user,
      colid: parseInt(colid),
      scholarshipname,
      amount,
      category,
      program,
      programcode,
      applicationtype: clean(applicationtype) || "Internal",
      applicationwebsite: clean(applicationwebsite),
      startdate,
      enddate
    });
    res.status(200).json({ success: true, scholarship: newScholarship });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating scholarship", error: error.message });
  }
};

exports.getallscholarshipds = async (req, res) => {
  try {
    const { colid } = req.query;
    if (colid) {
      const scholarships = await Scholarshipds.find({ colid: parseInt(colid) });
      return res.status(200).json({ success: true, scholarships });
    }
    res.status(200).json({ success: true, scholarships: []  }); // Return empty if no colid
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching scholarships", error: error.message });
  }
};


// Filter Scholarships Endpoint (for applications)
exports.filterscholarshipds = async (req, res) => {
  try {
    const { category, programcode, colid } = req.query;
    const filteredScholarships = await Scholarshipds.find({
      category,
      programcode,
      colid: parseInt(colid),
    });
    res.status(200).json({ success: true, scholarships: filteredScholarships });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error filtering scholarships", error: error.message });
  }
};

// Edit Scholarship - POST (not PUT), data from req.body, id from req.query
exports.editscholarshipds = async (req, res) => {
  try {
    const { id } = req.query;
    // Only allow fields to be updated that make sense
    const update = req.body;
    const updatedScholarship = await Scholarshipds.findByIdAndUpdate(id, update, { new: true });
    if (!updatedScholarship)
      return res.status(404).json({ success: false, message: "Scholarship not found" });
    res.status(200).json({ success: true, scholarship: updatedScholarship });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating scholarship", error: error.message });
  }
};

// Delete Scholarship - GET (not DELETE), id from req.query
exports.deletescholarshipds = async (req, res) => {
  try {
    const { id } = req.query;
    const deletedScholarship = await Scholarshipds.findByIdAndDelete(id);
    if (!deletedScholarship)
      return res.status(404).json({ success: false, message: "Scholarship not found" });
    res.status(200).json({ success: true, scholarship: deletedScholarship });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting scholarship", error: error.message });
  }
};

exports.suggestScholarshipsForStudent = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const regno = clean(req.query.regno);
    const email = clean(req.query.email || req.query.user);
    const marksSource = lower(req.query.marksSource || "original");
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!regno && !email) return res.status(400).json({ success: false, message: "regno or email is required" });

    const userQuery = { colid, role: /student/i };
    if (regno && email) {
      userQuery.$or = [{ regno }, { email }];
    } else if (regno) {
      userQuery.regno = regno;
    } else {
      userQuery.email = email;
    }
    const student = await User.findOne(userQuery).lean();
    if (!student) return res.status(404).json({ success: false, message: "Student profile not found" });

    const application = await AdmissionApplicationDynamic.findOne({
      colid,
      $or: [
        { regno: clean(student.regno) },
        { email: clean(student.email) },
        { username: clean(student.email) },
        { phone: clean(student.phone) }
      ]
    }).sort({ updatedAt: -1 }).lean();

    const [originalRows, marks2Rows, scholarships] = await Promise.all([
      marksSource === "marks2" ? [] : ExaminationModel2Marks.find({ colid, regno: clean(student.regno) }).sort({ academicyear: -1, semester: -1 }).lean(),
      marksSource === "original" ? [] : ExamMarks2.find({ colid, regno: clean(student.regno) }).sort({ year: -1, semester: -1 }).lean(),
      Scholarshipds.find({ colid }).sort({ scholarshipname: 1 }).lean()
    ]);

    const originalSummary = summarizeOriginalMarks(originalRows);
    const marks2Summary = summarizeMarks2(marks2Rows);
    const applicationCgpa = highest([application?.cgpa_10, application?.cgpa_12, application?.cgpa_UG, application?.cgpa_PG]);
    const applicationMarks = highest([application?.marks_10, application?.marks_12, application?.marks_UG, application?.marks_PG, application?.tenthmarks, application?.twelvemarks]);
    const bestCgpa = Math.max(applicationCgpa, originalSummary.cgpa || 0, marks2Summary.cgpa || 0);
    const bestPercentage = Math.max(applicationMarks, originalSummary.bestpercentage || 0, marks2Summary.bestpercentage || 0);
    const incomeValue = getExtraFieldValue(application, ["income", "familyincome", "annualincome", "incomegroup"]);

    const profileValues = {
      categories: [student.category, application?.category],
      programs: [student.program, application?.programapplied, application?.program],
      programcodes: [student.programcode, application?.programcode],
      genders: [student.gender, application?.gender],
      income: incomeValue
    };

    const evaluated = scholarships.map((scholarship) => {
      const checks = [];
      const add = (label, passed, detail) => checks.push({ label, passed, detail });
      add("Active", isActiveScholarship(scholarship), scholarship.status || "No status restriction");
      add("Date window", betweenDates(scholarship.startdate, scholarship.enddate), `${scholarship.startdate || "Any start"} to ${scholarship.enddate || "Any end"}`);
      add("Category", matchesAny(scholarship.category, profileValues.categories), `Student/application: ${profileValues.categories.filter(Boolean).join(", ") || "Not available"}`);
      add("Program", matchesAny(scholarship.program, profileValues.programs), `Student/application: ${profileValues.programs.filter(Boolean).join(", ") || "Not available"}`);
      add("Program code", matchesAny(scholarship.programcode, profileValues.programcodes), `Student/application: ${profileValues.programcodes.filter(Boolean).join(", ") || "Not available"}`);
      add("Gender", matchesAny(scholarship.gender, profileValues.genders), `Student/application: ${profileValues.genders.filter(Boolean).join(", ") || "Not available"}`);
      if (!isAnyValue(scholarship.incomegroup)) {
        add("Income group", lower(scholarship.incomegroup) === lower(profileValues.income), `Application income: ${profileValues.income || "Not available"}`);
      }
      const requiredCgpa = numberValue(scholarship.cgpa);
      if (requiredCgpa !== null && requiredCgpa > 0) {
        const score = requiredCgpa > 10 ? bestPercentage : bestCgpa;
        add(requiredCgpa > 10 ? "Minimum percentage" : "Minimum CGPA", score >= requiredCgpa, `Student best ${requiredCgpa > 10 ? "percentage" : "CGPA"}: ${score || "Not available"}`);
      }
      const passedCount = checks.filter((item) => item.passed).length;
      return {
        ...scholarship,
        eligible: checks.every((item) => item.passed),
        matchscore: checks.length ? Math.round((passedCount / checks.length) * 100) : 100,
        checks,
        reasons: checks.filter((item) => item.passed).map((item) => item.label),
        missing: checks.filter((item) => !item.passed).map((item) => item.label)
      };
    }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.matchscore - a.matchscore || clean(a.scholarshipname).localeCompare(clean(b.scholarshipname)));

    res.status(200).json({
      success: true,
      student,
      application,
      marks: {
        source: marksSource,
        original: originalSummary,
        marks2: marks2Summary,
        bestCgpa,
        bestPercentage
      },
      suggestions: evaluated.filter((item) => item.eligible),
      nearMatches: evaluated.filter((item) => !item.eligible),
      all: evaluated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error suggesting scholarships", error: error.message });
  }
};
