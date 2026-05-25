import { io } from "socket.io-client";

const serverUrl = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

export const socket = io(serverUrl, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10
});

export function emitWithAck(event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response) => resolve(response ?? { ok: false, error: "No server response." }));
  });
}
