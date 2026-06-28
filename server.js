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
  blade: { name: "星刃剑士", color: "#7dd3fc", speed: 5.3, jump: 13, hp: 1000 },
  shadow: { name: "影遁忍者", color: "#c084fc", speed: 6.2, jump: 13.5, hp: 900 },
  flame: { name: "炎拳武者", color: "#fb7185", speed: 4.8, jump: 12, hp: 1120 },
  thunder: { name: "雷鸣枪手", color: "#facc15", speed: 5.5, jump: 12.5, hp: 960 }
};

const rooms = new Map();
const clients = new Map();

function uid() {
  return crypto.randomBytes(8).toString("hex");
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function getRoom(roomId) {
  const id = String(roomId || "8888").slice(0, 12);
  if (!rooms.has(id)) {
    rooms.set(id, {
      id,
      players: [],
      spectators: [],
      projectiles: [],
      sparks: [],
      status: "waiting",
      winner: "",
      timeLeft: ROUND_SECONDS,
      lastTick: Date.now()
    });
  }
  return rooms.get(id);
}

function makePlayer(clientId, slot, name, fighterKey) {
  const base = fighters[fighterKey] || fighters.blade;
  const left = slot === "P1";
  return {
    id: clientId,
    slot,
    name: String(name || slot).slice(0, 10),
    fighterKey: fighters[fighterKey] ? fighterKey : "blade",
    fighterName: base.name,
    color: base.color,
    x: left ? 230 : 730,
    y: WORLD.floor,
    vx: 0,
    vy: 0,
    w: 42,
    h: 86,
    face: left ? 1 : -1,
    hp: base.hp,
    maxHp: base.hp,
    energy: 0,
    grounded: true,
    guarding: false,
    hitstun: 0,
    input: {},
    cd: { attack: 0, dash: 0, shot: 0, ult: 0 }
  };
}

function resetRoom(room) {
  room.projectiles = [];
  room.sparks = [];
  room.status = room.players.length >= 2 ? "fighting" : "waiting";
  room.winner = "";
  room.timeLeft = ROUND_SECONDS;
  room.lastTick = Date.now();
  room.players.forEach((p, i) => {
    const fresh = makePlayer(p.id, i === 0 ? "P1" : "P2", p.name, p.fighterKey);
    Object.assign(p, fresh);
  });
}

function joinRoom(body) {
  const room = getRoom(body.roomId);
  let player = room.players.find((p) => p.id === body.clientId);
  if (!player && room.players.length < 2) {
    player = makePlayer(body.clientId, room.players.length === 0 ? "P1" : "P2", body.name, body.fighter);
    room.players.push(player);
  }
  if (!player && !room.spectators.includes(body.clientId)) room.spectators.push(body.clientId);
  if (player) {
    player.name = String(body.name || player.name).slice(0, 10);
    if (fighters[body.fighter]) player.fighterKey = body.fighter;
  }
  if (room.players.length >= 2 && room.status !== "fighting") resetRoom(room);
  return { ok: true, clientId: body.clientId, roomId: room.id, slot: player ? player.slot : "观战" };
}

function hitRect(a, b, rangeX, rangeY) {
  return Math.abs(a.x - b.x) < rangeX && Math.abs((a.y - a.h / 2) - (b.y - b.h / 2)) < rangeY;
}

function damage(room, target, amount, fromX, lift = 0) {
  const guarded = target.guarding && Math.sign(fromX - target.x) !== target.face;
  const real = guarded ? Math.ceil(amount * 0.35) : amount;
  target.hp = clamp(target.hp - real, 0, target.maxHp);
  target.hitstun = guarded ? 4 : 9;
  target.vx += fromX < target.x ? 5 : -5;
  target.vy -= lift;
  room.sparks.push({ x: target.x, y: target.y - 54, life: 9, guarded });
}

function action(room, player, type) {
  if (room.status !== "fighting" || player.hitstun > 0) return;
  const enemy = room.players.find((p) => p.id !== player.id);
  if (!enemy) return;
  if (type === "attack" && player.cd.attack <= 0) {
    player.cd.attack = 9;
    player.energy = clamp(player.energy + 8, 0, 100);
    if (hitRect(player, enemy, 82, 76) && Math.sign(enemy.x - player.x) === player.face) {
      damage(room, enemy, 58, player.x, 1);
    }
  }
  if (type === "dash" && player.cd.dash <= 0) {
    player.cd.dash = 28;
    player.vx = player.face * 15;
    player.energy = clamp(player.energy + 5, 0, 100);
    if (hitRect(player, enemy, 92, 70)) damage(room, enemy, 82, player.x, 2);
  }
  if (type === "shot" && player.cd.shot <= 0) {
    player.cd.shot = 34;
    player.energy = clamp(player.energy + 10, 0, 100);
    room.projectiles.push({
      owner: player.id,
      x: player.x + player.face * 42,
      y: player.y - 52,
      vx: player.face * 11,
      damage: 72,
      life: 80,
      color: player.color
    });
  }
  if (type === "ult" && player.cd.ult <= 0 && player.energy >= 100) {
    player.energy = 0;
    player.cd.ult = 120;
    if (hitRect(player, enemy, 190, 105)) damage(room, enemy, 210, player.x, 8);
    room.sparks.push({ x: enemy.x, y: enemy.y - 62, life: 22, ult: true });
  }
}

function updateRoom(room) {
  const now = Date.now();
  const dt = Math.max(1, Math.round((now - room.lastTick) / TICK_MS));
  room.lastTick = now;
  if (room.status !== "fighting") return;
  room.timeLeft = Math.max(0, room.timeLeft - (TICK_MS * dt) / 1000);

  room.players.forEach((p) => {
    Object.keys(p.cd).forEach((k) => (p.cd[k] = Math.max(0, p.cd[k] - dt)));
    p.hitstun = Math.max(0, p.hitstun - dt);
    const base = fighters[p.fighterKey] || fighters.blade;
    p.guarding = !!p.input.s && p.grounded;
    if (p.hitstun <= 0) {
      const left = !!p.input.a;
      const right = !!p.input.d;
      p.vx = 0;
      if (left) p.vx -= p.guarding ? base.speed * 0.35 : base.speed;
      if (right) p.vx += p.guarding ? base.speed * 0.35 : base.speed;
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
      damage(room, target, b.damage, b.x, 3);
      b.life = 0;
    }
  });
  room.projectiles = room.projectiles.filter((b) => b.life > 0 && b.x > -30 && b.x < WORLD.w + 30);
  room.sparks.forEach((s) => (s.life -= dt));
  room.sparks = room.sparks.filter((s) => s.life > 0);

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
    players: room.players.map((p) => ({
      id: p.id,
      slot: p.slot,
      name: p.name,
      fighterName: p.fighterName,
      fighterKey: p.fighterKey,
      color: p.color,
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
    const player = room && room.players.find((p) => p.id === body.clientId);
    if (player) player.input = body.input || {};
    return sendJson(res, { ok: true });
  }
  if (req.method === "POST" && req.url === "/api/action") {
    const body = await readJson(req);
    const room = rooms.get(body.roomId);
    const player = room && room.players.find((p) => p.id === body.clientId);
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
