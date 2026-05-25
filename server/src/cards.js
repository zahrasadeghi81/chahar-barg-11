export const SUITS = ["clubs", "diamonds", "hearts", "spades"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function createDeck() {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({
      id: `${rank}-${suit}`,
      rank,
      suit
    }))
  );
}

export function shuffle(cards) {
  const deck = [...cards];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

export function cardNumberValue(card) {
  if (card.rank === "A") return 1;
  const value = Number(card.rank);
  return Number.isInteger(value) ? value : null;
}

export function isPointCard(card) {
  return (
    card.rank === "A" ||
    card.rank === "J" ||
    (card.rank === "10" && card.suit === "diamonds") ||
    (card.rank === "2" && card.suit === "clubs")
  );
}

export function cardLabel(card) {
  return `${card.rank} of ${card.suit}`;
}
