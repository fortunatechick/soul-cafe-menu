/**
 * A small QR encoder — byte mode, error correction level M, versions 1 to 13.
 *
 * Written by hand rather than pulled from npm, for the same reason nothing else
 * here comes from npm. It is deliberately narrow: a UPI payment string is ASCII
 * and about 150 characters, which fits comfortably inside version 8 or so, and
 * level M is what payment QRs use. It refuses anything larger rather than
 * silently producing a code that will not scan.
 *
 * Output is a square array of booleans — true means a dark module. Rendering is
 * the caller's problem, which keeps this file free of any DOM.
 *
 * The output was checked module-for-module against a reference implementation
 * across every supported version and all eight mask patterns.
 */

const MAX_VERSION = 13;

/* Level M, per version: [ecCodewordsPerBlock, blocksA, dataPerA, blocksB, dataPerB] */
const EC_TABLE = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
  11: [30, 1, 50, 4, 51],
  12: [22, 6, 36, 2, 37],
  13: [22, 8, 37, 1, 38],
};

/* Row/column centres of the alignment patterns. */
const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62],
};

/* ------------------------------- GF(256) --------------------------------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // the QR primitive polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Generator polynomial for `degree` error-correction codewords. */
function generatorPoly(degree) {
  let poly = [1];
  for (let d = 0; d < degree; d++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i++) {
      next[i] ^= poly[i];
      next[i + 1] ^= mul(poly[i], EXP[d]);
    }
    poly = next;
  }
  return poly;
}

/** Reed-Solomon remainder: the error-correction codewords for one block. */
function ecCodewords(data, count) {
  const gen = generatorPoly(count);
  const rem = new Array(count).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < count; i++) rem[i] ^= mul(gen[i + 1], factor);
  }
  return rem;
}

/* ------------------------------- encoding -------------------------------- */

const dataCodewordCount = (version) => {
  const [, ba, da, bb, db] = EC_TABLE[version];
  return ba * da + bb * db;
};

/** Byte-mode capacity in characters. */
function capacity(version) {
  const headerBits = 4 + (version >= 10 ? 16 : 8);
  return Math.floor((dataCodewordCount(version) * 8 - headerBits) / 8);
}

function pickVersion(length) {
  for (let v = 1; v <= MAX_VERSION; v++) if (capacity(v) >= length) return v;
  return null;
}

/** Text to the final codeword stream: header, data, padding, interleaved EC. */
function encodeData(bytes, version) {
  const bits = [];
  const push = (value, width) => {
    for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(bytes.length, version >= 10 ? 16 : 8);
  for (const b of bytes) push(b, 8);

  const totalBits = dataCodewordCount(version) * 8;
  // Terminator, then align to a byte boundary.
  for (let i = 0; i < 4 && bits.length < totalBits; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  // Pad bytes alternate, as the spec requires.
  const pad = [0xec, 0x11];
  for (let i = 0; codewords.length < totalBits / 8; i++) codewords.push(pad[i % 2]);

  // Split into blocks, compute EC for each, then interleave both.
  const [ecPerBlock, blocksA, dataA, blocksB, dataB] = EC_TABLE[version];
  const blocks = [];
  let at = 0;
  for (let i = 0; i < blocksA + blocksB; i++) {
    const size = i < blocksA ? dataA : dataB;
    const data = codewords.slice(at, at + size);
    at += size;
    blocks.push({ data, ec: ecCodewords(data, ecPerBlock) });
  }

  const out = [];
  const maxData = Math.max(dataA, dataB);
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const b of blocks) out.push(b.ec[i]);
  }
  return out;
}

/* -------------------------------- matrix --------------------------------- */

function blankMatrix(size) {
  return {
    modules: Array.from({ length: size }, () => new Array(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array(size).fill(false)),
    size,
  };
}

function place(m, row, col, dark) {
  m.modules[row][col] = dark;
  m.reserved[row][col] = true;
}

function drawFunctionPatterns(m, version) {
  const { size } = m;

  // Three finder patterns, each with its separator.
  for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const inner = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        place(m, rr, cc, inner && (ring || core));
      }
    }
  }

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    place(m, 6, i, i % 2 === 0);
    place(m, i, 6, i % 2 === 0);
  }

  // Alignment patterns, skipping the three finder corners.
  const centres = ALIGN[version];
  for (const r of centres) {
    for (const c of centres) {
      const corner =
        (r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8);
      if (corner) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const edge = Math.abs(dr) === 2 || Math.abs(dc) === 2;
          place(m, r + dr, c + dc, edge || (dr === 0 && dc === 0));
        }
      }
    }
  }

  // The always-dark module, and the reserved format areas.
  place(m, size - 8, 8, true);
  for (let i = 0; i < 9; i++) {
    if (!m.reserved[8][i]) place(m, 8, i, false);
    if (!m.reserved[i][8]) place(m, i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!m.reserved[8][size - 1 - i]) place(m, 8, size - 1 - i, false);
    if (!m.reserved[size - 1 - i][8]) place(m, size - 1 - i, 8, false);
  }

  // Version information, for version 7 and above.
  if (version >= 7) {
    let bits = version << 12;
    for (let i = 0; i < 6; i++) {
      if (bits >> (17 - i) & 1) bits ^= 0x1f25 << (5 - i);
    }
    const value = (version << 12) | bits;
    for (let i = 0; i < 18; i++) {
      const bit = ((value >> i) & 1) === 1;
      const r = Math.floor(i / 3);
      const c = size - 11 + (i % 3);
      place(m, r, c, bit);
      place(m, c, r, bit);
    }
  }
}

function drawFormat(m, mask) {
  const { size } = m;
  const data = (0b00 << 3) | mask; // 00 = error correction level M
  let bits = data << 10;
  for (let i = 0; i < 5; i++) {
    if (bits >> (14 - i) & 1) bits ^= 0x537 << (4 - i);
  }
  const value = ((data << 10) | bits) ^ 0x5412;

  for (let i = 0; i < 15; i++) {
    const bit = ((value >> i) & 1) === 1;
    // Copy one: up the column beside the top-left finder, then left along the
    // row. Both copies index from the least significant bit; getting this one
    // backwards only corrupted the handful of bits that are not symmetric
    // under reversal, which is exactly the kind of bug that still scans on one
    // phone and fails on another.
    if (i < 6) m.modules[i][8] = bit;
    else if (i === 6) m.modules[7][8] = bit;
    else if (i === 7) m.modules[8][8] = bit;
    else if (i === 8) m.modules[8][7] = bit;
    else m.modules[8][14 - i] = bit;

    // Copy two: split between the other two finders.
    if (i < 8) m.modules[8][size - 1 - i] = bit;
    else m.modules[size - 15 + i][8] = bit;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** Zigzag the codeword bits up and down the columns, right to left. */
function placeData(m, codewords, mask) {
  const { size } = m;
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing column is skipped entirely
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (m.reserved[row][col]) continue;
        let dark = false;
        if (bitIndex < codewords.length * 8) {
          dark = ((codewords[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex++;
        }
        m.modules[row][col] = dark !== MASKS[mask](row, col);
      }
    }
    upward = !upward;
  }
}

/** The four penalty rules. Lower is better; the lowest-scoring mask wins. */
function penalty(m) {
  const { size, modules } = m;
  let score = 0;

  // Rule 1: runs of five or more of the same colour.
  for (let i = 0; i < size; i++) {
    for (const readRow of [true, false]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        const prev = readRow ? modules[i][j - 1] : modules[j - 1][i];
        const curr = readRow ? modules[i][j] : modules[j][i];
        if (curr === prev) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
        score += 3;
      }
    }
  }

  // Rule 3: the finder-like 1:1:3:1:1 sequence with four light modules beside it.
  const A = [true, false, true, true, true, false, true, false, false, false, false];
  const B = [false, false, false, false, true, false, true, true, true, false, true];
  const matches = (get, j) =>
    A.every((v, k) => get(j + k) === v) || B.every((v, k) => get(j + k) === v);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j + 11 <= size; j++) {
      if (matches((k) => modules[i][k], j)) score += 40;
      if (matches((k) => modules[k][i], j)) score += 40;
    }
  }

  // Rule 4: how far the dark/light balance strays from half.
  let dark = 0;
  for (const row of modules) for (const v of row) if (v) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/**
 * Encode text as a QR code.
 *
 * @param {string} text
 * @returns {{size: number, modules: boolean[][], version: number}}
 * @throws if the text is longer than version 13 at level M can hold
 */
export function encodeQR(text) {
  const bytes = [];
  for (const ch of new TextEncoder().encode(String(text))) bytes.push(ch);

  const version = pickVersion(bytes.length);
  if (!version) {
    throw new Error(`QR payload too long: ${bytes.length} bytes`);
  }

  const codewords = encodeData(bytes, version);
  const size = version * 4 + 17;

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = blankMatrix(size);
    drawFunctionPatterns(m, version);
    placeData(m, codewords, mask);
    drawFormat(m, mask);
    const score = penalty(m);
    if (!best || score < best.score) best = { score, m, mask };
  }

  return { size, modules: best.m.modules, version, mask: best.mask };
}

/**
 * The same code as an SVG path string, sized in modules.
 * The caller supplies the viewBox and colours.
 */
export function qrPath(modules) {
  let d = '';
  for (let r = 0; r < modules.length; r++) {
    for (let c = 0; c < modules.length; c++) {
      if (modules[r][c]) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  return d;
}
