import { solve } from "./solvers.js";

self.onmessage = (event) => {
  const { stickers, algorithm, limit } = event.data;
  const outcome = solve(new Uint8Array(stickers), algorithm, limit, (nodes) => {
    self.postMessage({ type: "progress", nodes });
  });
  self.postMessage({
    type: "done",
    moves: outcome.moves,
    nodes: outcome.nodes,
    solved: outcome.solved,
    capped: outcome.capped,
    ms: outcome.ms,
  });
};
