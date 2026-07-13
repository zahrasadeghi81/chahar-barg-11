import cors from "cors";
import express from "express";
import http from "node:http";
import path from "node:path";
import { Server } from "socket.io";
import {
  addPlayer,
  addBotPlayer,
  createRoom,
  playMove,
  playBotMove,
  publicState,
  reconnectPlayer,
  removePlayer,
  startGame,
  startRound
} from "./gameEngine.js";

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

app.get("/health", (_request, response) => {
  response.json({ ok: true, game: "Chahar Barg (11)" });
});

if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(process.cwd(), "client", "dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

io.on("connection", (socket) => {
  socket.on("room:create", ({ name }, reply) => {
    try {
      const roomCode = createRoomCode();
      const room = createRoom(roomCode);
      rooms.set(roomCode, room);
      const player = addPlayer(room, socket.id, name);
      socket.join(roomCode);
      reply?.({ ok: true, roomCode, playerIndex: player.index });
      broadcastRoom(roomCode);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("room:createBot", ({ name, botName }, reply) => {
    try {
      const roomCode = createRoomCode();
      const room = createRoom(roomCode);
      rooms.set(roomCode, room);
      const player = addPlayer(room, socket.id, name);
      addBotPlayer(room, botName);
      socket.join(roomCode);
      startGame(room);
      playBotTurns(room);
      reply?.({ ok: true, roomCode, playerIndex: player.index });
      broadcastRoom(roomCode);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("room:join", ({ roomCode, name }, reply) => {
    try {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      const room = rooms.get(normalizedRoomCode);
      if (!room) throw new Error("Room not found.");
      const player = addPlayer(room, socket.id, name);
      socket.join(normalizedRoomCode);
      reply?.({ ok: true, roomCode: normalizedRoomCode, playerIndex: player.index });
      broadcastRoom(normalizedRoomCode);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("room:reconnect", ({ roomCode, playerIndex }, reply) => {
    try {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      const room = rooms.get(normalizedRoomCode);
      if (!room) throw new Error("Room not found.");
      const player = reconnectPlayer(room, socket.id, Number(playerIndex));
      socket.join(normalizedRoomCode);
      reply?.({ ok: true, roomCode: normalizedRoomCode, playerIndex: player.index });
      broadcastRoom(normalizedRoomCode);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("room:leave", ({ roomCode }, reply) => {
    try {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      const room = rooms.get(normalizedRoomCode);
      if (room) {
        removePlayer(room, socket.id);
        socket.leave(normalizedRoomCode);
        broadcastRoom(normalizedRoomCode);
        if (room.players.filter((player) => !player.bot).every((player) => !player.connected)) {
          cleanupEmptyRoom(normalizedRoomCode);
        }
      }
      reply?.({ ok: true });
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("game:start", ({ roomCode }, reply) => {
    try {
      const room = requireRoom(roomCode);
      startGame(room);
      const botMoves = playBotTurns(room);
      reply?.({ ok: true });
      broadcastRoom(room.roomCode, botMoves.some((move) => move.surAwarded) ? "sur" : null);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("game:nextRound", ({ roomCode }, reply) => {
    try {
      const room = requireRoom(roomCode);
      if (room.status !== "roundComplete") throw new Error("The current round is not complete.");
      startRound(room);
      const botMoves = playBotTurns(room);
      reply?.({ ok: true });
      broadcastRoom(room.roomCode, botMoves.some((move) => move.surAwarded) ? "sur" : null);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("game:rematch", ({ roomCode }, reply) => {
    try {
      const room = requireRoom(roomCode);
      startGame(room);
      const botMoves = playBotTurns(room);
      reply?.({ ok: true });
      broadcastRoom(room.roomCode, botMoves.some((move) => move.surAwarded) ? "sur" : null);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("game:move", ({ roomCode, cardId, tableCardIds }, reply) => {
    try {
      const room = requireRoom(roomCode);
      const player = room.players.find((candidate) => candidate.id === socket.id);
      if (!player) throw new Error("You are not seated in this room.");
      const result = playMove(room, player.index, cardId, tableCardIds);
      reply?.({ ok: true, ...result });
      broadcastRoom(room.roomCode, result.surAwarded ? "sur" : null);
      const botMoves = playBotTurns(room);
      if (botMoves.length > 0) {
        broadcastRoom(room.roomCode, botMoves.some((move) => move.surAwarded) ? "sur" : null);
      }
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("disconnect", () => {
    for (const [roomCode, room] of rooms.entries()) {
      removePlayer(room, socket.id);
      broadcastRoom(roomCode);
      if (room.players.some((player) => !player.bot) && room.players.filter((player) => !player.bot).every((player) => !player.connected)) {
        setTimeout(() => cleanupEmptyRoom(roomCode), 300000);
      }
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Chahar Barg server listening on http://0.0.0.0:${PORT}`);
});

function broadcastRoom(roomCode, event = null) {
  const room = rooms.get(roomCode);
  if (!room) return;

  for (const socketId of io.sockets.adapter.rooms.get(roomCode) ?? []) {
    io.to(socketId).emit("state", publicState(room, socketId));
    if (event) io.to(socketId).emit(event);
  }
}

function requireRoom(roomCode) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const room = rooms.get(normalizedRoomCode);
  if (!room) throw new Error("Room not found.");
  return room;
}

function createRoomCode() {
  let roomCode = "";
  do {
    roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (rooms.has(roomCode));
  return roomCode;
}

function normalizeRoomCode(roomCode) {
  return String(roomCode ?? "").trim().toUpperCase();
}

function cleanupEmptyRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (room && room.players.filter((player) => !player.bot).every((player) => !player.connected)) {
    rooms.delete(roomCode);
  }
}

function playBotTurns(room) {
  const moves = [];
  while (room.status === "playing") {
    const currentPlayer = room.players[room.turn];
    if (!currentPlayer?.bot) break;
    moves.push(playBotMove(room, currentPlayer.index));
  }
  return moves;
}
