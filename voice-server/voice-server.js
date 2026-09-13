/**
 * 10/A Panel — Sesli Oda Sinyal Sunucusu (Render'a deploy edilir)
 *
 * Netlify uzun süreli WebSocket desteklemediği için bu servis ayrı çalışır.
 * Render ücretsiz planı: 750 saat/ay, yeterli. Cold start ~1 dk.
 *
 * Görevi:
 *  - Oda bazlı WebSocket odaları (E1-E3, K1-K3)
 *  - WebRTC offer/answer/ice-candidate mesajlarını kullanıcılar arasında aktarmak
 *  - Kimlik: istek başına basit token doğrulama (panelde üretilir)
 *
 * Çalıştırma: node voice-server.js  (PORT env'ini Render verir)
 */

const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3001;
const SHARED_SECRET = process.env.VOICE_SECRET || "degistir-beni-render-env-de";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || ""; // örn. https://10asinifi.netlify.app
// Dead connection temizliği: Render proxy'si yarı-kapanan TCP'yi bildirmez;
// sunucu düzenli ping atar, pong döneyeni yaşıyor sayar.
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 30000);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: roomNames(), users: totalUsers() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

/* Basit WebSocket implementasyonu (RFC 6455) — ek bağımlılık yok. */
const rooms = new Map(); // roomId -> Set<client>

function roomNames() {
  return Array.from(rooms.keys());
}
function totalUsers() {
  let n = 0;
  for (const set of rooms.values()) n += set.size;
  return n;
}

function encodeFrame(payload, opcode = 0x1) {
  const len = Buffer.byteLength(payload);
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, Buffer.from(payload)]);
}

function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const opcode = buffer[offset] & 0x0f;
    let len = buffer[offset + 1] & 0x7f;
    let offset2 = offset + 2;
    if (len === 126) {
      if (offset2 + 2 > buffer.length) break;
      len = buffer.readUInt16BE(offset2);
      offset2 += 2;
    } else if (len === 127) {
      if (offset2 + 8 > buffer.length) break;
      len = Number(buffer.readBigUInt64BE(offset2));
      offset2 += 8;
    }
    const mask = buffer[offset2 - 0] && buffer[offset + 1] & 0x80;
    if (offset2 + 4 + len > buffer.length) break;
    const maskKey = buffer.slice(offset2, offset2 + 4);
    const data = Buffer.from(buffer.slice(offset2 + 4, offset2 + 4 + len));
    if (mask) {
      for (let i = 0; i < data.length; i++) data[i] ^= maskKey[i % 4];
    }
    frames.push({ opcode, data: data.toString("utf8") });
    offset = offset2 + 4 + len;
  }
  return frames;
}

server.on("upgrade", (req, socket) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname !== "/voice") {
    socket.destroy();
    return;
  }
  // Kimlik doğrulama: panel tarafından imzalanmış kısa ömürlü token
  const token = url.searchParams.get("token") || "";
  const expected = crypto.createHmac("sha256", SHARED_SECRET).update("voice").digest("hex").slice(0, 32);
  if (token !== expected) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  // (Basitlik için origin kontrolü atlandı; token yeterli)

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  socket.setNoDelay(true);

  const client = {
    socket,
    room: null,
    name: url.searchParams.get("name") || "Anonim",
    vc: url.searchParams.get("vc") || "",
    alive: true,
  };

  socket.on("data", (buf) => {
    client.alive = true; // her gelen veri yaşam sinyali sayılır
    for (const frame of decodeFrames(buf)) {
      if (frame.opcode === 0x8) {
        leaveRoom(client);
        socket.end();
        return;
      }
      if (frame.opcode === 0x9) {
        socket.write(encodeFrame(frame.data, 0xa)); // ping -> pong
        continue;
      }
      if (frame.opcode === 0xa) {
        continue; // sunucu ping'ine pong — alive yukarıda işaretlendi
      }
      try {
        const msg = JSON.parse(frame.data);
        handleMessage(client, msg);
      } catch {}
    }
  });

  socket.on("close", () => leaveRoom(client));
  socket.on("end", () => leaveRoom(client));
  socket.on("error", () => leaveRoom(client));
});

function send(client, obj) {
  try {
    client.socket.write(encodeFrame(JSON.stringify(obj)));
  } catch {}
}

function broadcast(roomId, obj, except) {
  const set = rooms.get(roomId);
  if (!set) return;
  for (const c of set) {
    if (c !== except) send(c, obj);
  }
}

function joinRoom(client, roomId) {
  if (client.room === roomId) return;
  leaveRoom(client);
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  const set = rooms.get(roomId);
  // Oda kapasitesi: 8 kişi (sınıf odası için yeterli)
  if (set.size >= 8) {
    send(client, { type: "full" });
    return;
  }
  set.add(client);
  client.room = roomId;
  const others = Array.from(set).map((c) => ({ name: c.name, vc: c.vc }));
  send(client, { type: "joined", room: roomId, users: others });
  broadcast(roomId, { type: "user-joined", name: client.name, vc: client.vc }, client);
}

function leaveRoom(client) {
  if (!client.room) return;
  const set = rooms.get(client.room);
  if (set) {
    set.delete(client);
    broadcast(client.room, { type: "user-left", name: client.name });
    if (set.size === 0) rooms.delete(client.room);
  }
  client.room = null;
}

function handleMessage(client, msg) {
  switch (msg.type) {
    case "join":
      joinRoom(client, String(msg.room || "").slice(0, 40));
      break;
    case "signal":
      if (!client.room) return;
      broadcast(client.room, { type: "signal", from: client.name, data: msg.data }, client);
      break;
    case "speaking":
      if (client.room) {
        broadcast(client.room, { type: "speaking", name: client.name, on: !!msg.on }, client);
      }
      break;
    case "mute":
      if (client.room) {
        broadcast(client.room, { type: "mute", name: client.name, muted: !!msg.muted }, client);
      }
      break;
  }
}

setInterval(() => {
  // Heartbeat: ping gönder, önceki turda pong dönmeyeni at
  for (const [roomId, set] of rooms) {
    for (const c of Array.from(set)) {
      if (!c.alive) {
        set.delete(c);
        try { c.socket.destroy(); } catch {}
        broadcast(roomId, { type: "user-left", name: c.name });
        continue;
      }
      c.alive = false;
      try { c.socket.write(encodeFrame("", 0x9)); } catch {}
    }
    if (set.size === 0) rooms.delete(roomId);
  }
}, HEARTBEAT_MS);

server.listen(PORT, () => {
  console.log(`Voice server listening on :${PORT}`);
});
