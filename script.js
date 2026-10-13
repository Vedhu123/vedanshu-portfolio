const hero = document.querySelector("[data-hero]");
const stage = document.querySelector("[data-stage]");
const line = document.querySelector("[data-line]");

const lines = {
  idle: "Move the cursor to tell me.",
  left: "Anyone here on the left?",
  right: "Hello and welcome.",
  work: "Back to the work.",
};

let locked = false;
let timer = 0;

function setState(next) {
  hero.dataset.state = next;
  line.textContent = lines[next];
}

function react(side) {
  if (locked) return;
  locked = true;
  setState(side);
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    setState("work");
    timer = window.setTimeout(() => {
      setState("idle");
      locked = false;
    }, 1100);
  }, 2400);
}

hero.addEventListener("mousemove", (event) => {
  const bounds = hero.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width;
  const y = (event.clientY - bounds.top) / bounds.height;
  stage.style.setProperty("--px", ((x - 0.5) * 14).toFixed(2) + "px");
  stage.style.setProperty("--py", ((y - 0.5) * 8).toFixed(2) + "px");
  stage.style.setProperty("--ry", ((0.5 - x) * 7).toFixed(2) + "deg");

  if (window.matchMedia("(pointer: coarse)").matches) return;
  if (x < 0.33) react("left");
  else if (x > 0.67) react("right");
});

hero.addEventListener("mouseleave", () => {
  stage.style.setProperty("--px", "0px");
  stage.style.setProperty("--py", "0px");
  stage.style.setProperty("--ry", "0deg");
});

document.querySelectorAll("[data-react]").forEach((button) => {
  button.addEventListener("click", () => react(button.dataset.react));
});
