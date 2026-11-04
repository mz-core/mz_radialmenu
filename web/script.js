"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const CX = 200;
const CY = 200;
const OUTER = 192;
const INNER = 86;
const LABEL_RADIUS = 139;
const GAP = 2.4;

const KIND_ICONS = {
  drop: "package-open",
  trunk: "package-open",
  glovebox: "lock-keyhole",
  vehicle: "car-front",
  player: "user-round",
  ped: "user-round",
  object: "box",
};

const radial = document.getElementById("radial");
const sectorsRoot = document.getElementById("sectors");
const center = document.getElementById("center");
const centerIcon = document.getElementById("center-icon");
const title = document.getElementById("title");
const hint = document.getElementById("hint");
const caption = document.getElementById("caption");

const state = {
  open: false,
  locked: false,
  current: null,
  stack: [],
  labels: {},
  index: -1,
  options: [],
  sectors: [],
  unlockTimer: 0,
};

function svgEl(tag) {
  return document.createElementNS(SVG_NS, tag);
}

function iconName(value) {
  return String(value || "")
    .trim()
    .replace(/_/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

function iconKey(value) {
  const normalized = iconName(value);
  if (!normalized) return "";
  return normalized
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function buildIcon(value) {
  const key = iconKey(value);
  const nodes = key ? window.lucide?.icons?.[key] : null;
  if (!Array.isArray(nodes) || nodes.length === 0) return null;

  const group = svgEl("g");
  group.setAttribute("fill", "none");
  group.setAttribute("stroke", "currentColor");
  group.setAttribute("stroke-width", "2");
  group.setAttribute("stroke-linecap", "round");
  group.setAttribute("stroke-linejoin", "round");

  for (const node of nodes) {
    if (!Array.isArray(node) || node.length < 2 || typeof node[0] !== "string") continue;
    const element = svgEl(node[0]);
    const attrs = node[1] || {};
    for (const [keyName, value] of Object.entries(attrs)) {
      element.setAttribute(keyName, String(value));
    }
    group.appendChild(element);
  }

  return group;
}

function setCenterIcon(value) {
  centerIcon.replaceChildren();
  const icon = buildIcon(value);
  if (!icon) return;

  const svg = svgEl("svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.appendChild(icon);
  centerIcon.appendChild(svg);
}

function polar(radius, degrees) {
  const angle = (degrees * Math.PI) / 180;
  return [CX + Math.cos(angle) * radius, CY + Math.sin(angle) * radius];
}

function sectorPath(start, end) {
  const largeArc = end - start - GAP > 180 ? 1 : 0;
  const [outerStartX, outerStartY] = polar(OUTER, start + GAP / 2);
  const [outerEndX, outerEndY] = polar(OUTER, end - GAP / 2);
  const [innerEndX, innerEndY] = polar(INNER, end - GAP / 2);
  const [innerStartX, innerStartY] = polar(INNER, start + GAP / 2);

  return [
    `M ${outerStartX.toFixed(2)} ${outerStartY.toFixed(2)}`,
    `A ${OUTER} ${OUTER} 0 ${largeArc} 1 ${outerEndX.toFixed(2)} ${outerEndY.toFixed(2)}`,
    `L ${innerEndX.toFixed(2)} ${innerEndY.toFixed(2)}`,
    `A ${INNER} ${INNER} 0 ${largeArc} 0 ${innerStartX.toFixed(2)} ${innerStartY.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function truncate(value, maximum) {
  const text = String(value || "");
  if (text.length <= maximum) return text;
  return `${text.slice(0, Math.max(1, maximum - 1)).trimEnd()}\u2026`;
}

function wrapLabel(value, maximum) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return [""];
  if (text.length <= maximum) return [text];

  const words = text.split(" ");
  let first = "";
  let index = 0;

  while (index < words.length) {
    const candidate = first ? `${first} ${words[index]}` : words[index];
    if (candidate.length > maximum) break;
    first = candidate;
    index += 1;
  }

  if (!first) return [truncate(text, maximum)];

  const rest = words.slice(index).join(" ");
  return rest ? [first, truncate(rest, maximum)] : [first];
}

function maxCharsFor(count) {
  const step = 360 / count;
  const arc = (2 * Math.PI * LABEL_RADIUS * Math.max(step - GAP, 8)) / 360;
  const divisor = count >= 9 ? 7.7 : 7.6;
  return Math.max(6, Math.min(22, Math.floor(arc / divisor)));
}

function placeIcon(group, option, x, y, size) {
  const icon = buildIcon(option.icon || KIND_ICONS[option.kind] || "");
  if (!icon) return false;

  const wrapper = svgEl("g");
  wrapper.setAttribute("class", "radial-icon");
  wrapper.setAttribute(
    "transform",
    `translate(${(x - size / 2).toFixed(2)} ${(y - size / 2).toFixed(2)}) scale(${(size / 24).toFixed(3)})`,
  );
  wrapper.appendChild(icon);
  group.appendChild(wrapper);
  return true;
}

function addLabel(group, lines, x, y) {
  const text = svgEl("text");
  text.setAttribute("class", "radial-label");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("text-anchor", "middle");

  lines.forEach((line, index) => {
    const span = svgEl("tspan");
    span.setAttribute("x", String(x));
    span.setAttribute("dy", index === 0 ? "0" : "1.12em");
    span.textContent = line;
    text.appendChild(span);
  });

  group.appendChild(text);
}

function firstEnabled(options) {
  for (let index = 0; index < options.length; index += 1) {
    if (options[index]?.disabled !== true) return index;
  }
  return -1;
}

function setActive(index) {
  if (!state.open || index < 0 || index >= state.options.length) return;
  state.index = index;

  state.sectors.forEach((entry, sectorIndex) => {
    entry.group.classList.toggle("is-active", sectorIndex === index);
  });

  const option = state.options[index];
  const description = option && !option.disabled ? String(option.description || "") : "";
  caption.textContent = description;
  caption.classList.toggle("is-hidden", description === "");
}

function move(delta) {
  const count = state.options.length;
  if (count === 0) return;

  let next = state.index < 0 ? -1 : state.index;
  for (let attempts = 0; attempts < count; attempts += 1) {
    next = (next + delta + count) % count;
    if (state.options[next]?.disabled !== true) {
      setActive(next);
      return;
    }
  }
}

function createSector(option, index, count) {
  const step = 360 / count;
  const start = -90 - step / 2 + step * index;
  const end = start + step;
  const middle = start + step / 2;
  const maximum = maxCharsFor(count);
  const lines = wrapLabel(option.label || "", maximum);

  const group = svgEl("g");
  group.setAttribute("class", "radial-sector");
  group.setAttribute("role", "button");
  group.setAttribute("aria-label", String(option.label || ""));
  if (option.disabled === true) {
    group.setAttribute("aria-disabled", "true");
    group.classList.add("is-disabled");
  }

  const path = svgEl("path");
  path.setAttribute("class", "sector-shape");
  path.setAttribute("d", sectorPath(start, end));
  group.appendChild(path);

  const [labelX, labelY] = polar(LABEL_RADIUS, middle);
  const iconSize = count >= 9 ? 18 : 22;
  const hasIcon = placeIcon(group, option, labelX, labelY - (lines.length > 1 ? 22 : 15), iconSize);
  const labelYStart = labelY + (hasIcon ? (lines.length > 1 ? -1 : 12) : lines.length > 1 ? -6 : 4);
  addLabel(group, lines, labelX, labelYStart);

  group.addEventListener("mouseenter", () => {
    if (state.open && !state.locked && option.disabled !== true) setActive(index);
  });
  group.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    choose(option, index);
  });

  return { group, option };
}

function render() {
  const options = Array.isArray(state.current?.options) ? state.current.options : [];
  state.options = options;
  state.sectors = [];
  sectorsRoot.replaceChildren();
  caption.textContent = "";
  caption.classList.add("is-hidden");
  radial.classList.toggle("is-dense", options.length >= 9);

  const isSubmenu = state.stack.length > 0;
  title.textContent = String(state.current?.title || "");
  hint.textContent = String(isSubmenu ? state.labels.back || "Voltar" : state.labels.hint || "Selecione");
  center.setAttribute(
    "aria-label",
    String(isSubmenu ? state.labels.back || "Voltar" : state.labels.close || "Fechar"),
  );
  setCenterIcon(isSubmenu ? "arrow-left" : "x");

  if (options.length === 0) {
    close(true);
    return;
  }

  const count = options.length;
  options.forEach((option, index) => {
    const sector = createSector(option, index, count);
    state.sectors.push(sector);
    sectorsRoot.appendChild(sector.group);
  });

  const active = firstEnabled(options);
  state.index = active;
  if (active >= 0) setActive(active);
}

function enter(option) {
  state.stack.push({ current: state.current, index: state.index });
  state.current = {
    title: option.label,
    options: Array.isArray(option.children) ? option.children : [],
  };
  state.index = 0;
  render();
}

function goBack() {
  if (state.stack.length === 0) return false;
  const previous = state.stack.pop();
  state.current = previous.current;
  state.index = previous.index;
  render();
  return true;
}

function choose(option, index) {
  if (!state.open || state.locked || !option || option.disabled === true) return;
  if (index !== undefined) setActive(index);

  if (Array.isArray(option.children) && option.children.length > 0) {
    enter(option);
    return;
  }

  state.locked = true;
  void post("select", { option_id: option.id });
  window.clearTimeout(state.unlockTimer);
  state.unlockTimer = window.setTimeout(() => {
    if (state.open) state.locked = false;
  }, 1200);
}

async function post(route, payload = {}) {
  if (typeof GetParentResourceName !== "function") return null;

  try {
    const response = await fetch(`https://${GetParentResourceName()}/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(payload),
    });
    return await response.json().catch(() => ({}));
  } catch (error) {
    console.error(`[mz_radialmenu] ${route}`, error);
    return null;
  }
}

function close(localOnly = false) {
  const wasOpen = state.open;
  state.open = false;
  state.locked = false;
  state.current = null;
  state.stack = [];
  state.options = [];
  state.sectors = [];
  state.index = -1;
  window.clearTimeout(state.unlockTimer);

  sectorsRoot.replaceChildren();
  caption.textContent = "";
  caption.classList.add("is-hidden");
  radial.classList.remove("is-open", "is-dense");
  radial.classList.add("is-hidden");
  radial.setAttribute("aria-hidden", "true");

  if (!localOnly && wasOpen) void post("close");
}

function open(payload) {
  state.open = true;
  state.locked = false;
  state.stack = [];
  state.labels = payload?.labels || {};
  state.current = payload?.menu || { title: "", options: [] };
  state.index = 0;

  document.documentElement.lang = payload?.locale === "en" ? "en-US" : String(payload?.locale || "pt-BR");
  radial.classList.remove("is-hidden");
  radial.setAttribute("aria-hidden", "false");
  render();
  radial.focus({ preventScroll: true });
  window.setTimeout(() => {
    if (state.open) radial.classList.add("is-open");
  }, 16);
}

center.addEventListener("click", (event) => {
  event.preventDefault();
  if (state.locked) return;
  if (!goBack()) close();
});

window.addEventListener("contextmenu", (event) => {
  if (state.open) event.preventDefault();
});

window.addEventListener(
  "wheel",
  (event) => {
    if (!state.open || state.locked) return;
    event.preventDefault();
    move(event.deltaY > 0 ? 1 : -1);
  },
  { passive: false },
);

window.addEventListener("keydown", (event) => {
  if (!state.open) return;

  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }

  if (state.locked) return;

  switch (event.key) {
    case "Backspace":
      event.preventDefault();
      if (!goBack()) close();
      break;
    case "ArrowRight":
    case "ArrowDown":
      event.preventDefault();
      move(1);
      break;
    case "ArrowLeft":
    case "ArrowUp":
      event.preventDefault();
      move(-1);
      break;
    case "Tab":
      event.preventDefault();
      move(event.shiftKey ? -1 : 1);
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      choose(state.options[state.index], state.index);
      break;
  }
});

window.addEventListener("message", (event) => {
  const payload = event.data || {};
  if (payload.action === "close") {
    close(true);
    return;
  }
  if (payload.action === "open") {
    open(payload);
  }
});

close(true);
