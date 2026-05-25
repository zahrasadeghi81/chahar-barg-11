import test from "node:test";
import assert from "node:assert/strict";
import { addBotPlayer, createRoom, getCaptureOptions, playBotMove, playMove, scoreCapturedCards } from "../src/gameEngine.js";

test("number cards capture table combinations that sum to 11", () => {
  const options = getCaptureOptions(card("5", "clubs"), [
    card("6", "hearts"),
    card("2", "spades"),
    card("4", "diamonds"),
    card("K", "clubs")
  ]);

  assert.deepEqual(optionIds(options), [["6-hearts"], ["2-spades", "4-diamonds"]]);
});

test("jack captures table cards except kings and queens", () => {
  const options = getCaptureOptions(card("J", "clubs"), [
    card("6", "hearts"),
    card("Q", "spades"),
    card("K", "diamonds"),
    card("A", "clubs")
  ]);

  assert.deepEqual(optionIds(options), [["6-hearts", "A-clubs"]]);
});

test("server rejects passing when a mandatory capture exists", () => {
  const room = playableRoom();
  room.hands[0] = [card("5", "clubs")];
  room.table = [card("6", "hearts")];

  assert.throws(() => playMove(room, 0, "5-clubs", []), /must capture/i);
});

test("jack table clear never awards sur", () => {
  const room = playableRoom();
  room.hands[0] = [card("J", "clubs")];
  room.table = [card("6", "hearts")];

  const result = playMove(room, 0, "J-clubs", ["6-hearts"]);
  assert.equal(result.surAwarded, false);
  assert.equal(room.surCounts[0], 0);
});

test("base score cards total to expected values", () => {
  assert.equal(
    scoreCapturedCards([
      card("A", "clubs"),
      card("J", "spades"),
      card("10", "diamonds"),
      card("2", "clubs"),
      card("3", "clubs"),
      card("4", "clubs"),
      card("5", "clubs"),
      card("6", "clubs"),
      card("7", "clubs")
    ]),
    14
  );
});

test("bot takes a mandatory capture", () => {
  const room = playableRoom();
  room.players[0] = addBotPlayer(createRoom("BOT"), "Computer");
  room.players[0].index = 0;
  room.hands[0] = [card("5", "clubs")];
  room.table = [card("6", "hearts")];

  playBotMove(room, 0);

  assert.equal(room.table.length, 0);
  assert.deepEqual(
    room.captured[0].map((capturedCard) => capturedCard.id),
    ["5-clubs", "6-hearts"]
  );
});

function playableRoom() {
  const room = createRoom("TEST");
  room.players = [
    { id: "a", name: "A", index: 0, connected: true },
    { id: "b", name: "B", index: 1, connected: true }
  ];
  room.status = "playing";
  room.turn = 0;
  room.hands = [[], []];
  room.captured = [[], []];
  room.roundScores = [0, 0];
  room.deck = [];
  return room;
}

function card(rank, suit) {
  return { id: `${rank}-${suit}`, rank, suit };
}

function optionIds(options) {
  return options.map((option) => option.map((cardItem) => cardItem.id));
}
