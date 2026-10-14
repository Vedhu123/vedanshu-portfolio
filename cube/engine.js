// Facelet model matching the C++ cube: faces U L F R B D, colors W G R B O Y.
// A move is a permutation of the 54 stickers, built from the same face cycles.

export const MOVE_NAMES = [
  "L", "L'", "L2",
  "R", "R'", "R2",
  "U", "U'", "U2",
  "D", "D'", "D2",
  "F", "F'", "F2",
  "B", "B'", "B2",
];

// Face index for each move: U L F R B D = 0..5
export const FACE_OF = [
  1, 1, 1,
  3, 3, 3,
  0, 0, 0,
  5, 5, 5,
  2, 2, 2,
  4, 4, 4,
];

export const INVERSE = [
  1, 0, 2,
  4, 3, 5,
  7, 6, 8,
  10, 9, 11,
  13, 12, 14,
  16, 15, 17,
];

const CORNERS = [
  [[0, 2, 2], [2, 0, 2], [3, 0, 0]],
  [[0, 2, 0], [1, 0, 2], [2, 0, 0]],
  [[0, 0, 0], [4, 0, 2], [1, 0, 0]],
  [[0, 0, 2], [3, 0, 2], [4, 0, 0]],
  [[5, 0, 2], [3, 2, 0], [2, 2, 2]],
  [[5, 0, 0], [2, 2, 0], [1, 2, 2]],
  [[5, 2, 2], [4, 2, 0], [3, 2, 2]],
  [[5, 2, 0], [1, 2, 0], [4, 2, 2]],
];

const tmp = new Uint8Array(54);
const NORMALS = [
  [0, 1, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [1, 0, 0],
  [0, 0, -1],
  [0, -1, 0],
];

export function createSolved() {
  const stickers = new Uint8Array(54);
  for (let i = 0; i < 54; i++) stickers[i] = (i / 9) | 0;
  return stickers;
}

export function isSolved(stickers) {
  for (let i = 0; i < 54; i++) {
    if (stickers[i] !== ((i / 9) | 0)) return false;
  }
  return true;
}

export function keyOf(stickers) {
  return String.fromCharCode.apply(null, stickers);
}

function stickerCoord(face, row, col) {
  if (face === 0) return [col - 1, 1, row - 1];
  if (face === 5) return [col - 1, -1, 1 - row];
  if (face === 2) return [col - 1, 1 - row, 1];
  if (face === 4) return [1 - col, 1 - row, -1];
  if (face === 3) return [1, 1 - row, 1 - col];
  return [-1, 1 - row, col - 1];
}

function clockwise(face, x, y, z) {
  if (face === 0) return [-z, y, x];
  if (face === 5) return [z, y, -x];
  if (face === 2) return [y, -x, z];
  if (face === 4) return [-y, x, z];
  if (face === 3) return [x, z, -y];
  return [x, -z, y];
}

export function isOnFace(face, x, y, z) {
  return onLayer(face, x, y, z);
}

function onLayer(face, x, y, z) {
  if (face === 0) return y === 1;
  if (face === 5) return y === -1;
  if (face === 2) return z === 1;
  if (face === 4) return z === -1;
  if (face === 3) return x === 1;
  return x === -1;
}

const slotKey = (x, y, z, nx, ny, nz) => `${x},${y},${z},${nx},${ny},${nz}`;
const slots = [];
const indexBySlot = new Map();
for (let face = 0; face < 6; face++) {
  const [nx, ny, nz] = NORMALS[face];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const [x, y, z] = stickerCoord(face, row, col);
      const index = face * 9 + row * 3 + col;
      indexBySlot.set(slotKey(x, y, z, nx, ny, nz), index);
      slots.push({ index, x, y, z, nx, ny, nz });
    }
  }
}

function facePerm(face) {
  const perm = new Uint8Array(54);
  for (const slot of slots) {
    let { x, y, z, nx, ny, nz } = slot;
    if (onLayer(face, x, y, z)) {
      [x, y, z] = clockwise(face, x, y, z);
      [nx, ny, nz] = clockwise(face, nx, ny, nz);
    }
    const dest = indexBySlot.get(slotKey(x, y, z, nx, ny, nz));
    perm[dest] = slot.index;
  }
  return perm;
}

function power(perm, times) {
  let current = Uint8Array.from({ length: 54 }, (_, index) => index);
  for (let turn = 0; turn < times; turn++) {
    const next = new Uint8Array(54);
    for (let index = 0; index < 54; index++) next[index] = perm[current[index]];
    current = next;
  }
  return current;
}

const PERMS = [1, 3, 0, 5, 2, 4].flatMap((face) => {
  const quarter = facePerm(face);
  return [power(quarter, 1), power(quarter, 3), power(quarter, 2)];
});

export function quarterTurn(face, x, y, z) {
  return clockwise(face, x, y, z);
}

export function applyMove(state, move) {
  const perm = PERMS[move];
  for (let i = 0; i < 54; i++) tmp[i] = state[perm[i]];
  state.set(tmp);
}

export function applyMoves(state, moves) {
  for (const move of moves) applyMove(state, move);
}

export function sticker(state, face, row, col) {
  return state[face * 9 + row * 3 + col];
}

function cornerColors(state, index) {
  return CORNERS[index].map(([face, row, col]) => sticker(state, face, row, col));
}

export function cornerPiece(state, index) {
  let id = 0;
  for (const color of cornerColors(state, index)) {
    if (color === 5) id |= 4;
    else if (color === 4) id |= 2;
    else if (color === 1) id |= 1;
  }
  return id;
}

export function cornerOrientation(state, index) {
  const colors = cornerColors(state, index);
  const wy = colors.find((color) => color === 0 || color === 5);
  if (colors[1] === wy) return 1;
  if (colors[2] === wy) return 2;
  return 0;
}

export function readCorners(state) {
  const perm = new Uint8Array(8);
  const ori = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    perm[i] = cornerPiece(state, i);
    ori[i] = cornerOrientation(state, i);
  }
  return { perm, ori };
}

export function scramble(state, depth, random = Math.random) {
  const moves = [];
  let lastFace = -1;
  while (moves.length < depth) {
    const move = (random() * 18) | 0;
    if (FACE_OF[move] === lastFace) continue;
    applyMove(state, move);
    moves.push(move);
    lastFace = FACE_OF[move];
  }
  return moves;
}

export function names(moves) {
  return moves.map((move) => MOVE_NAMES[move]).join(" ");
}
