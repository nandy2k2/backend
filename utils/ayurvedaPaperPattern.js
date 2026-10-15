const specs = [{ count: 20, marks: 1, type: "MCQ" }, { count: 8, marks: 5, type: "Descriptive" }, { count: 4, marks: 10, type: "Descriptive" }];
const patternRows = () => specs.flatMap((spec, s) => Array.from({ length: spec.count }, (_, q) => ({
  section: `Section ${s + 1}`, question: `${s + 1}.${q + 1}`, questiontype: spec.type,
  marks: spec.marks, group: "", subquestion: "", order: q + 1, instructions: "Answer all questions."
})));

function validate(sections, requireContent = false) {
  if (!Array.isArray(sections) || sections.length !== 3) return "Ayurveda paper must contain exactly 3 sections";
  for (let s = 0; s < specs.length; s += 1) {
    const questions = sections[s].questions || [];
    if (questions.length !== specs[s].count) return `Section ${s + 1} must have exactly ${specs[s].count} questions`;
    for (let q = 0; q < questions.length; q += 1) {
      const item = questions[q];
      if (Number(item.marks) !== specs[s].marks || item.questiontype !== specs[s].type || item.patternquestion !== `${s + 1}.${q + 1}`) return `Question ${s + 1}.${q + 1} must retain its fixed number, type and ${specs[s].marks} mark(s)`;
      if (requireContent && !String(item.question || item.questionhtml || item.imageurl || item.drawingdataurl || "").trim() && !(item.contentblocks || []).length) return `Enter question ${s + 1}.${q + 1} before submitting`;
    }
    if (sections[s].title !== `Section ${s + 1}` || Number(sections[s].marks) !== specs[s].count * specs[s].marks) return `Section ${s + 1} title and total marks cannot be changed`;
  }
  return "";
}
module.exports = { patternRows, validate };
