const fields = ["blockno", "regno", "coursecode", "examcode", "section"];
const defaultLayout = {
  barcode: { x: 66, y: 1 },
  texts: [
    { field: "blockno", x: 2, y: 2, width: 61, font: 9, align: "left", bold: true },
    { field: "regno", x: 2, y: 10, width: 61, font: 9, align: "left", bold: true },
    { field: "coursecode", x: 2, y: 18, width: 61, font: 9, align: "left", bold: true },
    { field: "examcode", x: 66, y: 20, width: 33, font: 7, align: "center", bold: true },
    { field: "section", x: 66, y: 23, width: 33, font: 6, align: "center", bold: true }
  ]
};
function validateLayout(layout) {
  const number = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
  if (!layout?.barcode || !number(layout.barcode.x, 1, 66) || !number(layout.barcode.y, 1, 6.8)) throw new Error("AI layout places the barcode outside the label");
  if (!Array.isArray(layout.texts) || layout.texts.length !== fields.length || new Set(layout.texts.map(row => row.field)).size !== fields.length) throw new Error("AI layout must contain all five label fields exactly once");
  const texts = layout.texts.map(row => {
    if (!fields.includes(row.field) || !number(row.x, 0, 99) || !number(row.y, 0, 25) || !number(row.width, 5, 99) || row.x + row.width > 100 || !number(row.font, 5, 11) || row.y + row.font * 0.3528 * 1.15 > 26) throw new Error("AI layout contains invalid text dimensions");
    const height = row.font * 0.3528 * 1.15;
    if (row.x < layout.barcode.x + 33 && row.x + row.width > layout.barcode.x && row.y < layout.barcode.y + 18.2 && row.y + height > layout.barcode.y) throw new Error("AI text overlaps the barcode; refine the formatting prompt");
    return { field: row.field, x: row.x, y: row.y, width: row.width, font: row.font, align: ["left", "center", "right"].includes(row.align) ? row.align : "left", bold: Boolean(row.bold) };
  });
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.font * 0.3528 * 1.15 && a.y + a.font * 0.3528 * 1.15 > b.y) throw new Error("AI layout text fields overlap; refine the formatting prompt");
  }
  return { barcode: { x: layout.barcode.x, y: layout.barcode.y }, texts };
}
module.exports = { defaultLayout, validateLayout };
