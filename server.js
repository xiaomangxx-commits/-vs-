const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PUBLIC = __dirname;
const TICK_MS = 50;
const ROUND_SECONDS = 99;
const WORLD = { w: 960, h: 540, floor: 448 };

const fighters = {
  blade: { name: "星刃剑士", color: "#7dd3fc", speed: 5.5, jump: 13.2, hp: 1000, melee: 60, shot: 70, ult: 220 },
  shadow: { name: "影遁忍者", color: "#c084fc", speed: 6.5, jump: 13.8, hp: 900, melee: 54, shot: 65, ult: 205 },
  flame: { name: "炎拳武者", color: "#fb7185", speed: 4.9, jump: 12.2, hp: 1140, melee: 70, shot: 62, ult: 240 },
  thunder: { name: "雷鸣枪手", color: "#facc15", speed: 5.7, jump: 12.8, hp: 960, melee: 58, shot: 88, ult: 215 },
  frost: { name: "霜月术士", color: "#67e8f9", speed: 5.0, jump: 12.6, hp: 980, melee: 52, shot: 96, ult: 210 },
  lotus: { name: "莲华拳姬", color: "#f9a8d4", speed: 6.1, jump: 13.4, hp: 930, melee: 66, shot: 56, ult: 218 },
  iron: { name: "铁壁重卫", color: "#94a3b8", speed: 4.2, jump: 11.5, hp: 1280, melee: 78, shot: 55, ult: 260 },
  wind: { name: "风牙游侠", color: "#86efac", speed: 6.8, jump: 14.1, hp: 880, melee: 50, shot: 82, ult: 198 },
  void: { name: "虚空行者", color: "#a78bfa", speed: 5.4, jump: 13.0, hp: 990, melee: 58, shot: 74, ult: 230 },
  sun: { name: "曜阳武士", color: "#fdba74", speed: 5.3, jump: 12.7, hp: 1060, melee: 68, shot: 68, ult: 235 }
};

const maps = {
  city: { name: "夜都天台", sky: "#172033", mid: "#151921", floor: "#1f2937", line: "#334155" },
  shrine: { name: "赤月神社", sky: "#2b1620", mid: "#18121c", floor: "#2a1c24", line: "#7f1d1d" },
  storm: { name: "雷云峡谷", sky: "#101827", mid: "#0f172a", floor: "#172554", line: "#38bdf8" }
};

const rooms = new Map();
const clients = new Map();

function uid() {
  return crypto.randomBytes(8).toString("hex");
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function cleanId(value, fallback) {
  return String(value || fallback).replace(/[^\w\u4e00-\u9fa5-]/g, "").slice(0, 16) || fallback;
}

function getRoom(roomId) {
  const id = cleanId(roomId, "8888");
  if (!rooms.has(id)) {
    rooms.set(id, {
      id,
      mapKey: "city",
      aiMode: "none",
      players: [],
      spectators: [],
      projectiles: [],
      slashes: [],
      sparks: [],
      status: "waiting",
      winner: "",
      timeLeft: ROUND_SECONDS,
      lastTick: Date.now(),
      aiThink: 0
    });
  }
  return rooms.get(id);
}

function makePlayer(clientId, slot, name, fighterKey, isAI = false, aiMode = "normal") {
  const key = fighters[fighterKey] ? fighterKey : "blade";
  const base = fighters[key];
  const left = slot === "P1";
  return {
    id: clientId,
    slot,
    name: String(name || slot).slice(0, 10),
    fighterKey: key,
    fighterName: base.name,
    color: base.color,
    isAI,
    aiMode,
    x: left ? 230 : 730,
    y: WORLD.floor,
    vx: 0,
    vy: 0,
    w: 42,
    h: 86,
    face: left ? 1 : -1,
    hp: base.hp,
    maxHp: base.hp,
    energy: 25,
    grounded: true,
    guarding: false,
    hitstun: 0,
    combo: 0,
    input: {},
    cd: { attack: 0, dash: 0, shot: 0, ult: 0 }
  };
}

function resetRoom(room) {
  room.projectiles = [];
  room.slashes = [];
  room.sparks = [];
  room.status = room.players.length >= 2 ? "fighting" : "waiting";
  room.winner = "";
  room.timeLeft = ROUND_SECONDS;
  room.lastTick = Date.now();
  room.players.forEach((p, i) => {
    const fresh = makePlayer(p.id, i === 0 ? "P1" : "P2", p.name, p.fighterKey, p.isAI, p.aiMode);
    Object.assign(p, fresh);
  });
}

function ensureAI(room, aiMode) {
  room.players = room.players.filter((p) => !p.isAI);
  room.aiMode = aiMode || "none";
  if (room.aiMode !== "none" && room.players.length === 1) {
    const keys = Object.keys(fighters);
    const pick = keys[Math.floor(Math.random() * keys.length)];
    room.players.push(makePlayer(`ai-${room.id}`, "P2", `AI-${room.aiMode}`, pick, true, room.aiMode));
  }
}

function joinRoom(body) {
  const room = getRoom(body.roomId);
  if (maps[body.map]) room.mapKey = body.map;
  ensureAI(room, body.aiMode || room.aiMode);

  let player = room.players.find((p) => p.id === body.clientId);
  if (!player && room.players.length >= 2 && room.players.some((p) => p.isAI)) {
    const aiIndex = room.players.findIndex((p) => p.isAI);
    const slot = room.players[aiIndex].slot;
    player = makePlayer(body.clientId, slot, body.name, body.fighter);
    room.players[aiIndex] = player;
  }
  if (!player && room.players.length < 2) {
    player = makePlayer(body.clientId, room.players.length === 0 ? "P1" : "P2", body.name, body.fighter);
    room.players.push(player);
  }
  if (!player && !room.spectators.includes(body.clientId)) room.spectators.push(body.clientId);
  if (player) {
    player.name = String(body.name || player.name).slice(0, 10);
    if (fighters[body.fighter]) player.fighterKey = body.fighter;
    player.isAI = false;
  }
  ensureAI(room, body.aiMode || room.aiMode);
  if (room.players.length >= 2) resetRoom(room);
  return { ok: true, clientId: body.clientId, roomId: room.id, slot: player ? player.slot : "观战" };
}

function hitRect(a, b, rangeX, rangeY) {
  return Math.abs(a.x - b.x) < rangeX && Math.abs((a.y - a.h / 2) - (b.y - b.h / 2)) < rangeY;
}

function damage(room, target, amount, fromX, lift = 0) {
  const guarded = target.guarding && Math.sign(fromX - target.x) !== target.face;
  const real = guarded ? Math.ceil(amount * 0.3) : amount;
  target.hp = clamp(target.hp - real, 0, target.maxHp);
  target.hitstun = guarded ? 4 : 10;
  target.vx += fromX < target.x ? 6 : -6;
  target.vy -= lift;
  room.sparks.push({ x: target.x, y: target.y - 54, life: guarded ? 9 : 13, guarded, value: real });
}

function action(room, player, type) {
  if (room.status !== "fighting" || player.hitstun > 0 || player.hp <= 0) return;
  const enemy = room.players.find((p) => p.id !== player.id);
  if (!enemy) return;
  const base = fighters[player.fighterKey] || fighters.blade;

  if (type === "attack" && player.cd.attack <= 0) {
    player.cd.attack = 7;
    player.energy = clamp(player.energy + 9, 0, 100);
    room.slashes.push({ x: player.x + player.face * 36, y: player.y - 56, face: player.face, color: player.color, life: 7 });
    if (hitRect(player, enemy, 88, 76) && Math.sign(enemy.x - player.x) === player.face) {
      damage(room, enemy, base.melee + player.combo * 4, player.x, 1.4);
      player.combo = clamp(player.combo + 1, 0, 4);
    } else {
      player.combo = 0;
    }
  }
  if (type === "dash" && player.cd.dash <= 0) {
    player.cd.dash = 24;
    player.vx = player.face * 18;
    player.energy = clamp(player.energy + 6, 0, 100);
    room.slashes.push({ x: player.x + player.face * 52, y: player.y - 52, face: player.face, color: player.color, life: 11, dash: true });
    if (hitRect(player, enemy, 108, 70)) damage(room, enemy, base.melee + 32, player.x, 3);
  }
  if (type === "shot" && player.cd.shot <= 0) {
    player.cd.shot = 28;
    player.energy = clamp(player.energy + 10, 0, 100);
    room.projectiles.push({
      owner: player.id,
      x: player.x + player.face * 46,
      y: player.y - 54,
      vx: player.face * 12,
      damage: base.shot,
      life: 80,
      color: player.color
    });
  }
  if (type === "ult" && player.cd.ult <= 0 && player.energy >= 100) {
    player.energy = 0;
    player.cd.ult = 115;
    room.sparks.push({ x: player.x + player.face * 72, y: player.y - 74, life: 26, ult: true, color: player.color });
    if (hitRect(player, enemy, 210, 115)) damage(room, enemy, base.ult, player.x, 9);
  }
}

function updateAI(room, ai) {
  const enemy = room.players.find((p) => p.id !== ai.id);
  if (!enemy || ai.hp <= 0) return;
  const mode = ai.aiMode || "normal";
  const dist = enemy.x - ai.x;
  const adist = Math.abs(dist);
  const bravery = mode === "weak" ? 0.35 : mode === "smart" ? 0.78 : 0.55;
  const shootAt = mode === "weak" ? 260 : mode === "smart" ? 390 : 320;
  ai.input = { a: false, d: false, w: false, s: false };
  ai.face = dist >= 0 ? 1 : -1;
  if (adist > 74) {
    ai.input[dist > 0 ? "d" : "a"] = true;
  }
  if (enemy.energy > 70 && adist < 150 && Math.random() < bravery) ai.input.s = true;
  if (adist < 92 && Math.random() < bravery) action(room, ai, "attack");
  if (adist > 105 && adist < shootAt && Math.random() < bravery * 0.45) action(room, ai, "shot");
  if (adist > 90 && adist < 170 && Math.random() < bravery * 0.35) action(room, ai, "dash");
  if (ai.energy >= 100 && adist < 215 && Math.random() < bravery) action(room, ai, "ult");
  if (enemy.y < ai.y - 40 && Math.random() < bravery * 0.2) ai.input.w = true;
}

function updateRoom(room) {
  const now = Date.now();
  const dt = Math.max(1, Math.round((now - room.lastTick) / TICK_MS));
  room.lastTick = now;
  if (room.status !== "fighting") return;
  room.timeLeft = Math.max(0, room.timeLeft - (TICK_MS * dt) / 1000);
  room.players.filter((p) => p.isAI).forEach((p) => updateAI(room, p));

  room.players.forEach((p) => {
    Object.keys(p.cd).forEach((k) => (p.cd[k] = Math.max(0, p.cd[k] - dt)));
    p.hitstun = Math.max(0, p.hitstun - dt);
    p.energy = clamp(p.energy + 0.11 * dt, 0, 100);
    const base = fighters[p.fighterKey] || fighters.blade;
    p.guarding = !!p.input.s && p.grounded;
    if (p.hitstun <= 0) {
      const left = !!p.input.a;
      const right = !!p.input.d;
      p.vx *= 0.62;
      if (left) p.vx -= p.guarding ? base.speed * 0.16 : base.speed * 0.38;
      if (right) p.vx += p.guarding ? base.speed * 0.16 : base.speed * 0.38;
      p.vx = clamp(p.vx, -base.speed, base.speed);
      if (left) p.face = -1;
      if (right) p.face = 1;
      if (p.input.w && p.grounded && !p.guarding) {
        p.vy = -base.jump;
        p.grounded = false;
      }
    }
    p.vy += 0.72;
    p.x = clamp(p.x + p.vx, 35, WORLD.w - 35);
    p.y += p.vy;
    if (p.y >= WORLD.floor) {
      p.y = WORLD.floor;
      p.vy = 0;
      p.grounded = true;
    }
  });

  room.projectiles.forEach((b) => {
    b.x += b.vx;
    b.life -= dt;
    const target = room.players.find((p) => p.id !== b.owner && p.hp > 0);
    if (target && Math.abs(target.x - b.x) < 38 && Math.abs(target.y - 52 - b.y) < 56) {
      damage(room, target, b.damage, b.x, 3.5);
      b.life = 0;
    }
  });
  room.projectiles = room.projectiles.filter((b) => b.life > 0 && b.x > -30 && b.x < WORLD.w + 30);
  room.sparks.forEach((s) => (s.life -= dt));
  room.slashes.forEach((s) => (s.life -= dt));
  room.sparks = room.sparks.filter((s) => s.life > 0);
  room.slashes = room.slashes.filter((s) => s.life > 0);

  const alive = room.players.filter((p) => p.hp > 0);
  if (alive.length < 2 || room.timeLeft <= 0) {
    room.status = "ended";
    const [a, b] = room.players;
    if (!a || !b || a.hp === b.hp) room.winner = "平局";
    else room.winner = a.hp > b.hp ? `${a.name} 获胜` : `${b.name} 获胜`;
  }
}

function publicState(room) {
  return {
    id: room.id,
    status: room.status,
    winner: room.winner,
    timeLeft: Math.ceil(room.timeLeft),
    world: WORLD,
    mapKey: room.mapKey,
    map: maps[room.mapKey],
    fighters,
    aiMode: room.aiMode,
    players: room.players.map((p) => ({
      id: p.id,
      slot: p.slot,
      name: p.name,
      fighterName: p.fighterName,
      fighterKey: p.fighterKey,
      color: p.color,
      isAI: p.isAI,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      face: p.face,
      hp: p.hp,
      maxHp: p.maxHp,
      energy: p.energy,
      guarding: p.guarding,
      hitstun: p.hitstun
    })),
    projectiles: room.projectiles,
    slashes: room.slashes,
    sparks: room.sparks,
    spectators: room.spectators.length
  };
}

setInterval(() => {
  rooms.forEach((room) => updateRoom(room));
  clients.forEach((client) => {
    const room = rooms.get(client.roomId);
    if (room) client.res.write(`data: ${JSON.stringify(publicState(room))}\n\n`);
  });
}, TICK_MS);

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, data) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function serveFile(req, res) {
  const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const file = path.join(PUBLIC, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(PUBLIC)) return res.writeHead(403).end("Forbidden");
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end("Not found");
    const ext = path.extname(file);
    const type = ext === ".html" ? "text/html" : ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "text/plain";
    res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url.startsWith("/events")) {
    const query = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const clientId = query.get("clientId") || uid();
    const roomId = query.get("roomId") || "8888";
    getRoom(roomId);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    clients.set(clientId, { res, roomId });
    req.on("close", () => clients.delete(clientId));
    return;
  }
  if (req.method === "POST" && req.url === "/api/join") {
    const body = await readJson(req);
    body.clientId = body.clientId || uid();
    return sendJson(res, joinRoom(body));
  }
  if (req.method === "POST" && req.url === "/api/input") {
    const body = await readJson(req);
    const room = rooms.get(body.roomId);
    const player = room && room.players.find((p) => p.id === body.clientId && !p.isAI);
    if (player) player.input = body.input || {};
    return sendJson(res, { ok: true });
  }
  if (req.method === "POST" && req.url === "/api/action") {
    const body = await readJson(req);
    const room = rooms.get(body.roomId);
    const player = room && room.players.find((p) => p.id === body.clientId && !p.isAI);
    if (room && player) action(room, player, body.action);
    return sendJson(res, { ok: true });
  }
  if (req.method === "POST" && req.url === "/api/reset") {
    const body = await readJson(req);
    const room = rooms.get(body.roomId);
    if (room) resetRoom(room);
    return sendJson(res, { ok: true });
  }
  serveFile(req, res);
});

server.listen(PORT, () => {
  console.log(`Anime fighter online server running on port ${PORT}`);
});
