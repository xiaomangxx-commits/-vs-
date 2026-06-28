const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const joinBtn = document.getElementById("joinBtn");
const resetBtn = document.getElementById("resetBtn");
const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");
const fighterInput = document.getElementById("fighterInput");
const mapInput = document.getElementById("mapInput");
const aiInput = document.getElementById("aiInput");
const roomStatus = document.getElementById("roomStatus");
const centerMessage = document.getElementById("centerMessage");
const timerEl = document.getElementById("timer");
const p1Name = document.getElementById("p1Name");
const p2Name = document.getElementById("p2Name");
const p1Hp = document.getElementById("p1Hp");
const p2Hp = document.getElementById("p2Hp");
const p1Meta = document.getElementById("p1Meta");
const p2Meta = document.getElementById("p2Meta");

let clientId = localStorage.getItem("fighterClientId");
if (!clientId) {
  clientId = Math.random().toString(16).slice(2) + Date.now().toString(16);
  localStorage.setItem("fighterClientId", clientId);
}

let roomId = "";
let mySlot = "";
let state = null;
let events = null;
const input = { a: false, d: false, w: false, s: false };
const keyMap = { a: "a", d: "d", w: "w", s: "s", ArrowLeft: "a", ArrowRight: "d", ArrowUp: "w", ArrowDown: "s" };
const actionMap = { j: "attack", k: "dash", l: "shot", u: "ult", J: "attack", K: "dash", L: "shot", U: "ult" };

function post(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then((r) => r.json());
}

function sendInput() {
  if (!roomId) return;
  post("/api/input", { clientId, roomId, input }).catch(() => {});
}

function sendAction(action) {
  if (!roomId) return;
  post("/api/action", { clientId, roomId, action }).catch(() => {});
}

joinBtn.addEventListener("click", async () => {
  roomId = (roomInput.value || "8888").trim().slice(0, 12);
  const result = await post("/api/join", {
    clientId,
    roomId,
    name: (nameInput.value || "玩家").trim(),
    fighter: fighterInput.value,
    map: mapInput.value,
    aiMode: aiInput.value
  });
  mySlot = result.slot;
  resetBtn.disabled = false;
  roomStatus.textContent = `房间 ${roomId} · ${mySlot}`;
  if (events) events.close();
  events = new EventSource(`/events?clientId=${clientId}&roomId=${roomId}`);
  events.onmessage = (event) => {
    state = JSON.parse(event.data);
    updateHud();
  };
});

resetBtn.addEventListener("click", () => {
  if (roomId) post("/api/reset", { roomId, clientId }).catch(() => {});
});

window.addEventListener("keydown", (e) => {
  const k = keyMap[e.key];
  if (k) {
    input[k] = true;
    sendInput();
    e.preventDefault();
  }
  const action = actionMap[e.key];
  if (action) {
    sendAction(action);
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  const k = keyMap[e.key];
  if (k) {
    input[k] = false;
    sendInput();
    e.preventDefault();
  }
});

document.querySelectorAll("[data-key]").forEach((btn) => {
  const key = btn.dataset.key;
  const down = (e) => {
    e.preventDefault();
    input[key] = true;
    sendInput();
  };
  const up = (e) => {
    e.preventDefault();
    input[key] = false;
    sendInput();
  };
  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("pointerleave", up);
});

document.querySelectorAll("[data-action]").forEach((btn) => {
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    sendAction(btn.dataset.action);
  });
});

setInterval(sendInput, 90);

function updateHud() {
  if (!state) return;
  const [a, b] = state.players;
  timerEl.textContent = state.timeLeft;
  setCard(a, p1Name, p1Hp, p1Meta, "P1");
  setCard(b, p2Name, p2Hp, p2Meta, "P2");
  if (state.status === "waiting") centerMessage.textContent = "等待第二名玩家进入，或选择 AI 对手";
  if (state.status === "fighting") centerMessage.textContent = "";
  if (state.status === "ended") centerMessage.textContent = state.winner || "本局结束";
}

function setCard(p, nameEl, hpEl, metaEl, fallback) {
  if (!p) {
    nameEl.textContent = "等待玩家";
    hpEl.style.width = "0%";
    metaEl.textContent = fallback;
    return;
  }
  nameEl.textContent = `${p.slot} ${p.name}${p.isAI ? " · AI" : ""}`;
  hpEl.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
  metaEl.textContent = `${p.fighterName} · 气 ${Math.floor(p.energy)}`;
}

function drawBackground() {
  const map = state?.map || { sky: "#172033", mid: "#151921", floor: "#1f2937", line: "#334155", name: "夜都天台" };
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, map.sky);
  g.addColorStop(0.62, map.mid);
  g.addColorStop(1, "#08090d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 32; i++) {
    const x = (i * 91 + 40) % canvas.width;
    const y = 38 + ((i * 37) % 180);
    ctx.fillRect(x, y, i % 3 === 0 ? 3 : 2, 2);
  }

  if (state?.mapKey === "shrine") {
    ctx.fillStyle = "rgba(248,113,113,0.18)";
    ctx.beginPath();
    ctx.arc(760, 118, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(127,29,29,0.7)";
    for (let x = 120; x < 840; x += 220) {
      ctx.fillRect(x, 260, 28, 190);
      ctx.fillRect(x - 28, 250, 84, 18);
    }
  } else if (state?.mapKey === "storm") {
    ctx.strokeStyle = "rgba(56,189,248,0.35)";
    ctx.lineWidth = 4;
    for (let x = 160; x < 900; x += 210) {
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.lineTo(x + 28, 120);
      ctx.lineTo(x - 8, 120);
      ctx.lineTo(x + 32, 220);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = "rgba(148,163,184,0.16)";
    for (let x = 70; x < 930; x += 120) {
      ctx.fillRect(x, 210 - (x % 3) * 20, 64, 238);
      ctx.fillRect(x + 9, 235, 10, 16);
      ctx.fillRect(x + 34, 265, 10, 16);
    }
  }

  ctx.fillStyle = map.floor;
  ctx.fillRect(0, 448, 960, 92);
  ctx.fillStyle = map.line;
  ctx.fillRect(0, 448, 960, 8);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  for (let x = 0; x < 960; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 456);
    ctx.lineTo(x - 40, 540);
    ctx.stroke();
  }
}

function drawFighter(p) {
  const x = p.x;
  const y = p.y;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(p.face, 1);
  if (p.hitstun > 0) ctx.globalAlpha = 0.78;

  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(0, 6, 34, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = p.color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-16, -18);
  ctx.lineTo(-24, 0);
  ctx.moveTo(14, -18);
  ctx.lineTo(28, 0);
  ctx.moveTo(-14, -58);
  ctx.lineTo(-38, -48);
  ctx.moveTo(16, -58);
  ctx.lineTo(43, -48);
  ctx.stroke();

  ctx.fillStyle = p.color;
  ctx.fillRect(-19, -70, 38, 54);
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(0, -86, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111827";
  ctx.fillRect(-11, -95, 26, 8);

  ctx.shadowBlur = 0;
  if (p.energy >= 100) {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(0, -52, 50, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (p.guarding) {
    ctx.strokeStyle = "rgba(125,211,252,0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(25, -50, 35, -1.2, 1.2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawProjectile(b) {
  ctx.save();
  ctx.fillStyle = b.color;
  ctx.shadowColor = b.color;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(b.x, b.y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.38;
  ctx.fillRect(b.x - Math.sign(b.vx) * 40, b.y - 5, Math.sign(b.vx) * 40, 10);
  ctx.restore();
}

function drawSlash(s) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, s.life / 7);
  ctx.translate(s.x, s.y);
  ctx.scale(s.face, 1);
  ctx.strokeStyle = s.color;
  ctx.shadowColor = s.color;
  ctx.shadowBlur = 16;
  ctx.lineWidth = s.dash ? 9 : 6;
  ctx.beginPath();
  ctx.arc(0, 0, s.dash ? 58 : 38, -0.8, 0.8);
  ctx.stroke();
  ctx.restore();
}

function drawSpark(s) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, s.life / 10);
  ctx.strokeStyle = s.ult ? s.color || "#facc15" : s.guarded ? "#7dd3fc" : "#ffffff";
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = s.ult ? 22 : 10;
  ctx.lineWidth = s.ult ? 8 : 4;
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10;
    const r = s.ult ? 72 : 28;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
    ctx.stroke();
  }
  if (s.value) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = s.guarded ? "#93c5fd" : "#fef3c7";
    ctx.font = "700 18px Arial";
    ctx.fillText(`-${s.value}`, s.x + 18, s.y - 18);
  }
  ctx.restore();
}

function render() {
  drawBackground();
  if (state) {
    state.projectiles.forEach(drawProjectile);
    state.players.forEach(drawFighter);
    state.slashes.forEach(drawSlash);
    state.sparks.forEach(drawSpark);
  }
  requestAnimationFrame(render);
}

render();
