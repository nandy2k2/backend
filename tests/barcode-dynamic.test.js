const test = require("node:test"), assert = require("node:assert/strict");
const { defaultLayout, validateLayout } = require("../utils/barcodeLabelLayout");
const copy = () => JSON.parse(JSON.stringify(defaultLayout));
test("default dynamic barcode layout fits all fields and preserves barcode dimensions", () => {
  const result = validateLayout(copy());
  assert.equal(result.texts.length, 5);
  assert.deepEqual(result.barcode, { x: 66, y: 1 });
});
test("barcode scaling and arbitrary output fields cannot enter the validated layout", () => {
  const layout = copy(); layout.barcode.width = 1; layout.html = "<script>bad</script>";
  const result = validateLayout(layout);
  assert.equal(result.barcode.width, undefined); assert.equal(result.html, undefined);
});
test("out of bounds, missing fields, barcode overlaps and text collisions are rejected", () => {
  for (const mutate of [layout => { layout.barcode.x = 90; }, layout => { layout.texts.pop(); }, layout => { layout.texts[0].x = 66; layout.texts[0].width = 33; }, layout => { layout.texts[1].y = layout.texts[0].y; }, layout => { layout.texts[0].font = "9;color:red"; }]) {
    const layout = copy(); mutate(layout); assert.throws(() => validateLayout(layout));
  }
});
