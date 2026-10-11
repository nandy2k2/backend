const mongoose = require("mongoose");

const AttachmentSchema = new mongoose.Schema({
  title: String,
  url: String,
  filename: String,
  mimetype: String
}, { _id: false });

const OptionSchema = new mongoose.Schema({
  optiontext: String,
  iscorrect: { type: Boolean, default: false }
}, { _id: true });

const QuestionSchema = new mongoose.Schema({
  questiontext: String,
  questionhtml: String,
  questiontype: { type: String, default: "MCQ" },
  marks: { type: Number, default: 1 },
  options: [OptionSchema],
  answerkey: String,
  explanation: String,
  modules: [String],
  topics: [String],
  cos: [String],
  bloomlevels: [String],
  tabledata: [[String]],
  attachments: [AttachmentSchema],
  order: { type: Number, default: 0 }
}, { _id: true });

const SectionSchema = new mongoose.Schema({
  sectionname: String,
  sectiontype: { type: String, default: "MCQ" },
  instructions: String,
  order: { type: Number, default: 0 },
  questions: [QuestionSchema]
}, { _id: true });

const ExamSchema = new mongoose.Schema({
  zone: { type: String, enum: ["Practice", "Certification"], default: "Practice", index: true },
  category: { type: String, index: true },
  examname: String,
  examcode: { type: String, index: true },
  durationminutes: { type: Number, default: 60 },
  instructions: String,
  passpercentage: { type: Number, default: 80 },
  status: { type: String, default: "Published", index: true },
  sections: [SectionSchema],
  user: String,
  username: String,
  colid: Number
}, { timestamps: true });

const AnswerSchema = new mongoose.Schema({
  sectionid: String,
  sectionname: String,
  questionid: String,
  questiontext: String,
  questionhtml: String,
  questiontype: String,
  selectedoptionid: String,
  selectedoptiontext: String,
  answertext: String,
  correctanswer: String,
  iscorrect: Boolean,
  maxmarks: { type: Number, default: 0 },
  marksobtained: { type: Number, default: 0 },
  comments: String
}, { _id: true });

const AttemptSchema = new mongoose.Schema({
  zone: { type: String, enum: ["Practice", "Certification"], default: "Practice", index: true },
  examid: { type: mongoose.Schema.Types.ObjectId, ref: "skillzoneexamds", index: true },
  category: String,
  examname: String,
  examcode: String,
  student: String,
  email: { type: String, index: true },
  regno: String,
  starttime: Date,
  submittime: Date,
  status: { type: String, default: "Submitted" },
  autosubmitted: { type: String, default: "No" },
  submitreason: String,
  remainingseconds: { type: Number, default: 0 },
  deviceid: String,
  totalmarks: { type: Number, default: 0 },
  marksobtained: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  passstatus: { type: String, default: "Pending" },
  answers: [AnswerSchema],
  colid: Number
}, { timestamps: true });

const AccessSchema = new mongoose.Schema({
  email: { type: String, index: true },
  regno: String,
  student: String,
  originalamount: { type: Number, default: 600 },
  amount: { type: Number, default: 600 },
  discountamount: { type: Number, default: 0 },
  couponcode: String,
  orderid: String,
  paymentstatus: { type: String, default: "Pending" },
  accessfrom: Date,
  accesstill: Date,
  colid: Number
}, { timestamps: true });

const ProjectStepSchema = new mongoose.Schema({
  steptitle: String,
  description: String,
  task: String,
  diagramlink: String,
  imagelink: String,
  tabledata: [[String]],
  maxmarks: { type: Number, default: 10 },
  order: { type: Number, default: 0 }
}, { _id: true });

const ProjectSchema = new mongoose.Schema({
  category: { type: String, index: true },
  projecttitle: String,
  description: String,
  difficulty: String,
  status: { type: String, default: "Published", index: true },
  steps: [ProjectStepSchema],
  user: String,
  username: String,
  colid: Number
}, { timestamps: true });

const StepResponseSchema = new mongoose.Schema({
  stepid: String,
  steptitle: String,
  response: String,
  filelink: String,
  marksobtained: { type: Number, default: 0 },
  maxmarks: { type: Number, default: 0 },
  aicomments: String,
  usercomments: String,
  status: { type: String, default: "Submitted" }
}, { _id: true });

const ProjectSubmissionSchema = new mongoose.Schema({
  projectid: { type: mongoose.Schema.Types.ObjectId, ref: "skillzoneprojectds", index: true },
  category: String,
  projecttitle: String,
  student: String,
  email: { type: String, index: true },
  regno: String,
  status: { type: String, default: "Submitted", index: true },
  totalmarks: { type: Number, default: 0 },
  marksobtained: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  reviewercomments: String,
  redoinstructions: String,
  responses: [StepResponseSchema],
  colid: Number
}, { timestamps: true });

const CertificateSchema = new mongoose.Schema({
  student: String,
  email: { type: String, index: true },
  regno: String,
  projectsubmissionid: String,
  certificationattemptid: String,
  projecttitle: String,
  examname: String,
  certificatecode: { type: String, index: true },
  issuedate: Date,
  status: { type: String, default: "Issued" },
  colid: Number
}, { timestamps: true });

const CouponSchema = new mongoose.Schema({
  couponcode: { type: String, index: true },
  discountamount: { type: Number, default: 0 },
  fromdate: Date,
  todate: Date,
  status: { type: String, default: "Active", index: true },
  user: String,
  username: String,
  colid: Number
}, { timestamps: true });

const CertificationProjectLinkSchema = new mongoose.Schema({
  category: { type: String, index: true },
  examids: [String],
  examnames: [String],
  projectids: [String],
  projecttitles: [String],
  status: { type: String, default: "Active", index: true },
  user: String,
  username: String,
  colid: Number
}, { timestamps: true });

const ClassSchema = new mongoose.Schema({
  classdate: Date,
  classtime: String,
  topic: String,
  category: { type: String, index: true },
  link: String,
  capacity: { type: Number, default: 0 },
  status: { type: String, default: "Active", index: true },
  user: String,
  username: String,
  colid: Number
}, { timestamps: true });

const ClassRegistrationSchema = new mongoose.Schema({
  classid: { type: mongoose.Schema.Types.ObjectId, ref: "skillzoneclassds", index: true },
  classdate: Date,
  classtime: String,
  topic: String,
  category: String,
  student: String,
  email: { type: String, index: true },
  regno: String,
  registrationstatus: { type: String, default: "Confirmed", index: true },
  enabled: { type: String, default: "Yes", index: true },
  waitlistno: { type: Number, default: 0 },
  registeredat: Date,
  cancelledat: Date,
  colid: Number
}, { timestamps: true });

module.exports = {
  SkillZoneExam: mongoose.models.skillzoneexamds || mongoose.model("skillzoneexamds", ExamSchema),
  SkillZoneAttempt: mongoose.models.skillzoneattemptds || mongoose.model("skillzoneattemptds", AttemptSchema),
  SkillZoneAccess: mongoose.models.skillzoneaccessds || mongoose.model("skillzoneaccessds", AccessSchema),
  SkillZoneProject: mongoose.models.skillzoneprojectds || mongoose.model("skillzoneprojectds", ProjectSchema),
  SkillZoneProjectSubmission: mongoose.models.skillzoneprojectsubmissionds || mongoose.model("skillzoneprojectsubmissionds", ProjectSubmissionSchema),
  SkillZoneCertificate: mongoose.models.skillzonecertificateds || mongoose.model("skillzonecertificateds", CertificateSchema),
  SkillZoneCoupon: mongoose.models.skillzonecouponds || mongoose.model("skillzonecouponds", CouponSchema),
  SkillZoneCertificationProjectLink: mongoose.models.skillzonecertificationprojectlinkds || mongoose.model("skillzonecertificationprojectlinkds", CertificationProjectLinkSchema),
  SkillZoneClass: mongoose.models.skillzoneclassds || mongoose.model("skillzoneclassds", ClassSchema),
  SkillZoneClassRegistration: mongoose.models.skillzoneclassregistrationds || mongoose.model("skillzoneclassregistrationds", ClassRegistrationSchema)
};
