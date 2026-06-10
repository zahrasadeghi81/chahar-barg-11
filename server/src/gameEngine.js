import { cardNumberValue, createDeck, shuffle } from "./cards.js";

const TARGET_SCORE = 100;
const HAND_SIZE = 4;
const INITIAL_TABLE_SIZE = 4;
const TABLE_REPLACEMENT_LIMIT = 200;

export function createRoom(roomCode) {
  return {
    roomCode,
    players: [],
    status: "waiting",
    totalScores: [0, 0],
    roundScores: [0, 0],
    surCounts: [0, 0],
    captured: [[], []],
    hands: [[], []],
    table: [],
    deck: [],
    turn: 0,
    dealer: 1,
    lastCapturer: null,
    winner: null,
    roundNumber: 0,
    message: "Waiting for two players."
  };
}

export function addPlayer(room, socketId, name) {
  if (room.players.length >= 2) {
    throw new Error("Room is full.");
  }

  const player = {
    id: socketId,
    name: cleanName(name) || `Player ${room.players.length + 1}`,
    index: room.players.length,
    connected: true
  };

  room.players.push(player);
  room.message = room.players.length === 2 ? "Ready to start." : "Waiting for another player.";
  return player;
}

export function addBotPlayer(room, name = "Computer") {
  if (room.players.length >= 2) {
    throw new Error("Room is full.");
  }

  const player = {
    id: `bot:${room.roomCode}:${room.players.length}`,
    name: cleanName(name) || "Computer",
    index: room.players.length,
    connected: true,
    bot: true
  };

  room.players.push(player);
  room.message = room.players.length === 2 ? "Ready to start." : "Waiting for another player.";
  return player;
}

export function reconnectPlayer(room, socketId, playerIndex) {
  const player = room.players[playerIndex];
  if (!player) throw new Error("Player not found.");
  player.id = socketId;
  player.connected = true;
  return player;
}

export function removePlayer(room, socketId) {
  const player = room.players.find((candidate) => candidate.id === socketId);
  if (player && !player.bot) {
    player.connected = false;
    room.message = `${player.name} disconnected. Waiting for reconnection.`;
  }
}

export function startGame(room) {
  if (room.players.length !== 2) throw new Error("Two players are required.");
  room.totalScores = [0, 0];
  room.dealer = 1;
  room.winner = null;
  startRound(room);
}

export function startRound(room) {
  room.roundNumber += 1;
  room.status = "playing";
  room.roundScores = [0, 0];
  room.surCounts = [0, 0];
  room.captured = [[], []];
  room.hands = [[], []];
  room.table = [];
  room.deck = shuffle(createDeck());
  room.dealer = 1 - room.dealer;
  room.turn = 1 - room.dealer;
  room.lastCapturer = null;
  room.message = `${room.players[room.turn]?.name ?? "Player"} starts round ${room.roundNumber}.`;

  dealCards(room);
  dealInitialTable(room);
}

export function playMove(room, playerIndex, cardId, tableCardIds = []) {
  ensurePlayingTurn(room, playerIndex);

  const hand = room.hands[playerIndex];
  const cardIndex = hand.findIndex((card) => card.id === cardId);
  if (cardIndex < 0) throw new Error("Selected card is not in your hand.");

  const playedCard = hand[cardIndex];
  const chosenCards = tableCardIds.map((id) => {
    const card = room.table.find((tableCard) => tableCard.id === id);
    if (!card) throw new Error("Selected capture card is not on the table.");
    return card;
  });

  const validCaptures = getCaptureOptions(playedCard, room.table);
  const hasMandatoryCapture = validCaptures.length > 0;

  if (hasMandatoryCapture && chosenCards.length === 0) {
    throw new Error("You must capture when a valid capture exists.");
  }

  if (chosenCards.length > 0 && !isChosenCaptureValid(validCaptures, chosenCards)) {
    throw new Error("That capture combination is illegal.");
  }

  hand.splice(cardIndex, 1);
  let surAwarded = false;

  if (chosenCards.length > 0) {
    const capturedCards = [playedCard, ...chosenCards];
    room.captured[playerIndex].push(...capturedCards);
    room.table = room.table.filter((tableCard) => !tableCardIds.includes(tableCard.id));
    room.lastCapturer = playerIndex;

    if (room.table.length === 0 && playedCard.rank !== "J") {
      room.roundScores[playerIndex] += 5;
      room.surCounts[playerIndex] += 1;
      surAwarded = true;
    }
  } else {
    room.table.push(playedCard);
  }

  advanceAfterMove(room, playerIndex, surAwarded);
  // در انتهای تابع playMove (قبل از return)
    room.lastAction = {
      playerIndex,
      playedCard: playedCard,
      capturedCardIds: chosenCards.map(c => c.id) // کارت‌هایی که از زمین جمع شدند
    };

  return { surAwarded };
}

export function playBotMove(room, playerIndex) {
  ensurePlayingTurn(room, playerIndex);

  const player = room.players[playerIndex];
  if (!player?.bot) throw new Error("That player is not a bot.");

  const hand = room.hands[playerIndex];
  const captureMove = hand
    .map((card) => ({ card, options: getCaptureOptions(card, room.table) }))
    .filter((move) => move.options.length > 0)
    .sort((first, second) => bestCaptureScore(second) - bestCaptureScore(first))[0];

  if (captureMove) {
    const tableCardIds = [...captureMove.options].sort(captureScoreDescending)[0].map((card) => card.id);
    return playMove(room, playerIndex, captureMove.card.id, tableCardIds);
  }

  const card = [...hand].sort(cardPlayPriorityAscending)[0];
  return playMove(room, playerIndex, card.id, []);
}

export function getCaptureOptions(playedCard, table) {
  if (playedCard.rank === "J") {
    const jackCaptures = table.filter((card) => card.rank !== "K" && card.rank !== "Q");
    return jackCaptures.length > 0 ? [jackCaptures] : [];
  }

  if (playedCard.rank === "K") {
    return table.filter((card) => card.rank === "K").map((card) => [card]);
  }

  if (playedCard.rank === "Q") {
    return table.filter((card) => card.rank === "Q").map((card) => [card]);
  }

  const value = cardNumberValue(playedCard);
  if (value === null) return [];

  const numericTableCards = table.filter((card) => cardNumberValue(card) !== null);
  return findCardCombinations(numericTableCards, 11 - value);
}

export function scoreCapturedCards(cards) {
  let score = 0;
  let clubCount = 0;

  for (const card of cards) {
    if (card.suit === "clubs") clubCount += 1;
    if (card.rank === "A") score += 1;
    if (card.rank === "J") score += 1;
    if (card.rank === "10" && card.suit === "diamonds") score += 3;
    if (card.rank === "2" && card.suit === "clubs") score += 2;
  }

  if (clubCount >= 7) score += 7;
  return score;
}

export function publicState(room, socketId = null) {
  const viewer = room.players.find((player) => player.id === socketId);
  const viewerIndex = viewer?.index;
  const captureOptions = viewerIndex === room.turn && room.status === "playing"
    ? Object.fromEntries(room.hands[viewerIndex].map((card) => [card.id, getCaptureOptions(card, room.table)]))
    : {};

  return {
    roomCode: room.roomCode,
    status: room.status,
    lastAction: room.lastAction,
    players: room.players.map((player) => ({
      name: player.name,
      index: player.index,
      connected: player.connected,
      bot: Boolean(player.bot),
      cardCount: room.hands[player.index]?.length ?? 0,
      capturedCount: room.captured[player.index]?.length ?? 0
    })),
    you: viewerIndex ?? null,
    message: room.message,
    totalScores: room.totalScores,
    roundScores: room.roundScores,
    surCounts: room.surCounts,
    hands: room.hands.map((hand, index) => (index === viewerIndex ? hand : hand.map(() => null))),
    table: room.table,
    deckCount: room.deck.length,
    turn: room.turn,
    dealer: room.dealer,
    lastCapturer: room.lastCapturer,
    winner: room.winner,
    roundNumber: room.roundNumber,
    captureOptions,
    message: room.message,
    targetScore: TARGET_SCORE
  };
}

function advanceAfterMove(room, playerIndex, surAwarded) {
  if (room.hands[0].length === 0 && room.hands[1].length === 0) {
    if (room.deck.length > 0) {
      dealCards(room);
      room.message = surAwarded ? "Sur! New cards dealt." : "New cards dealt.";
    } else {
      finishRound(room);
      return;
    }
  } else {
    room.message = surAwarded ? "Sur! Table cleared for 5 points." : "Move accepted.";
  }

  room.turn = 1 - playerIndex;
}

function finishRound(room) {
  if (room.table.length > 0 && room.lastCapturer !== null) {
    room.captured[room.lastCapturer].push(...room.table);
    room.table = [];
  }

  for (let index = 0; index < 2; index += 1) {
    room.roundScores[index] += scoreCapturedCards(room.captured[index]);
    room.totalScores[index] += room.roundScores[index];
  }

  const winningIndex = room.totalScores.findIndex((score) => score >= TARGET_SCORE);
  if (winningIndex >= 0) {
    room.status = "finished";
    room.winner = winningIndex;
    room.message = `${room.players[winningIndex].name} wins the match!`;
  } else {
    room.status = "roundComplete";
    room.message = "Round complete. Start the next round when ready.";
  }
}

function dealCards(room) {
  for (let cardNumber = 0; cardNumber < HAND_SIZE; cardNumber += 1) {
    for (let playerIndex = 0; playerIndex < 2; playerIndex += 1) {
      room.hands[playerIndex].push(room.deck.pop());
    }
  }
}

function dealInitialTable(room) {
  let attempts = 0;
  while (room.table.length < INITIAL_TABLE_SIZE) {
    attempts += 1;
    if (attempts > TABLE_REPLACEMENT_LIMIT) {
      throw new Error("Could not create an initial table without Jacks.");
    }

    const card = room.deck.pop();
    if (card.rank === "J") {
      room.deck.unshift(card);
      room.deck = shuffle(room.deck);
    } else {
      room.table.push(card);
    }
  }
}

function findCardCombinations(cards, target) {
  const results = [];

  function search(startIndex, combination, sum) {
    if (sum === target && combination.length > 0) {
      results.push([...combination]);
      return;
    }

    if (sum >= target) return;

    for (let index = startIndex; index < cards.length; index += 1) {
      const card = cards[index];
      search(index + 1, [...combination, card], sum + cardNumberValue(card));
    }
  }

  if (target > 0) search(0, [], 0);
  return results;
}

function isChosenCaptureValid(validCaptures, chosenCards) {
  const chosenIds = chosenCards.map((card) => card.id).sort().join("|");
  return validCaptures.some((capture) => capture.map((card) => card.id).sort().join("|") === chosenIds);
}

function ensurePlayingTurn(room, playerIndex) {
  if (room.status !== "playing") throw new Error("The round is not active.");
  if (room.turn !== playerIndex) throw new Error("It is not your turn.");
}

function bestCaptureScore(move) {
  return Math.max(...move.options.map(captureScore));
}

function captureScoreDescending(first, second) {
  return captureScore(second) - captureScore(first);
}

function captureScore(cards) {
  return cards.length + scoreCapturedCards(cards) * 10;
}

function cardPlayPriorityAscending(first, second) {
  return cardDiscardRisk(first) - cardDiscardRisk(second);
}

function cardDiscardRisk(card) {
  if (card.rank === "J") return 50;
  if (card.rank === "A") return 40;
  if (card.rank === "10" && card.suit === "diamonds") return 35;
  if (card.rank === "2" && card.suit === "clubs") return 35;
  if (card.rank === "K" || card.rank === "Q") return 20;
  return cardNumberValue(card) ?? 10;
}

function cleanName(name) {
  return String(name ?? "").trim().slice(0, 24);
}
