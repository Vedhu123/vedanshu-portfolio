import {
  INVERSE,
  MOVE_NAMES,
  applyMove,
  applyMoves,
  cornerOrientation,
  cornerPiece,
  createSolved,
  isSolved,
  scramble,
} from "./engine.js";
import { cornerHeuristic, solveBfs, solveDfs, solveIda, solveIddfs } from "./solvers.js";

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exit(1);
  }
}

function clone(state) {
  return state.slice();
}

function counts(state) {
  const tally = [0, 0, 0, 0, 0, 0];
  for (const color of state) tally[color]++;
  return tally;
}

function random(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const solved = createSolved();
assert(isSolved(solved), "fresh cube is solved");
assert(cornerHeuristic(solved) === 0, "solved heuristic is 0");

for (let move = 0; move < 18; move++) {
  const state = clone(solved);
  applyMove(state, move);
  applyMove(state, move);
  applyMove(state, move);
  applyMove(state, move);
  assert(isSolved(state), `${MOVE_NAMES[move]} four times returns home`);

  const undone = clone(solved);
  applyMove(undone, move);
  applyMove(undone, INVERSE[move]);
  assert(isSolved(undone), `${MOVE_NAMES[move]} inverse returns home`);

  const turned = clone(solved);
  applyMove(turned, move);
  assert(counts(turned).every((count) => count === 9), `${MOVE_NAMES[move]} keeps 9 of each color`);
  const pieces = new Set();
  for (let corner = 0; corner < 8; corner++) pieces.add(cornerPiece(turned, corner));
  assert(pieces.size === 8, `${MOVE_NAMES[move]} splits a corner cubie`);
  let orientation = 0;
  for (let corner = 0; corner < 8; corner++) orientation += cornerOrientation(turned, corner);
  assert(orientation % 3 === 0, `${MOVE_NAMES[move]} breaks corner orientation`);
  if (move === 6 || move === 9) {
    assert(orientation === 0, `${MOVE_NAMES[move]} twists a corner`);
  }
}

const up = clone(solved);
applyMove(up, 6);
assert(up[18] === 3 && up[19] === 3 && up[20] === 3, "U brings the right face onto the front");

const sexy = clone(solved);
for (let i = 0; i < 6; i++) applyMoves(sexy, [3, 6, 4, 7]);
assert(isSolved(sexy), "R U R' U' six times returns home");

const slots = [
  [1, 1, 1],
  [-1, 1, 1],
  [-1, 1, -1],
  [1, 1, -1],
  [1, -1, 1],
  [-1, -1, 1],
  [1, -1, -1],
  [-1, -1, -1],
];

for (const move of [0, 3, 6, 9, 12, 15]) {
  const state = clone(solved);
  applyMove(state, move);
  const home = [];
  for (let slot = 0; slot < 8; slot++) home[cornerPiece(solved, slot)] = slot;
  const landed = slots.map((_, slot) => home[cornerPiece(state, slot)]);
  console.log(MOVE_NAMES[move], "corner slots", landed.join(""));
}

function checkSolver(name, solve, depth, seeds) {
  for (const seed of seeds) {
    const state = clone(solved);
    const moves = scramble(state, depth, random(seed));
    const started = performance.now();
    const outcome = solve(state, depth);
    const ms = Math.round(performance.now() - started);
    const replay = state.slice();
    applyMoves(replay, outcome.moves);
    assert(outcome.solved && isSolved(replay), `${name} seed ${seed} depth ${depth} did not solve`);
    console.log(
      `${name} depth ${depth} seed ${seed}: ${outcome.moves.length} moves, ${outcome.nodes} nodes, ${ms} ms`
    );
    return outcome;
  }
}

for (const depth of [1, 3, 5, 8]) {
  const state = clone(solved);
  scramble(state, depth, random(11 + depth));
  const bfs = solveBfs(state);
  const replay = state.slice();
  applyMoves(replay, bfs.moves);
  assert(bfs.solved && isSolved(replay), `BFS depth ${depth} failed`);
  assert(bfs.moves.length <= depth, `BFS depth ${depth} longer than scramble`);
  console.log(`BFS depth ${depth}: ${bfs.moves.length} moves, ${bfs.nodes} nodes, ${bfs.ms} ms`);
}

const sample = clone(solved);
scramble(sample, 4, random(4));
const bfs = solveBfs(sample);
const iddfs = solveIddfs(sample, 4);
const dfs = solveDfs(sample, 4);
const ida = solveIda(sample, 8);
assert(iddfs.moves.length === bfs.moves.length, "IDDFS is not as short as BFS");
assert(ida.solved && ida.moves.length === bfs.moves.length, "IDA* is not as short as BFS");
assert(dfs.solved, "DFS missed a depth-4 scramble");
console.log(`match BFS ${bfs.moves.length}, IDDFS ${iddfs.moves.length}, IDA ${ida.moves.length} (${ida.ms} ms), DFS ${dfs.moves.length}`);

const deeper = clone(solved);
scramble(deeper, 7, random(70));
const ida7 = solveIda(deeper, 10);
const bfs7 = solveBfs(deeper);
assert(ida7.solved && ida7.moves.length === bfs7.moves.length, "IDA* depth 7 mismatch");
console.log(`IDA* depth 7: ${ida7.moves.length} moves, ${ida7.nodes} nodes, ${ida7.ms} ms`);

console.log("all checks passed");
