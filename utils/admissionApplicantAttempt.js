const pick = (source, fields) => Object.fromEntries(fields.filter(field => source[field] !== undefined).map(field => [field, source[field]]));
function applicantAttempt(value) {
  if (!value) return null;
  const source = typeof value.toObject === "function" ? value.toObject() : value;
  const result = pick(source, ["_id", "examid", "examcontext", "starttime", "submittime", "status", "remainingseconds", "autosubmitted", "submitreason"]);
  result.answers = (source.answers || []).map(answer => pick(answer, ["_id", "sectionid", "questionid", "questiontype", "selectedoptionid", "selectedoptiontext", "answertext", "attachmenturl", "attachments", "contentblocks", "tabledata", "drawingdataurl", "imageurl", "imagefilename", "fileurl", "filefilename", "linkurl"]));
  return result;
}
const applicantAttemptResponse = attempt => /^admission$/i.test(String(attempt?.examcontext || "")) ? applicantAttempt(attempt) : attempt;
module.exports = { applicantAttempt, applicantAttemptResponse };
