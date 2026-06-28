const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const joinBtn = document.getElementById("joinBtn");
const resetBtn = document.getElementById("resetBtn");
const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");
const fighterInput = document.getElementById("fighterInput");
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
  const name = (nameInput.value || "玩家").trim();
  const fighter = fighterInput.value;
  const result = await post("/api/join", { clientId, roomId, name, fighter });
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
  if (state.status === "waiting") centerMessage.textContent = "等待第二名玩家进入";
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
  nameEl.textContent = `${p.slot} ${p.name}`;
  hpEl.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
  metaEl.textContent = `${p.fighterName} · 气 ${Math.floor(p.energy)}`;
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, "#172033");
  g.addColorStop(0.62, "#151921");
  g.addColorStop(1, "#0b0d10");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 28; i++) {
    const x = (i * 91 + 40) % canvas.width;
    const y = 44 + ((i * 37) % 160);
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.fillStyle = "#1f2937";
  ctx.fillRect(0, 448, 960, 92);
  ctx.fillStyle = "#334155";
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
  ctx.ellipse(0, 6, 32, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = p.color;
  ctx.fillRect(-18, -70, 36, 52);
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(0, -84, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111827";
  ctx.fillRect(-10, -92, 24, 8);

  ctx.strokeStyle = p.color;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(16, -60);
  ctx.lineTo(42, -48);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-12, -18);
  ctx.lineTo(-22, 0);
  ctx.moveTo(12, -18);
  ctx.lineTo(24, 0);
  ctx.stroke();

  if (p.guarding) {
    ctx.strokeStyle = "rgba(125,211,252,0.85)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(25, -50, 34, -1.2, 1.2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawProjectile(b) {
  ctx.fillStyle = b.color;
  ctx.shadowColor = b.color;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(b.x, b.y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawSpark(s) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, s.life / 10);
  ctx.strokeStyle = s.ult ? "#facc15" : s.guarded ? "#7dd3fc" : "#ffffff";
  ctx.lineWidth = s.ult ? 8 : 4;
  for (let i = 0; i < 9; i++) {
    const a = (Math.PI * 2 * i) / 9;
    const r = s.ult ? 54 : 26;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.restore();
}

function render() {
  drawBackground();
  if (state) {
    state.projectiles.forEach(drawProjectile);
    state.players.forEach(drawFighter);
    state.sparks.forEach(drawSpark);
  }
  requestAnimationFrame(render);
}

render();
