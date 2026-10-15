function projectText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(projectText).filter(Boolean).join("\n\n");
  if (typeof value === "object") {
    return Object.entries(value).map(([key, content]) => {
      const rendered = projectText(content);
      return rendered ? `${key}: ${rendered}` : "";
    }).filter(Boolean).join("\n\n");
  }
  return String(value).trim();
}

function normalizeProjectSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map(step => {
    const source = step && typeof step === "object" && !Array.isArray(step) ? step : { task: step };
    const normalized = { ...source };
    for (const field of ["steptitle", "description", "task", "diagramlink", "imagelink"]) {
      if (source[field] !== undefined) normalized[field] = projectText(source[field]);
    }
    return normalized;
  });
}

module.exports = { projectText, normalizeProjectSteps };
