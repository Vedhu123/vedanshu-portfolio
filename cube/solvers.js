import {
  FACE_OF,
  INVERSE,
  applyMove,
  createSolved,
  isSolved,
  keyOf,
  readCorners,
} from "./engine.js";

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040];

function rankPerm(perm) {
  let rank = 0;
  let used = 0;
  for (let i = 0; i < 7; i++) {
    const value = perm[i];
    let smaller = value;
    let mask = used & ((1 << value) - 1);
    while (mask) {
      smaller--;
      mask &= mask - 1;
    }
    rank += smaller * FACT[7 - i];
    used |= 1 << value;
  }
  return rank;
}

function rankOri(ori) {
  let rank = 0;
  for (let i = 0; i < 8; i++) rank = rank * 3 + ori[i];
  return rank;
}

function buildCornerTables() {
  const solved = readCorners(createSolved());
  const slotOf = new Uint8Array(8);
  for (let slot = 0; slot < 8; slot++) slotOf[solved.perm[slot]] = slot;
  const goes = Array.from({ length: 18 }, () => new Uint8Array(8));
  const twist = Array.from({ length: 18 }, () => new Uint8Array(8));
  for (let move = 0; move < 18; move++) {
    const state = createSolved();
    applyMove(state, move);
    const now = readCorners(state);
    for (let slot = 0; slot < 8; slot++) {
      const src = slotOf[now.perm[slot]];
      goes[move][src] = slot;
      twist[move][src] = now.ori[slot];
    }
  }
  return { goes, twist, solved };
}

const { goes, twist, solved: solvedCorners } = buildCornerTables();
const solvedPermRank = rankPerm(solvedCorners.perm);
const solvedOriRank = rankOri(solvedCorners.ori);

function movePerm(perm, move, out) {
  for (let src = 0; src < 8; src++) out[goes[move][src]] = perm[src];
}

function moveOri(ori, move, out) {
  for (let src = 0; src < 8; src++) out[goes[move][src]] = (ori[src] + twist[move][src]) % 3;
}

function breadth(startRank, count, applyRank) {
  const dist = new Uint8Array(count);
  dist.fill(255);
  dist[startRank] = 0;
  let frontier = [startRank];
  let depth = 0;
  while (frontier.length) {
    const next = [];
    depth++;
    for (const rank of frontier) {
      for (let move = 0; move < 18; move++) {
        const child = applyRank(rank, move);
        if (dist[child] === 255) {
          dist[child] = depth;
          next.push(child);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

const permState = new Uint8Array(8);
const permOut = new Uint8Array(8);
const oriState = new Uint8Array(8);
const oriOut = new Uint8Array(8);

function unrankPerm(rank, out) {
  const used = new Uint8Array(8);
  let left = rank;
  for (let i = 0; i < 8; i++) {
    const fact = FACT[7 - i];
    let lehmer = (left / fact) | 0;
    left %= fact;
    let value = 0;
    for (; value < 8; value++) {
      if (used[value]) continue;
      if (lehmer === 0) break;
      lehmer--;
    }
    used[value] = 1;
    out[i] = value;
  }
}

function unrankOri(rank, out) {
  let left = rank;
  for (let i = 7; i >= 0; i--) {
    out[i] = left % 3;
    left = (left / 3) | 0;
  }
}

const permDist = breadth(solvedPermRank, 40320, (rank, move) => {
  unrankPerm(rank, permState);
  movePerm(permState, move, permOut);
  return rankPerm(permOut);
});

const oriDist = breadth(solvedOriRank, 6561, (rank, move) => {
  unrankOri(rank, oriState);
  moveOri(oriState, move, oriOut);
  return rankOri(oriOut);
});

export function cornerHeuristic(state) {
  const corners = readCorners(state);
  const perm = permDist[rankPerm(corners.perm)];
  const ori = oriDist[rankOri(corners.ori)];
  return Math.max(perm === 255 ? 0 : perm, ori === 255 ? 0 : ori);
}

function walk(map, key, stop) {
  const moves = [];
  while (key !== stop) {
    const info = map.get(key);
    moves.push(info.move);
    key = info.prev;
  }
  moves.reverse();
  return moves;
}

function towardGoal(map, key, goalKey) {
  const moves = [];
  while (key !== goalKey) {
    const info = map.get(key);
    moves.push(INVERSE[info.move]);
    key = info.prev;
  }
  return moves;
}

export function solveBfs(start, onProgress) {
  const started = now();
  const goal = createSolved();
  const startKey = keyOf(start);
  const goalKey = keyOf(goal);
  if (startKey === goalKey) return result([], 0, started, true);

  const forward = new Map([[startKey, null]]);
  const backward = new Map([[goalKey, null]]);
  let frontA = [start.slice()];
  let frontB = [goal];
  let nodes = 1;

  while (frontA.length && frontB.length) {
    const expandForward = frontA.length <= frontB.length;
    const mine = expandForward ? forward : backward;
    const other = expandForward ? backward : forward;
    const front = expandForward ? frontA : frontB;
    const next = [];

    for (const state of front) {
      const parentKey = keyOf(state);
      for (let move = 0; move < 18; move++) {
        applyMove(state, move);
        const key = keyOf(state);
        nodes++;
        if (other.has(key)) {
          const hit = state.slice();
          applyMove(state, INVERSE[move]);
          const forwardMoves = expandForward
            ? walk(forward, parentKey, startKey).concat(move)
            : walk(forward, key, startKey);
          const backMoves = expandForward
            ? towardGoal(backward, key, goalKey)
            : [INVERSE[move]].concat(towardGoal(backward, parentKey, goalKey));
          const moves = forwardMoves.concat(backMoves);
          const check = start.slice();
          for (const step of moves) applyMove(check, step);
          return result(moves, nodes, started, isSolved(check) && keyOf(hit));
        }
        if (!mine.has(key)) {
          mine.set(key, { prev: parentKey, move });
          next.push(state.slice());
        }
        applyMove(state, INVERSE[move]);
        if (nodes > 2500000) {
          return result([], nodes, started, false, true);
        }
      }
      if (onProgress && nodes % 20000 === 0) onProgress(nodes);
    }

    if (expandForward) frontA = next;
    else frontB = next;
  }

  return result([], nodes, started, false);
}

function depthSearch(start, limit, iterative, onProgress) {
  const started = now();
  const state = start.slice();
  const path = [];
  let nodes = 0;
  let solved = false;
  let capped = false;
  const maxNodes = 6000000;

  const dfs = (depth, lastFace) => {
    if (capped) return false;
    if (isSolved(state)) {
      solved = true;
      return true;
    }
    if (depth === limit) return false;
    for (let move = 0; move < 18; move++) {
      if (FACE_OF[move] === lastFace) continue;
      applyMove(state, move);
      path.push(move);
      nodes++;
      if (nodes > maxNodes) {
        capped = true;
        path.pop();
        applyMove(state, INVERSE[move]);
        return false;
      }
      if (onProgress && nodes % 200000 === 0) onProgress(nodes);
      if (dfs(depth + 1, FACE_OF[move])) return true;
      path.pop();
      applyMove(state, INVERSE[move]);
      if (capped) return false;
    }
    return false;
  };

  if (iterative) {
    for (let depth = 1; depth <= limit && !capped; depth++) {
      path.length = 0;
      state.set(start);
      if (dfs(0, -1)) break;
    }
  } else {
    dfs(0, -1);
  }

  return result(solved ? path.slice() : [], nodes, started, solved, capped);
}

export function solveDfs(start, limit, onProgress) {
  return depthSearch(start, limit, false, onProgress);
}

export function solveIddfs(start, limit, onProgress) {
  return depthSearch(start, limit, true, onProgress);
}

export function solveIda(start, limit, onProgress) {
  const started = now();
  const state = start.slice();
  const path = [];
  let nodes = 0;
  let bound = cornerHeuristic(state);

  const search = (depth, lastFace) => {
    const estimate = cornerHeuristic(state);
    const cost = depth + estimate;
    if (cost > bound) return cost;
    if (isSolved(state)) return 0;
    if (depth === limit) return Infinity;
    let nextBound = Infinity;
    for (let move = 0; move < 18; move++) {
      if (FACE_OF[move] === lastFace) continue;
      applyMove(state, move);
      path.push(move);
      nodes++;
      if (onProgress && nodes % 100000 === 0) onProgress(nodes);
      const child = search(depth + 1, FACE_OF[move]);
      if (child === 0) return 0;
      if (child < nextBound) nextBound = child;
      path.pop();
      applyMove(state, INVERSE[move]);
    }
    return nextBound;
  };

  while (bound <= limit) {
    path.length = 0;
    state.set(start);
    const next = search(0, -1);
    if (next === 0) return result(path.slice(), nodes, started, true);
    if (next === Infinity) break;
    bound = next;
  }

  return result([], nodes, started, false);
}

export function solve(start, algorithm, limit, onProgress) {
  if (algorithm === "bfs") return solveBfs(start, onProgress);
  if (algorithm === "dfs") return solveDfs(start, limit, onProgress);
  if (algorithm === "iddfs") return solveIddfs(start, limit, onProgress);
  return solveIda(start, limit, onProgress);
}

function now() {
  return globalThis.performance ? performance.now() : Date.now();
}

function result(moves, nodes, started, solved, capped = false) {
  return {
    moves,
    nodes,
    solved: Boolean(solved),
    capped,
    ms: Math.round(now() - started),
  };
}
