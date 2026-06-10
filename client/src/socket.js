import { io } from "socket.io-client";

const serverUrl = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3001`;
const ACK_TIMEOUT_MS = 6000;

export const socket = io(serverUrl, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  timeout: 6000
});

export function emitWithAck(event, payload) {
  return new Promise((resolve) => {
    if (!socket.connected) {
      resolve({ ok: false, error: `Cannot reach the game server at ${serverUrl}. Make sure the server is running.` });
      return;
    }

    const timeout = window.setTimeout(() => {
      resolve({ ok: false, error: "The game server did not respond. Please try again." });
    }, ACK_TIMEOUT_MS);

    socket.emit(event, payload, (response) => {
      window.clearTimeout(timeout);
      resolve(response ?? { ok: false, error: "No server response." });
    });
  });
}

export { serverUrl };
