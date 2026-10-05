/**
 * Minimal, dependency-free Code 39 barcode renderer.
 *
 * Each character is 9 elements (5 bars + 4 spaces), three of which are wide.
 * Patterns below are the standard 12-module form: narrow = 1 module,
 * wide = 2 modules, "1" = bar, "0" = space.
 */

export const CODE39_TABLE = {
  0: "101001101101",
  1: "110100101011",
  2: "101100101011",
  3: "110110010101",
  4: "101001101011",
  5: "110100110101",
  6: "101100110101",
  7: "101001011011",
  8: "110100101101",
  9: "101100101101",
  A: "110101001011",
  B: "101101001011",
  C: "110110100101",
  D: "101011001011",
  E: "110101100101",
  F: "101101100101",
  G: "101010011011",
  H: "110101001101",
  I: "101101001101",
  J: "101011001101",
  K: "110101010011",
  L: "101101010011",
  M: "110110101001",
  N: "101011010011",
  O: "110101101001",
  P: "101101101001",
  Q: "101010110011",
  R: "110101011001",
  S: "101101011001",
  T: "101011011001",
  U: "110010101011",
  V: "100110101011",
  W: "110011010101",
  X: "100101101011",
  Y: "110010110101",
  Z: "100110110101",
  "-": "100101011011",
  ".": "110010101101",
  " ": "100110101101",
  $: "100100100101",
  "/": "100100101001",
  "+": "100101001001",
  "%": "101001001001",
  "*": "100101101101", // start / stop guard
};

export const CODE39_START_STOP = "*";

/** Split a 12-module pattern into its 9 alternating elements (bar first). */
export function parsePattern(pattern) {
  const elements = [];
  let index = 0;
  let isBar = true;
  while (index < pattern.length) {
    const width = pattern[index] === "1" ? 1 : 0;
    const runLength = pattern[index] === pattern[index + 1] ? 2 : 1;
    elements.push({ bar: isBar, wide: runLength === 2 });
    index += runLength;
    isBar = !isBar;
  }
  return elements;
}

export function isEncodable(text) {
  const value = String(text ?? "");
  if (!value) return false;
  return [...value].every((char) => Object.prototype.hasOwnProperty.call(CODE39_TABLE, char));
}

/**
 * Encode text (without guards) into a module string.
 * Returns null when the text is empty or contains an unsupported character.
 */
export function encodeCode39(text) {
  const value = String(text ?? "").toUpperCase();
  if (!isEncodable(value)) return null;
  const characters = [CODE39_START_STOP, ...value, CODE39_START_STOP];
  return characters.map((char) => CODE39_TABLE[char]).join("0"); // 1-module inter-character gap
}

/**
 * Render an SVG barcode. Returns "" when the text cannot be encoded.
 * Options: height (bar height px), moduleWidth (narrow module px),
 * quietZone (px of padding each side), showText (print the value below).
 */
export function code39Svg(text, options = {}) {
  const { height = 62, moduleWidth = 2, quietZone = 10, showText = true } = options;
  const value = String(text ?? "").toUpperCase();
  const modules = encodeCode39(value);
  if (!modules) return "";

  const bars = [];
  for (let index = 0; index < modules.length; ) {
    if (modules[index] !== "1") {
      index += 1;
      continue;
    }
    let end = index;
    while (end < modules.length && modules[end] === "1") end += 1;
    bars.push(
      `<rect x="${quietZone + index * moduleWidth}" y="0" width="${(end - index) * moduleWidth}" height="${height}"/>`,
    );
    index = end;
  }

  const textHeight = showText ? 18 : 0;
  const width = modules.length * moduleWidth + quietZone * 2;
  const totalHeight = height + textHeight;
  const label = showText
    ? `<text x="${width / 2}" y="${height + 13}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" letter-spacing="3" fill="#0b1220">${value}</text>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}"`,
    ` role="img" aria-label="Code 39 barcode for ${value}" preserveAspectRatio="xMidYMid meet">`,
    `<rect width="${width}" height="${totalHeight}" fill="#ffffff"/>`,
    `<g fill="#0b1220">${bars.join("")}</g>`,
    label,
    "</svg>",
  ].join("");
}
