(function (root, factory) {
    const rules = factory();
    if (typeof module === 'object' && module.exports) module.exports = rules;
    else root.AceRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const MAX_PLAYERS = 8;
    const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
    const SYMBOLS = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
    const rankLabel = rank => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[rank] || String(rank));
    const cardLabel = card => `${({ 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' }[card.rank] || card.rank)} of ${card.suit}`;
    const cardKey = card => `${card.suit}_${card.rank}`;

    function remember(round, playerId, card) {
        round.knownCards = round.knownCards || {};
        round.knownCards[playerId] = round.knownCards[playerId] || {};
        round.knownCards[playerId][cardKey(card)] = true;
    }

    function canSee(round, viewerId, holderId) {
        const card = round?.hands[holderId];
        return Boolean(card && (viewerId === holderId || round.phase === 'finished' ||
            round.revealedKings?.[holderId] || round.publicCards?.[cardKey(card)] ||
            round.knownCards?.[viewerId]?.[cardKey(card)]));
    }

    function shuffledDeck(random = Math.random) {
        const deck = SUITS.flatMap(suit => Array.from({ length: 13 }, (_, i) => ({ rank: i + 1, suit })));
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    function validDeck(deck) {
        return Array.isArray(deck) && deck.length === 52 &&
            deck.every(c => Number.isInteger(c.rank) && c.rank >= 1 && c.rank <= 13 && SUITS.includes(c.suit)) &&
            new Set(deck.map(c => `${c.rank}-${c.suit}`)).size === 52;
    }

    function finish(round, everyone = false) {
        round.phase = 'finished';
        round.everyoneLoses = everyone;
        const low = Math.min(...round.order.map(id => round.hands[id].rank));
        const tied = round.order.filter(id => round.hands[id].rank === low);
        round.dealerLosesTie = !everyone && tied.length > 1 && tied.includes(round.dealerId);
        round.losers = everyone ? [...round.order] : round.dealerLosesTie ? [round.dealerId] : tied;
        round.lowRank = low;
        delete round.pending;
    }

    function advance(round) {
        if (round.turn === round.order.length - 1) finish(round);
        else {
            round.turn++;
            round.phase = 'playing';
        }
    }

    // Pure transitions keep Firebase transaction retries and duplicate taps safe.
    // Returning undefined aborts the transaction; null would delete the room.
    function reduce(current, action) {
        if (!action || !action.type) return;
        if (!current && action.type !== 'join') return;
        if (current && ![1, 2].includes(current.version)) return;
        if (action.type !== 'join' && action.revision !== current.revision) return;
        const room = current ? JSON.parse(JSON.stringify(current)) : {
            version: 2, revision: 0, players: [], roundNumber: 0
        };
        // Older clients must refresh before they can apply the previous house rules.
        room.version = 2;
        room.players = room.players || [];
        const player = room.players.find(p => p.id === action.actor);
        if (action.type !== 'join' && !player) return;

        if (action.type === 'join') {
            const name = String(action.name || '').trim().slice(0, 24);
            if (!name || !/^[a-zA-Z0-9_-]{1,80}$/.test(action.actor || '')) return;
            const existing = room.players.find(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase());
            if (existing) return room;
            if (room.players.length >= MAX_PLAYERS || player) return;
            room.players.push({ id: action.actor, name });
            if (!room.nextDealerId) room.nextDealerId = action.actor;
        } else if (action.type === 'remove') {
            if (room.round && room.round.phase !== 'finished') return;
            const index = room.players.findIndex(p => p.id === action.target);
            if (index < 0) return;
            if (room.nextDealerId === action.target) {
                room.nextDealerId = room.players[(index + 1) % room.players.length].id;
            }
            room.players.splice(index, 1);
            // Keep finished cards and their names until the next deal.
            if (!room.players.length) {
                delete room.nextDealerId;
                delete room.round;
            }
        } else if (action.type === 'reset') {
            delete room.round;
        } else if (action.type === 'deal') {
            if (room.players.length < 2 || (room.round && room.round.phase !== 'finished') || !validDeck(action.deck)) return;
            let dealerIndex = room.players.findIndex(p => p.id === room.nextDealerId);
            if (dealerIndex < 0) dealerIndex = 0;
            const seats = room.players.map(p => p.id);
            const order = seats.slice(dealerIndex + 1).concat(seats.slice(0, dealerIndex + 1));
            const deck = action.deck.map(c => ({ ...c }));
            const hands = {};
            order.forEach(id => { hands[id] = deck.shift(); });
            room.roundNumber++;
            room.round = {
                number: room.roundNumber, phase: 'playing', seats, order, hands, deck,
                names: Object.fromEntries(room.players.map(p => [p.id, p.name])),
                dealerId: seats[dealerIndex], turn: 0,
                event: { kind: 'deal', actor: action.actor }, revealedKings: {}, actions: {}, knownCards: {}
            };
            order.forEach(id => remember(room.round, id, hands[id]));
            room.nextDealerId = seats[(dealerIndex + 1) % seats.length];
        } else {
            const round = room.round;
            if (!round || round.phase === 'finished') return;
            // Also initializes knowledge for a round started before this update.
            round.order.forEach(id => remember(round, id, round.hands[id]));
            round.actions = round.actions || {};
            const activeId = round.order[round.turn];
            if (action.type === 'revealKing') {
                if (round.phase !== 'challenge' || round.pending.to !== action.actor || round.hands[action.actor].rank !== 13) return;
                round.revealedKings = round.revealedKings || {};
                round.revealedKings[action.actor] = true;
                round.publicCards = round.publicCards || {};
                round.publicCards[cardKey(round.hands[action.actor])] = true;
                round.actions[round.pending.from] = 'blocked';
                round.event = { kind: 'king', actor: action.actor, blocked: round.pending.from };
                delete round.pending;
                advance(round);
            } else {
                if (round.phase !== 'playing' || activeId !== action.actor) return;
                if (action.type === 'hold') {
                    round.actions[action.actor] = 'held';
                    round.event = { kind: 'hold', actor: action.actor };
                    advance(round);
                } else if (action.type === 'swap') {
                    if (round.turn === round.order.length - 1) return;
                    const nextId = round.order[round.turn + 1];
                    if (round.hands[nextId].rank === 13) {
                        round.phase = 'challenge';
                        round.pending = { from: activeId, to: nextId };
                        round.event = { kind: 'challenge', actor: activeId, target: nextId };
                    } else {
                        const fromCard = { ...round.hands[activeId] };
                        const toCard = { ...round.hands[nextId] };
                        for (const id of [activeId, nextId]) {
                            remember(round, id, fromCard);
                            remember(round, id, toCard);
                        }
                        [round.hands[activeId], round.hands[nextId]] = [round.hands[nextId], round.hands[activeId]];
                        // The seat marker moves away, but everyone still knows a revealed king.
                        round.revealedKings = round.revealedKings || {};
                        delete round.revealedKings[activeId];
                        delete round.revealedKings[nextId];
                        round.actions[activeId] = 'swapped';
                        round.event = { kind: 'swap', actor: activeId, target: nextId, fromCard, toCard };
                        advance(round);
                    }
                } else if (action.type === 'cut') {
                    if (round.turn !== round.order.length - 1 || !Number.isInteger(action.cutIndex) ||
                        action.cutIndex < 0 || action.cutIndex >= round.deck.length) return;
                    const card = round.deck.splice(action.cutIndex, 1)[0];
                    round.hands[activeId] = card;
                    remember(round, activeId, card);
                    round.actions[activeId] = 'cut';
                    round.cutCard = card;
                    round.event = { kind: 'cut', actor: activeId };
                    finish(round, card.rank === 13);
                } else return;
            }
        }
        room.revision++;
        return room;
    }

    return { MAX_PLAYERS, SUITS, SYMBOLS, rankLabel, cardLabel, cardKey, canSee, shuffledDeck, reduce };
});
