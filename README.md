# Chahar Barg (11)

A complete LAN multiplayer implementation of the two-player Iranian card game **Chahar Barg / چاربرگ (11)**.

## Tech Stack

- **Node.js + Express + Socket.IO** for the authoritative real-time game server.
- **React + Vite** for a fast, responsive browser UI.
- Game rules live in `server/src/gameEngine.js`, separate from transport and UI code.

This stack keeps local setup simple, works well across devices on the same Wi-Fi/LAN, and lets the server validate every move.

## Features

- 2-player LAN multiplayer with room codes.
- Server-side turn validation and illegal move prevention.
- Mandatory capture enforcement when an 11-combination exists.
- King, Queen, Jack, Sur, end-of-round capture, and scoring rules implemented.
- Match scoring across rounds until one player reaches 100 points.
- Responsive modern card table UI with capture highlights and Sur animation.
- Reconnect support using browser local storage.
- Restart, next-round, and rematch controls.

## Project Structure

```text
chahar-barg-11/
  client/
    src/
      App.jsx          # React UI and player interactions
      socket.js        # Socket.IO client setup
      styles.css       # Responsive visual design
  server/
    src/
      cards.js         # Deck and card helpers
      gameEngine.js    # Pure game rules and scoring
      index.js         # Express + Socket.IO room server
    test/
      gameEngine.test.js
  package.json         # Root helper scripts
```

## Setup

Requirements:

- Node.js 18 or newer
- npm

Install dependencies:

```bash
cd chahar-barg-11
npm install
npm run install:all
```

## Run Locally

Start both server and client:

```bash
npm run dev
```

Or run them separately:

```bash
npm run server
npm run client
```

Default URLs:

- Client: `http://localhost:5173`
- Server: `http://localhost:3001`

## Play Over LAN

1. Start the app on the host computer with `npm run dev`.
2. Find the host computer's LAN IP address:
   - Linux/macOS: `ip addr` or `ifconfig`
   - Windows: `ipconfig`
3. On both devices, open:

```text
http://HOST_LAN_IP:5173
```

Example:

```text
http://192.168.1.25:5173
```

4. Player 1 creates a room.
5. Player 2 enters the room code and joins.
6. Click **Start Match** once both players are seated.

If the client runs on a different machine than the server, set:

```bash
VITE_SERVER_URL=http://HOST_LAN_IP:3001 npm run client
```

## Rules Implemented

### Round Start

- Standard 52-card deck.
- Each player receives 4 cards.
- 4 cards are placed face-up on the table.
- Any Jack in the initial table cards is replaced.

### Capture Rules

- Ace is 1; cards 2–10 use face value.
- J, Q, and K cannot be used in 11 sums.
- If a played card can capture, the player must capture.
- Numeric cards capture one or more numeric table cards that make the total 11 with the played card.
- King captures only a King.
- Queen captures only a Queen.
- Jack captures all table cards except Kings and Queens.
- Jack cannot create Sur.

### Sur

- Clearing the whole table with a non-Jack move awards 5 points immediately.
- End-of-round leftover cards going to the last capturer never count as Sur.

### Scoring

Base scoring is 20 total points per round:

- Each Ace: 1 point
- Each Jack: 1 point
- 10 of Diamonds: 3 points
- 2 of Clubs: 2 points
- 7 or more Clubs: 7 points

Sur points are added on top of base round points. First player to 100 total points wins.

## Validation

Run server rule tests:

```bash
npm test --prefix server
```

Build the client:

```bash
npm run build --prefix client
```
