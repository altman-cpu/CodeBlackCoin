import test from "node:test";
import assert from "node:assert/strict";

import { CODE39_TABLE, encodeCode39, code39Svg, parsePattern, isEncodable } from "../public/lib/code39.js";

test("every Code 39 pattern is 12 modules with 5 bars, 4 spaces and 3 wide elements", () => {
  for (const [char, pattern] of Object.entries(CODE39_TABLE)) {
    assert.equal(pattern.length, 12, `${char} is 12 modules`);
    assert.match(pattern, /^[01]+$/, `${char} is binary`);
    const elements = parsePattern(pattern);
    assert.equal(elements.length, 9, `${char} has 9 elements`);
    assert.equal(elements.filter((el) => el.bar).length, 5, `${char} has 5 bars`);
    assert.equal(elements.filter((el) => el.wide).length, 3, `${char} has 3 wide elements`);
  }
});

test("encodeCode39 wraps the text in start/stop guards", () => {
  const encoded = encodeCode39("S12");
  assert.equal(encoded.slice(0, 12), CODE39_TABLE["*"]);
  assert.equal(encoded.slice(-12), CODE39_TABLE["*"]);
  assert.equal(encoded.length, 5 * 12 + 4, "2 guards + 3 characters, 12 modules each, plus 4 gaps");
  assert.equal(encodeCode39(""), null, "empty input is rejected");
  assert.equal(encodeCode39("s12"), encodeCode39("S12"), "input is upper-cased before encoding");
  assert.equal(encodeCode39("906_S12"), null, "underscore is not in the Code 39 alphabet");
  assert.equal(isEncodable("906-S12"), true);
  assert.equal(isEncodable("906_S12"), false);
});

test("code39Svg emits one rect per bar run and an accessible label", () => {
  const svg = code39Svg("906S12", { moduleWidth: 2, height: 60 });
  assert.ok(svg.startsWith("<svg"));
  const rects = svg.match(/<rect /g) ?? [];
  assert.ok(rects.length > 40, "draws the background plus many bars");
  assert.match(svg, /aria-label="Code 39 barcode for 906S12"/);
  assert.match(svg, />906S12<\/text>/);
  assert.equal(code39Svg("bad_code"), "", "unencodable input renders nothing");
});
