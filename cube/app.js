import {
  FACE_OF,
  INVERSE,
  MOVE_NAMES,
  applyMove,
  createSolved,
  isOnFace,
  isSolved,
  names,
  quarterTurn,
  scramble,
  sticker,
} from "./engine.js";

const HEX = ["#f4f0e6", "#1e8f4e", "#d6453d", "#3a68d8", "#ef8a2b", "#f0c43a"];
const STEP = 62;
const SPIN = {
  0: ["Y", -90],
  1: ["X", -90],
  2: ["Z", 90],
  3: ["X", 90],
  4: ["Z", -90],
  5: ["Y", 90],
};
const ABOUT = {
  bfs: "Breadth-first search walks out from the scramble and in from the solved cube. The first time the two searches meet, that path is a shortest solution.",
  dfs: "Depth-first search follows one line of turns down to the depth you set, then backtracks. It can finish quickly, and the line it finds may be longer than the shortest.",
  iddfs: "Iterative deepening repeats a depth-first search at 1 move, then 2, and so on. The first solution is a shortest one, and it does not have to store every cube it sees.",
  ida: "IDA* uses that same deepening, plus a corner heuristic in the spirit of Korf’s pattern database. A path is skipped when the corners already prove it cannot finish inside the current bound.",
};

const scene = document.querySelector("#scene");
const viewport = document.querySelector("#viewport");
const statusEl = document.querySelector("#status");
const movesEl = document.querySelector("#moves");
const aboutEl = document.querySelector("#about");
const depthInput = document.querySelector("#depth");
const depthValue = document.querySelector("#depth-value");
const depthNote = document.querySelector("#depth-note");
const netEl = document.querySelector("#net");
const buttons = {
  scramble: document.querySelector("#scramble"),
  solve: document.querySelector("#solve"),
  stop: document.querySelector("#stop"),
  reset: document.querySelector("#reset"),
};

const state = createSolved();
const pieces = [];
let algorithm = "bfs";
let busy = false;
let token = 0;
let worker = null;
let orbitX = -28;
let orbitY = 36;

const SIDES = [
  ["u", "U"],
  ["d", "D"],
  ["f", "F"],
  ["b", "B"],
  ["r", "R"],
  ["l", "L"],
];

function colorAt(x, y, z, side) {
  if (side === "u" && y === 1) return sticker(state, 0, z + 1, x + 1);
  if (side === "d" && y === -1) return sticker(state, 5, 1 - z, x + 1);
  if (side === "f" && z === 1) return sticker(state, 2, 1 - y, x + 1);
  if (side === "b" && z === -1) return sticker(state, 4, 1 - y, 1 - x);
  if (side === "r" && x === 1) return sticker(state, 3, 1 - y, 1 - z);
  if (side === "l" && x === -1) return sticker(state, 1, 1 - y, z + 1);
  return null;
}

function place(piece, animate) {
  piece.el.style.transition = animate ? "transform 260ms cubic-bezier(.2,.7,.2,1)" : "none";
  piece.el.style.transform = `translate3d(${piece.x * STEP}px, ${-piece.y * STEP}px, ${piece.z * STEP}px)`;
}

function paint(piece) {
  for (const [side] of SIDES) {
    const color = colorAt(piece.x, piece.y, piece.z, side);
    const face = piece.faces[side];
    face.hidden = color == null;
    if (color != null) face.querySelector("span").style.background = HEX[color];
  }
}

function paintAll(animate) {
  for (const piece of pieces) {
    place(piece, animate);
    paint(piece);
  }
  drawNet();
}

function buildCube() {
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        const el = document.createElement("div");
        el.className = "piece";
        const faces = {};
        for (const [side] of SIDES) {
          const face = document.createElement("div");
          face.className = `sticker ${side}`;
          face.append(document.createElement("span"));
          el.append(face);
          faces[side] = face;
        }
        const piece = { x, y, z, homeX: x, homeY: y, homeZ: z, el, faces };
        pieces.push(piece);
        scene.append(el);
        place(piece, false);
        paint(piece);
      }
    }
  }
  applyOrbit();
  drawNet();
}

function drawNet() {
  netEl.replaceChildren();
  const face = (index) => {
    const cell = document.createElement("div");
    cell.className = "face";
    for (let i = 0; i < 9; i++) {
      const pip = document.createElement("i");
      pip.className = "facelet";
      pip.style.background = HEX[state[index * 9 + i]];
      cell.append(pip);
    }
    return cell;
  };
  const up = document.createElement("div");
  up.className = "row";
  up.append(blank(), face(0), blank(), blank());
  const middle = document.createElement("div");
  middle.className = "row";
  middle.append(face(1), face(2), face(3), face(4));
  const down = document.createElement("div");
  down.className = "row";
  down.append(blank(), face(5), blank(), blank());
  netEl.append(up, middle, down);
}

function blank() {
  const gap = document.createElement("div");
  gap.className = "face";
  gap.style.visibility = "hidden";
  return gap;
}

function applyOrbit() {
  scene.style.transform = `rotateX(${orbitX}deg) rotateY(${orbitY}deg)`;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setMoves(list, active = -1) {
  movesEl.replaceChildren();
  if (!list.length) {
    const empty = document.createElement("span");
    empty.className = "empty";
    empty.textContent = "No solution yet.";
    movesEl.append(empty);
    return;
  }
  list.forEach((name, index) => {
    const chip = document.createElement("span");
    chip.textContent = name;
    if (index === active) chip.className = "current";
    movesEl.append(chip);
  });
}

function setBusy(value, searching) {
  busy = value;
  buttons.scramble.disabled = value;
  buttons.solve.disabled = value;
  buttons.reset.disabled = value && searching;
  buttons.stop.hidden = !searching;
  depthInput.disabled = value;
  document.querySelectorAll("#algorithms button, #pad button").forEach((button) => {
    button.disabled = value;
  });
}

function depthCopy() {
  const depth = Number(depthInput.value);
  depthValue.textContent = String(depth);
  depthNote.textContent = depth <= 6
    ? "All four searches are comfortable here."
    : "BFS and IDA* stay quick at this depth. DFS and IDDFS may need the Stop button.";
}

function selectAlgorithm(next) {
  algorithm = next;
  document.querySelectorAll("#algorithms button").forEach((button) => {
    button.setAttribute("aria-checked", String(button.dataset.algorithm === next));
  });
  aboutEl.textContent = ABOUT[next];
}

function buildControls() {
  const algorithms = document.querySelector("#algorithms");
  for (const [id, label] of [["bfs", "BFS"], ["dfs", "DFS"], ["iddfs", "IDDFS"], ["ida", "IDA*"]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.algorithm = id;
    button.setAttribute("role", "radio");
    button.textContent = label;
    button.addEventListener("click", () => selectAlgorithm(id));
    algorithms.append(button);
  }
  selectAlgorithm("bfs");

  const pad = document.querySelector("#pad");
  MOVE_NAMES.forEach((name, move) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.addEventListener("click", () => turn(move));
    pad.append(button);
  });

  depthInput.addEventListener("input", depthCopy);
  depthCopy();
  buttons.scramble.addEventListener("click", onScramble);
  buttons.solve.addEventListener("click", onSolve);
  buttons.reset.addEventListener("click", onReset);
  buttons.stop.addEventListener("click", onStop);
}

async function turn(move) {
  if (busy) return;
  const mine = ++token;
  setBusy(true, false);
  await animateMove(move, mine);
  setBusy(false, false);
  setStatus(isSolved(state) ? "Solved." : "Turn applied.");
  setMoves([]);
}

async function animateMove(move, mine) {
  const face = FACE_OF[move];
  const [axis, quarter] = SPIN[face];
  const sign = move % 3 === 1 ? -1 : move % 3 === 2 ? 2 : 1;
  const angle = quarter * sign;
  const moving = pieces.filter((piece) => isOnFace(face, piece.x, piece.y, piece.z));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduce) {
    await new Promise((resolve) => {
      let left = moving.length;
      const finish = () => {
        left -= 1;
        if (left <= 0) resolve();
      };
      for (const piece of moving) {
        piece.el.style.transition = "transform 260ms cubic-bezier(.2,.7,.2,1)";
        piece.el.style.transform = `rotate${axis}(${angle}deg) translate3d(${piece.x * STEP}px, ${-piece.y * STEP}px, ${piece.z * STEP}px)`;
        piece.el.addEventListener("transitionend", function done(event) {
          if (event.propertyName !== "transform") return;
          piece.el.removeEventListener("transitionend", done);
          finish();
        });
      }
      window.setTimeout(resolve, 420);
    });
  }

  if (mine !== token) return false;
  applyMove(state, move);
  const turns = move % 3 === 0 ? 1 : move % 3 === 1 ? 3 : 2;
  for (const piece of moving) {
    let x = piece.x;
    let y = piece.y;
    let z = piece.z;
    for (let i = 0; i < turns; i++) [x, y, z] = quarterTurn(face, x, y, z);
    piece.x = x;
    piece.y = y;
    piece.z = z;
  }
  paintAll(false);
  return true;
}

async function play(moves) {
  const mine = token;
  const labels = moves.map((move) => MOVE_NAMES[move]);
  setMoves(labels, 0);
  for (let index = 0; index < moves.length; index++) {
    if (mine !== token) return false;
    setMoves(labels, index);
    const ok = await animateMove(moves[index], mine);
    if (!ok) return false;
  }
  setMoves(labels);
  return true;
}

function resetPieces() {
  state.set(createSolved());
  for (const piece of pieces) {
    piece.x = piece.homeX;
    piece.y = piece.homeY;
    piece.z = piece.homeZ;
  }
  paintAll(false);
}

function onReset() {
  token += 1;
  onStop();
  resetPieces();
  setMoves([]);
  setStatus("Solved. Scramble it, then pick a search.");
  setBusy(false, false);
}

async function onScramble() {
  if (busy) return;
  token += 1;
  const mine = token;
  setBusy(true, false);
  resetPieces();
  const depth = Number(depthInput.value);
  const preview = createSolved();
  const moves = scramble(preview, depth);
  setStatus(`Scrambling ${depth} ${depth === 1 ? "move" : "moves"}.`);
  setMoves(moves.map((move) => MOVE_NAMES[move]), 0);
  const finished = await play(moves);
  if (mine !== token) return;
  setBusy(false, false);
  if (finished) setStatus(`Scrambled in ${depth} ${depth === 1 ? "move" : "moves"}: ${names(moves)}.`);
}

let settleSearch = null;

function runSearch(stickers, limit) {
  return new Promise((resolve, reject) => {
    const current = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    worker = current;
    settleSearch = { resolve, reject, worker: current };
    current.onmessage = (event) => {
      if (event.data.type === "progress") {
        setStatus(`Searching · ${event.data.nodes.toLocaleString()} positions`);
        return;
      }
      current.terminate();
      if (worker === current) worker = null;
      settleSearch = null;
      resolve(event.data);
    };
    current.onerror = () => {
      current.terminate();
      if (worker === current) worker = null;
      settleSearch = null;
      reject(new Error("The search stopped unexpectedly."));
    };
    current.postMessage({ stickers, algorithm, limit });
  });
}

function onStop() {
  const pending = settleSearch;
  worker?.terminate();
  worker = null;
  settleSearch = null;
  pending?.reject(new Error("Stopped."));
}

async function onSolve() {
  if (busy) return;
  if (isSolved(state)) {
    setStatus("The cube is already solved.");
    return;
  }
  token += 1;
  const mine = token;
  setBusy(true, true);
  setMoves([]);
  setStatus(`Running ${algorithm.toUpperCase()}…`);
  const started = performance.now();
  let outcome;
  try {
    outcome = await runSearch(Array.from(state), Number(depthInput.value));
  } catch (error) {
    if (mine !== token) return;
    setBusy(false, false);
    setStatus(error.message);
    return;
  }
  if (mine !== token) return;
  if (!outcome.solved) {
    setBusy(false, false);
    setStatus(outcome.capped
      ? "That search got too large before it finished. Try BFS or IDA*, or a shorter scramble."
      : "No solution inside that depth. Raise the slider, or use BFS.");
    return;
  }
  const labels = outcome.moves.map((move) => MOVE_NAMES[move]);
  setStatus(`${algorithm.toUpperCase()} found ${labels.length} ${labels.length === 1 ? "move" : "moves"} in ${outcome.ms} ms. Playing them now.`);
  setBusy(true, false);
  const finished = await play(outcome.moves);
  if (mine !== token) return;
  setBusy(false, false);
  if (finished) {
    const elapsed = Math.round(performance.now() - started);
    setStatus(isSolved(state)
      ? `Solved in ${labels.length} ${labels.length === 1 ? "move" : "moves"}: ${labels.join(" ")}. Search took ${outcome.ms} ms.`
      : `Playback finished in ${elapsed} ms.`);
  }
}

viewport.addEventListener("pointerdown", (event) => {
  viewport.setPointerCapture(event.pointerId);
  const startX = event.clientX;
  const startY = event.clientY;
  const baseX = orbitX;
  const baseY = orbitY;
  const move = (next) => {
    orbitY = baseY + (next.clientX - startX) * 0.4;
    orbitX = Math.max(-70, Math.min(70, baseX + (next.clientY - startY) * 0.4));
    applyOrbit();
  };
  const up = () => {
    viewport.removeEventListener("pointermove", move);
    viewport.removeEventListener("pointerup", up);
  };
  viewport.addEventListener("pointermove", move);
  viewport.addEventListener("pointerup", up);
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const face = { u: 6, d: 9, l: 0, r: 3, f: 12, b: 15 }[key];
  if (face == null || event.metaKey || event.ctrlKey || event.altKey) return;
  event.preventDefault();
  const move = event.shiftKey ? INVERSE[face] : face;
  turn(move);
});

buildCube();
buildControls();
