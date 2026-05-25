import React, { useEffect, useMemo, useState } from "react";
import { emitWithAck, socket } from "./socket.js";

const SUIT_SYMBOLS = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠"
};

const SUIT_NAMES = {
  clubs: "Clubs",
  diamonds: "Diamonds",
  hearts: "Hearts",
  spades: "Spades"
};

export default function App() {
  const [state, setState] = useState(null);
  const [name, setName] = useState(() => getStoredItem("chaharName") || "");
  const [roomCode, setRoomCode] = useState(() => getStoredItem("chaharRoom") || "");
  const [selectedHandCard, setSelectedHandCard] = useState(null);
  const [selectedTableCards, setSelectedTableCards] = useState([]);
  const [error, setError] = useState("");
  const [surFlash, setSurFlash] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    socket.connect();
    socket.on("state", (nextState) => {
      setState(nextState);
      setError("");
    });
    socket.on("sur", () => {
      setSurFlash(true);
      window.setTimeout(() => setSurFlash(false), 1400);
    });

    const savedRoom = getStoredItem("chaharRoom");
    const savedPlayer = getStoredItem("chaharPlayer");
    if (savedRoom && savedPlayer !== null) {
      const reconnect = () => {
        emitWithAck("room:reconnect", { roomCode: savedRoom, playerIndex: Number(savedPlayer) });
      };
      socket.on("connect", reconnect);
      if (socket.connected) reconnect();
    }

    return () => {
      socket.off("state");
      socket.off("sur");
      socket.disconnect();
    };
  }, []);

  const myHand = state?.you !== null && state?.you !== undefined ? state.hands[state.you] : [];
  const isMyTurn = state?.status === "playing" && state?.you === state?.turn;
  const selectedOptions = useMemo(
    () => (selectedHandCard ? state?.captureOptions?.[selectedHandCard.id] ?? [] : []),
    [selectedHandCard, state]
  );
  const mustCapture = selectedOptions.length > 0;
  const selectedCaptureIsValid = selectedTableCards.length > 0 && selectedOptions.some((option) => sameCardSet(option, selectedTableCards));
  const canPlay = Boolean(selectedHandCard) && isMyTurn && (!mustCapture || selectedCaptureIsValid);

  async function createRoom() {
    await joinAction("room:create", { name });
  }

  async function practiceGame() {
    await joinAction("room:practice", { name });
  }

  async function joinRoom() {
    await joinAction("room:join", { name, roomCode });
  }

  async function joinAction(event, payload) {
    setBusy(true);
    setError("");
    const response = await emitWithAck(event, payload);
    setBusy(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setStoredItem("chaharName", name);
    setStoredItem("chaharRoom", response.roomCode);
    setStoredItem("chaharPlayer", response.playerIndex);
    setRoomCode(response.roomCode);
  }

  async function sendSimpleAction(event) {
    setBusy(true);
    const response = await emitWithAck(event, { roomCode: state.roomCode });
    setBusy(false);
    if (!response.ok) setError(response.error);
  }

  async function playSelectedCard() {
    if (!canPlay) return;
    setBusy(true);
    const response = await emitWithAck("game:move", {
      roomCode: state.roomCode,
      cardId: selectedHandCard.id,
      tableCardIds: selectedTableCards.map((card) => card.id)
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setSelectedHandCard(null);
    setSelectedTableCards([]);
  }

  function selectHandCard(card) {
    if (!isMyTurn) return;
    setSelectedHandCard(card);
    setSelectedTableCards([]);
  }

  function toggleTableCard(card) {
    if (!selectedHandCard || !isMyTurn) return;
    setSelectedTableCards((cards) =>
      cards.some((selected) => selected.id === card.id)
        ? cards.filter((selected) => selected.id !== card.id)
        : [...cards, card]
    );
  }

  if (!state) {
    return (
      <main className="app shell">
        <section className="hero card-panel">
          <div>
            <p className="eyebrow">LAN Multiplayer</p>
            <h1>Chahar Barg (11)</h1>
            <p>Two-player Iranian capture card game with server-authoritative rules.</p>
          </div>
          <div className="lobby-form">
            <label>
              Your name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Player name" />
            </label>
            <button disabled={busy} onClick={practiceGame}>Play vs Computer</button>
            <button disabled={busy} onClick={createRoom}>Create Room</button>
            <div className="join-row">
              <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ROOM CODE" />
              <button disabled={busy} onClick={joinRoom}>Join</button>
            </div>
            {error && <p className="error">{error}</p>}
          </div>
        </section>
      </main>
    );
  }

  const opponentIndex = state.you === 0 ? 1 : 0;
  const opponent = state.players[opponentIndex];
  const me = state.players[state.you];

  return (
    <main className="app">
      {surFlash && <div className="sur-flash">SUR +5</div>}
      <header className="topbar">
        <div>
          <p className="eyebrow">Room {state.roomCode}</p>
          <h1>Chahar Barg (11)</h1>
        </div>
        <ScorePanel state={state} />
      </header>

      <section className="status-strip card-panel">
        <strong>{state.message}</strong>
        <span>{state.status === "playing" ? `${state.players[state.turn]?.name}'s turn` : statusLabel(state.status)}</span>
        <span>Deck: {state.deckCount}</span>
      </section>

      {error && <p className="error floating">{error}</p>}

      <section className="board">
        <PlayerArea player={opponent} active={state.turn === opponentIndex} hidden />

        <div className="table-zone card-panel">
          <div className="zone-title">
            <span>Table</span>
            {mustCapture && <em>Capture is mandatory</em>}
          </div>
          <div className="cards table-cards">
            {state.table.length === 0 && <p className="empty">Table is clear.</p>}
            {state.table.map((card) => (
              <PlayingCard
                key={card.id}
                card={card}
                selected={selectedTableCards.some((selected) => selected.id === card.id)}
                highlighted={isCardInAnyOption(card, selectedOptions)}
                onClick={() => toggleTableCard(card)}
              />
            ))}
          </div>
        </div>

        <PlayerArea player={me} active={isMyTurn} />

        <div className="hand-row">
          <div className="cards hand-cards">
            {myHand.map((card) => (
              <PlayingCard
                key={card.id}
                card={card}
                selected={selectedHandCard?.id === card.id}
                highlighted={isMyTurn && (state.captureOptions?.[card.id]?.length ?? 0) > 0}
                onClick={() => selectHandCard(card)}
              />
            ))}
          </div>
          <button className="play-button" disabled={!canPlay || busy} onClick={playSelectedCard}>
            {mustCapture ? "Capture" : "Play Card"}
          </button>
        </div>
      </section>

      <footer className="actions">
        {state.status === "waiting" && state.players.length === 2 && (
          <button disabled={busy} onClick={() => sendSimpleAction("game:start")}>Start Match</button>
        )}
        {state.status === "roundComplete" && (
          <button disabled={busy} onClick={() => sendSimpleAction("game:nextRound")}>Start Next Round</button>
        )}
        {state.status === "finished" && (
          <button disabled={busy} onClick={() => sendSimpleAction("game:rematch")}>Rematch</button>
        )}
      </footer>
    </main>
  );
}

function ScorePanel({ state }) {
  return (
    <div className="score-panel">
      {state.players.map((player) => (
        <div key={player.index} className={`score-card ${state.winner === player.index ? "winner" : ""}`}>
          <span>{player.name}</span>
          <strong>{state.totalScores[player.index]}</strong>
          <small>Round {state.roundScores[player.index]} · Sur {state.surCounts[player.index]}</small>
        </div>
      ))}
      <div className="target">First to {state.targetScore}</div>
    </div>
  );
}

function PlayerArea({ player, active, hidden = false }) {
  if (!player) {
    return <div className="player-area card-panel">Waiting for player…</div>;
  }

  return (
    <div className={`player-area card-panel ${active ? "active" : ""}`}>
      <div>
        <strong>{player.name}</strong>
        <span className={player.connected ? "online" : "offline"}>{player.bot ? "Bot" : player.connected ? "Online" : "Offline"}</span>
      </div>
      <span>{hidden ? `${player.cardCount} cards in hand` : `${player.capturedCount} captured cards`}</span>
    </div>
  );
}

function PlayingCard({ card, selected, highlighted, onClick }) {
  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <button
      className={`playing-card ${isRed ? "red" : "black"} ${selected ? "selected" : ""} ${highlighted ? "highlighted" : ""}`}
      onClick={onClick}
    >
      <span>{card.rank}</span>
      <strong>{SUIT_SYMBOLS[card.suit]}</strong>
      <small>{SUIT_NAMES[card.suit]}</small>
    </button>
  );
}

function sameCardSet(option, selectedCards) {
  return option.map((card) => card.id).sort().join("|") === selectedCards.map((card) => card.id).sort().join("|");
}

function isCardInAnyOption(card, options) {
  return options.some((option) => option.some((optionCard) => optionCard.id === card.id));
}

function statusLabel(status) {
  if (status === "waiting") return "Waiting for players";
  if (status === "roundComplete") return "Round complete";
  if (status === "finished") return "Match finished";
  return status;
}

function getStoredItem(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredItem(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Browsers can block storage in some privacy modes; gameplay should still work.
  }
}
