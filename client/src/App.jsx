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
  const [joinRoomCode, setJoinRoomCode] = useState(() => getStoredItem("chaharRoom") || "");
  const [savedRoomCode, setSavedRoomCode] = useState(() => getStoredItem("chaharRoom") || "");
  const [savedSeat, setSavedSeat] = useState(() => getStoredItem("chaharPlayer"));
  const [botName, setBotName] = useState(() => getStoredItem("chaharBotName") || "Computer");
  const [selectedHandCard, setSelectedHandCard] = useState(null);
  const [selectedTableCards, setSelectedTableCards] = useState([]);
  const [error, setError] = useState("");
  const [surFlash, setSurFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState(null);

  useEffect(() => {
    socket.connect();
    
    socket.on("state", (nextState) => {
      // منطق تشخیص حرکت حریف
      if (nextState.lastAction && nextState.lastAction.playerIndex !== nextState.you) {
        setLastAction(nextState.lastAction);
        
        // نمایش حرکت برای 2.5 ثانیه، سپس آپدیت وضعیت به حالت نهایی
        setTimeout(() => {
          setLastAction(null);
          setState(nextState);
        }, 2500);
      } else {
        setState(nextState);
      }
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
  const hasSavedSession = Boolean(savedRoomCode && savedSeat !== null);
  const canStart = name.trim().length > 0;
  
  const selectedOptions = useMemo(
    () => (selectedHandCard ? state?.captureOptions?.[selectedHandCard.id] ?? [] : []),
    [selectedHandCard, state]
  );
  
  const mustCapture = selectedOptions.length > 0;
  const selectedCaptureIsValid = selectedTableCards.length > 0 && selectedOptions.some((option) => sameCardSet(option, selectedTableCards));
  const canPlay = Boolean(selectedHandCard) && isMyTurn && (!mustCapture || selectedCaptureIsValid);

  // --- Actions ---
  async function createRoom() { if (!canStart) return; await joinAction("room:create", { name }); }
  async function joinRoom() { if (!canStart) return; await joinAction("room:join", { name, roomCode: joinRoomCode }); }
  async function createBotRoom() { if (!canStart) return; await joinAction("room:createBot", { name, botName }); setStoredItem("chaharBotName", botName); }

  async function resumeSession() {
    if (!hasSavedSession) return;
    setBusy(true);
    setError("");
    const response = await emitWithAck("room:reconnect", { roomCode: savedRoomCode, playerIndex: Number(savedSeat) });
    setBusy(false);
    if (!response.ok) { setError(response.error); return; }
    setSavedRoomCode(response.roomCode);
    setJoinRoomCode(response.roomCode);
    setSavedSeat(String(response.playerIndex));
    setStoredItem("chaharRoom", response.roomCode);
    setStoredItem("chaharPlayer", String(response.playerIndex));
  }

  async function deleteSavedSession() {
    setBusy(true);
    setError("");
    if (savedRoomCode) await emitWithAck("room:leave", { roomCode: savedRoomCode });
    setBusy(false);
    removeStoredItem("chaharRoom");
    removeStoredItem("chaharPlayer");
    setSavedSeat(null);
    setSavedRoomCode("");
    setJoinRoomCode("");
    setState(null);
  }

  async function joinAction(event, payload) {
    setBusy(true);
    setError("");
    const response = await emitWithAck(event, payload);
    setBusy(false);
    if (!response.ok) { setError(response.error); return; }
    setStoredItem("chaharName", name);
    setStoredItem("chaharRoom", response.roomCode);
    setStoredItem("chaharPlayer", response.playerIndex);
    setSavedSeat(String(response.playerIndex));
    setSavedRoomCode(response.roomCode);
    setJoinRoomCode(response.roomCode);
  }

  async function sendSimpleAction(event) {
    setBusy(true);
    const response = await emitWithAck(event, { roomCode: state.roomCode });
    setBusy(false);
    if (!response.ok) setError(response.error);
  }

  async function returnToMenu() {
    setBusy(true);
    if (state?.roomCode) await emitWithAck("room:leave", { roomCode: state.roomCode });
    setBusy(false);
    setState(null);
    setSelectedHandCard(null);
    setSelectedTableCards([]);
    setError("");
    removeStoredItem("chaharRoom");
    removeStoredItem("chaharPlayer");
    setSavedSeat(null);
    setSavedRoomCode("");
    setJoinRoomCode("");
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
    if (!response.ok) { setError(response.error); return; }
    setSelectedHandCard(null);
    setSelectedTableCards([]);
  }

  function selectHandCard(card) { if (!isMyTurn) return; setSelectedHandCard(card); setSelectedTableCards([]); }
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
          <div className="hero-copy">
            <p className="eyebrow">LAN Multiplayer</p>
            <h1>Chahar Barg (11)</h1>
            <p>Two-player Iranian capture card game with server-authoritative rules.</p>
            <div className="feature-list"><span>Real-time rooms</span><span>Mandatory captures</span><span>Sur scoring</span></div>
          </div>
          <div className="lobby-form">
            {hasSavedSession && (
              <div className="saved-session card-panel">
                <div><strong>Saved Session</strong><small>Room {savedRoomCode}</small></div>
                <div className="saved-actions">
                  <button className="primary-action" disabled={busy} onClick={resumeSession}>Resume</button>
                  <button className="ghost-button danger" disabled={busy} onClick={deleteSavedSession}>Delete</button>
                </div>
              </div>
            )}
            <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" /></label>
            <button className="primary-action" disabled={busy || !canStart} onClick={createRoom}>Create Room</button>
            <div className="divider"><span>or join a friend</span></div>
            <div className="join-row">
              <input value={joinRoomCode} onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())} placeholder="ROOM CODE" />
              <button disabled={busy || !canStart || !joinRoomCode.trim()} onClick={joinRoom}>Join</button>
            </div>
            <div className="divider"><span>or play against computer</span></div>
            <div className="join-row">
              <input value={botName} onChange={(e) => setBotName(e.target.value)} placeholder="Computer" />
              <button disabled={busy || !canStart} onClick={createBotRoom}>Play vs Computer</button>
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

      {/* اعلان حرکت حریف */}
      {lastAction && (
        <div className="move-narrator">
          <p className="eyebrow">حرکت حریف</p>
          <p>
            حریف کارت <strong>{lastAction.playedCard.rank}</strong> {SUIT_SYMBOLS[lastAction.playedCard.suit]} را بازی کرد.
          </p>
        </div>
      )}

      <header className="topbar">
        <div><p className="eyebrow">Room {state.roomCode}</p><h1>Chahar Barg (11)</h1></div>
        <div className="topbar-actions">
          <ScorePanel state={state} />
          <button className="ghost-button" disabled={busy} onClick={returnToMenu}>Return to Menu</button>
        </div>
      </header>

      <section className="status-strip card-panel">
        <div><strong>{state.message}</strong><small>{turnHint(state, isMyTurn, mustCapture, selectedHandCard)}</small></div>
        <span>{state.status === "playing" ? `${state.players[state.turn]?.name}'s turn` : statusLabel(state.status)}</span>
        <span>Deck: {state.deckCount}</span>
      </section>

      {error && <p className="error floating">{error}</p>}

      <section className="board">
        <PlayerArea player={opponent} active={state.turn === opponentIndex} hidden />

        <div className="table-zone card-panel">
          <div className="zone-title"><span>Table</span>{mustCapture && <em>Capture is mandatory</em>}</div>
          <div className="cards table-cards">
            {state.table.length === 0 && <p className="empty">Table is clear.</p>}
            {state.table.map((card) => {
              // هایلایت کردن کارت‌هایی که حریف برمی‌دارد
              const isBeingCaptured = lastAction?.capturedCardIds?.includes(card.id);
              return (
                <PlayingCard
                  key={card.id}
                  card={card}
                  className={isBeingCaptured ? "capturing-now" : ""}
                  selected={selectedTableCards.some((selected) => selected.id === card.id)}
                  highlighted={isCardInAnyOption(card, selectedOptions)}
                  onClick={() => toggleTableCard(card)}
                />
              );
            })}
          </div>
        </div>

        <PlayerArea player={me} active={isMyTurn} />

        <div className="hand-row">
          <div className="hand-header"><strong>Your hand</strong><span>{isMyTurn ? "Choose a card to play." : "Waiting for opponent."}</span></div>
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
        <button className="ghost-button" disabled={busy} onClick={returnToMenu}>Return to Menu</button>
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
  if (!player) return <div className="player-area card-panel">Waiting for player…</div>;
  return (
    <div className={`player-area card-panel ${active ? "active" : ""}`}>
      <div><strong>{player.name}</strong><span className={player.connected ? "online" : "offline"}>{player.bot ? "Bot" : player.connected ? "Online" : "Offline"}</span></div>
      <span>{hidden ? `${player.cardCount} cards in hand` : `${player.capturedCount} captured cards`}</span>
    </div>
  );
}

function PlayingCard({ card, selected, highlighted, onClick, className = "" }) {
  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <button
      className={`playing-card ${isRed ? "red" : "black"} ${selected ? "selected" : ""} ${highlighted ? "highlighted" : ""} ${className}`}
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
function turnHint(state, isMyTurn, mustCapture, selectedHandCard) {
  if (state.status === "waiting") return "Share this room code with another player.";
  if (state.status === "roundComplete") return "Review scores, then start the next round.";
  if (state.status === "finished") return "Match complete. Start a rematch or return to the menu.";
  if (!isMyTurn) return "Watch the table while the other player moves.";
  if (!selectedHandCard) return "Select a highlighted card when a capture is available.";
  if (mustCapture) return "Select the highlighted table card or card set to capture.";
  return "Play this card or pick a different one.";
}

function getStoredItem(key) { try { return window.localStorage.getItem(key); } catch { return null; } }
function setStoredItem(key, value) { try { window.localStorage.setItem(key, value); } catch { } }
function removeStoredItem(key) { try { window.localStorage.removeItem(key); } catch { } }
