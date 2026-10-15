const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeProjectSteps } = require("../utils/skillZoneProjectContent");
const { SkillZoneProject } = require("../Models/skilldevelopmentzoneds");

test("AI task arrays are saved as readable paragraphs without losing tasks", () => {
  const tasks = ["List three AI tools.", "Define the problem.", "Write and refine a prompt."];
  const source = [{ steptitle: "Explore", task: tasks, maxmarks: 20, order: 1 }];
  const steps = normalizeProjectSteps(source);
  assert.equal(steps[0].task, tasks.join("\n\n"));
  assert.deepEqual(source[0].task, tasks);
  const project = new SkillZoneProject({ category: "AI", projecttitle: "Project", steps });
  assert.equal(project.validateSync(), undefined);
  assert.equal(project.steps[0].maxmarks, 20);
});

test("manual rich text, step IDs, tables and images are preserved", () => {
  const source = [{ _id: "507f1f77bcf86cd799439011", task: "<p>Task with <b>formatting</b></p>", imagelink: "https://example.com/image.png", tabledata: [["A", "B"]] }];
  assert.deepEqual(normalizeProjectSteps(source), source);
});

test("nested structured AI content is readable instead of an object cast", () => {
  const steps = normalizeProjectSteps([{ task: [{ instruction: "Compare tools", evidence: ["Screenshot", "Reflection"] }], description: ["First", "Second"] }]);
  assert.equal(steps[0].task, "instruction: Compare tools\n\nevidence: Screenshot\n\nReflection");
  assert.equal(steps[0].description, "First\n\nSecond");
  assert.equal(new SkillZoneProject({ steps }).validateSync(), undefined);
  assert.deepEqual(normalizeProjectSteps(null), []);
});
