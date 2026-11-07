'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../assets/js/ace-rules.js');

function table(ranks = [2, 7, 9], cutRank = 5) {
    let room;
    for (const [id, name] of [['a', 'Marc'], ['b', 'Mum'], ['c', 'Dad']]) {
        room = R.reduce(room, { type: 'join', actor: id, name });
    }
    const deck = R.shuffledDeck();
    const cards = [];
    for (const rank of [...ranks, cutRank]) cards.push(deck.splice(deck.findIndex(c => c.rank === rank), 1)[0]);
    return R.reduce(room, { type: 'deal', actor: 'a', revision: room.revision, deck: cards.concat(deck) });
}
function act(room, type, actor, extra = {}) {
    return R.reduce(room, { type, actor, revision: room.revision, ...extra });
}

test('deal contains one unique card per player, dealer is last, and shuffling keeps all 52 cards', () => {
    const room = table();
    assert.deepEqual(room.round.order, ['b', 'c', 'a']);
    assert.equal(room.round.dealerId, 'a');
    assert.equal(room.round.deck.length, 49);
    assert.equal(new Set([...Object.values(room.round.hands), ...room.round.deck].map(c => `${c.rank}-${c.suit}`)).size, 52);
    assert.equal(room.nextDealerId, 'b');
});

test('swap is compulsory for non-kings and only the active player can act', () => {
    const room = table([1, 8, 9]);
    assert.equal(act(room, 'swap', 'c'), undefined);
    const next = act(room, 'swap', 'b');
    assert.equal(next.round.hands.b.rank, 8);
    assert.equal(next.round.hands.c.rank, 1);
    assert.equal(next.round.turn, 1);
    assert.equal(room.round.hands.b.rank, 1, 'transition does not mutate its input');
    assert.equal(R.reduce(next, { type: 'hold', actor: 'c', revision: room.revision }), undefined);
});

test('a king stays hidden until its holder taps; a blocked swap consumes the challenger’s turn', () => {
    let room = table([1, 13, 8]);
    room = act(room, 'swap', 'b');
    assert.equal(room.round.phase, 'challenge');
    assert.equal(room.round.turn, 0);
    assert.equal(room.round.revealedKings.c, undefined);
    assert.equal(act(room, 'hold', 'b'), undefined);
    assert.equal(act(room, 'revealKing', 'b'), undefined);
    room = act(room, 'revealKing', 'c');
    assert.equal(room.round.phase, 'playing');
    assert.equal(room.round.revealedKings.c, true);
    assert.equal(room.round.hands.b.rank, 1);
    assert.equal(room.round.hands.c.rank, 13);
    assert.equal(room.round.turn, 1);
    assert.equal(act(room, 'revealKing', 'c'), undefined);
});

test('lowest rank loses; tied non-dealers lose and aces are low', () => {
    let room = table([1, 1, 7]);
    for (const id of room.round.order) room = act(room, 'hold', id);
    assert.equal(room.round.phase, 'finished');
    assert.deepEqual(room.round.losers, ['b', 'c']);
    assert.equal(room.round.lowRank, 1);
    assert.equal(room.round.everyoneLoses, false);
    assert.equal(act(room, 'hold', 'a'), undefined);
});

test('dealer alone loses a tie for lowest, including a whole-table tie', () => {
    for (const ranks of [[1, 8, 1], [6, 6, 6], [13, 13, 13]]) {
        let room = table(ranks);
        for (const id of room.round.order) room = act(room, 'hold', id);
        assert.deepEqual(room.round.losers, ['a']);
        assert.equal(room.round.dealerLosesTie, true);
        assert.equal(room.round.everyoneLoses, false);
    }
});

test('a tie above the lowest card does not make the dealer lose', () => {
    let room = table([2, 8, 8]);
    for (const id of room.round.order) room = act(room, 'hold', id);
    assert.deepEqual(room.round.losers, ['b']);
    assert.equal(room.round.dealerLosesTie, false);
});

test('dealer also loses a low tie after cutting a non-king', () => {
    let room = table([3, 7, 12], 3);
    room = act(act(room, 'hold', 'b'), 'hold', 'c');
    room = act(room, 'cut', 'a', { cutIndex: 0 });
    assert.deepEqual(room.round.losers, ['a']);
    assert.equal(room.round.dealerLosesTie, true);
});

test('a king cut overrides dealer ties and makes other kings lose too', () => {
    let room = table([13, 13, 5], 13);
    room = act(act(room, 'hold', 'b'), 'hold', 'c');
    room = act(room, 'cut', 'a', { cutIndex: 0 });
    assert.equal(room.round.everyoneLoses, true);
    assert.equal(room.round.dealerLosesTie, false);
    assert.deepEqual(room.round.losers, ['b', 'c', 'a']);
});

test('both sides of a swap know the exchanged cards, but observers do not', () => {
    let room = table([1, 8, 9]);
    assert.equal(R.canSee(room.round, 'b', 'c'), false);
    assert.equal(R.canSee(room.round, 'c', 'b'), false);
    room = act(room, 'swap', 'b');
    for (const viewer of ['b', 'c']) for (const holder of ['b', 'c']) assert.equal(R.canSee(room.round, viewer, holder), true);
    assert.equal(R.canSee(room.round, 'a', 'b'), false);
    assert.equal(R.canSee(room.round, 'a', 'c'), false);
    assert.equal(room.round.event.fromCard.rank, 1);
    assert.equal(room.round.event.toCard.rank, 8);
});

test('card knowledge follows subsequent passes and survives serialized reconnects', () => {
    let room = table([1, 8, 9]);
    room = act(room, 'swap', 'b');
    room = act(room, 'swap', 'c');
    room = JSON.parse(JSON.stringify(room));
    assert.equal(room.round.hands.a.rank, 1);
    assert.equal(R.canSee(room.round, 'b', 'a'), true, 'first player still recognizes their ace at the third seat');
    assert.equal(R.canSee(room.round, 'b', 'c'), false, 'first player has never held the nine');
    assert.equal(R.canSee(room.round, 'a', 'c'), true, 'dealer can see their former nine');
    assert.equal(R.canSee(room.round, 'c', 'b'), true, 'middle player still knows their original eight');
    assert.equal(R.canSee(room.round, 'newcomer', 'b'), false);
});

test('knowledge distinguishes suits and resets for each new deal', () => {
    let room = table([1, 1, 7]);
    assert.equal(R.canSee(room.round, 'b', 'c'), false, 'another ace is not the same card');
    room = act(room, 'swap', 'b');
    room = act(act(room, 'hold', 'c'), 'hold', 'a');
    room = act(room, 'deal', 'a', { deck: R.shuffledDeck() });
    for (const viewer of room.round.order) for (const holder of room.round.order) {
        assert.equal(R.canSee(room.round, viewer, holder), viewer === holder);
    }
    assert.deepEqual(room.round.actions, {});
});

test('action labels describe the player’s turn, not forced exchanges afterward', () => {
    let room = table([1, 8, 9]);
    room = act(room, 'swap', 'b');
    assert.equal(room.round.actions.b, 'swapped');
    assert.equal(room.round.actions.c, undefined);
    room = act(room, 'hold', 'c');
    assert.equal(room.round.actions.c, 'held');
    room = act(room, 'cut', 'a', { cutIndex: 0 });
    assert.deepEqual(room.round.actions, { b: 'swapped', c: 'held', a: 'cut' });
});

test('a blocked swap is labeled, and a publicly revealed king stays known when passed', () => {
    let room = table([1, 13, 9]);
    room = act(room, 'swap', 'b');
    assert.equal(room.round.actions.b, undefined, 'challenger has not finished yet');
    room = act(room, 'revealKing', 'c');
    assert.equal(room.round.actions.b, 'blocked');
    room = act(room, 'swap', 'c');
    assert.equal(R.canSee(room.round, 'b', 'a'), true);
    assert.equal(R.canSee(room.round, 'newcomer', 'a'), true);
    assert.equal(room.round.actions.c, 'swapped');
});

test('existing rooms upgrade without discarding players or the active hand', () => {
    let room = table([1, 8, 9]);
    room.version = 1;
    delete room.round.knownCards;
    delete room.round.actions;
    room = act(room, 'swap', 'b');
    assert.equal(room.version, 2);
    assert.equal(room.players.length, 3);
    assert.equal(room.round.turn, 1);
    assert.equal(R.canSee(room.round, 'c', 'b'), true);
});

test('only the dealer can cut, and even a worse card replaces their hand', () => {
    let room = table([5, 7, 12], 1);
    assert.equal(act(room, 'cut', 'b', { cutIndex: 0 }), undefined);
    room = act(act(room, 'hold', 'b'), 'hold', 'c');
    assert.equal(act(room, 'swap', 'a'), undefined);
    assert.equal(act(room, 'cut', 'a', { cutIndex: -1 }), undefined);
    room = act(room, 'cut', 'a', { cutIndex: 0 });
    assert.equal(room.round.hands.a.rank, 1);
    assert.deepEqual(room.round.losers, ['a']);
    assert.equal(room.round.deck.length, 48);
});

test('cut preserves the dealer’s previous card while only the new card determines the result', () => {
    let room = table([5, 7, 1], 10);
    room = act(act(room, 'hold', 'b'), 'hold', 'c');
    const before = { ...room.round.hands.a };
    room = act(room, 'cut', 'a', { cutIndex: 0 });
    assert.deepEqual(room.round.beforeCutCard, before);
    assert.equal(room.round.hands.a.rank, 10);
    assert.deepEqual(room.round.losers, ['b'], 'discarded ace does not make the dealer lose');
    room = JSON.parse(JSON.stringify(room));
    assert.deepEqual(room.round.beforeCutCard, before, 'history survives a refresh');
    room = act(room, 'deal', 'a', { deck: R.shuffledDeck() });
    assert.equal(room.round.beforeCutCard, undefined, 'new round clears the previous cut');
});

test('cut history records the card held after swaps, including on a king cut', () => {
    let room = table([2, 8, 11], 13);
    room = act(act(room, 'swap', 'b'), 'swap', 'c');
    const before = { ...room.round.hands.a };
    assert.equal(before.rank, 2);
    room = act(room, 'cut', 'a', { cutIndex: 0 });
    assert.deepEqual(room.round.beforeCutCard, before);
    assert.equal(room.round.cutCard.rank, 13);
    assert.equal(room.round.everyoneLoses, true);
    assert.deepEqual(room.round.losers, ['b', 'c', 'a']);
});

test('holding leaves no discarded card', () => {
    let room = table();
    for (const id of room.round.order) room = act(room, 'hold', id);
    assert.equal(room.round.beforeCutCard, undefined);
    assert.equal(room.round.cutCard, undefined);
});

test('cutting a king makes every player lose', () => {
    let room = table([2, 5, 8], 13);
    room = act(act(room, 'hold', 'b'), 'hold', 'c');
    room = act(room, 'cut', 'a', { cutIndex: 0 });
    assert.equal(room.round.everyoneLoses, true);
    assert.deepEqual(room.round.losers, ['b', 'c', 'a']);
});

test('dealer rotates, late arrivals wait for the next round, and names restore existing seats', () => {
    let room = table();
    room = R.reduce(room, { type: 'join', actor: 'd', name: 'Friend' });
    assert.equal(room.players.length, 4);
    assert.equal(room.round.order.length, 3);
    room = R.reduce(room, { type: 'join', actor: 'new-device', name: 'MARC' });
    assert.equal(room.players.length, 4);
    assert.equal(act(room, 'deal', 'a', { deck: R.shuffledDeck() }), undefined);
    assert.equal(act(room, 'remove', 'a', { target: 'c' }), undefined);
    for (const id of room.round.order) room = act(room, 'hold', id);
    room = act(room, 'deal', 'a', { deck: R.shuffledDeck() });
    assert.equal(room.round.dealerId, 'b');
    assert.deepEqual(room.round.order, ['c', 'd', 'a', 'b']);
});

test('removing the upcoming dealer keeps rotation valid and reset recovers a stuck round', () => {
    let room = table();
    room = act(room, 'reset', 'a');
    room = act(room, 'remove', 'a', { target: 'b' });
    assert.equal(room.nextDealerId, 'c');
    room = act(room, 'deal', 'a', { deck: R.shuffledDeck() });
    assert.equal(room.round.dealerId, 'c');
    assert.equal(room.round.order.length, 2);
});

test('Firebase omission of empty objects does not break king reveal or a swap', () => {
    let room = table([1, 13, 9]);
    delete room.round.revealedKings;
    room = act(act(room, 'swap', 'b'), 'revealKing', 'c');
    assert.equal(room.round.revealedKings.c, true);
    room = act(room, 'swap', 'c');
    assert.equal(room.round.hands.a.rank, 13);
    assert.equal(room.round.revealedKings.c, undefined);
});

test('full tables, single-player deals and invalid decks are rejected', () => {
    let room = R.reduce(null, { type: 'join', actor: 'p0', name: 'Player 0' });
    assert.equal(act(room, 'deal', 'p0', { deck: R.shuffledDeck() }), undefined);
    for (let i = 1; i < 8; i++) room = R.reduce(room, { type: 'join', actor: `p${i}`, name: `Player ${i}` });
    assert.equal(R.reduce(room, { type: 'join', actor: 'p8', name: 'Player 8' }), undefined);
    assert.equal(act(room, 'deal', 'p0', { deck: Array(52).fill({ rank: 1, suit: 'hearts' }) }), undefined);
});

function practice(ranks = [3, 9], dealer = 'human') {
    let room = R.reduce(null, { type: 'join', actor: 'human', name: 'Marc', roomCode: 'marctest' });
    room.nextDealerId = dealer;
    const deck = R.shuffledDeck();
    const first = ranks.map(rank => deck.splice(deck.findIndex(c => c.rank === rank), 1)[0]);
    return act(room, 'deal', 'human', { deck: first.concat(deck) });
}

test('only marctest automatically adds one bot, including rejoining an existing room', () => {
    for (const code of ['marctest', 'MARCTEST', ' MarcTest ']) {
        let room = R.reduce(null, { type: 'join', actor: 'human', name: 'Marc', roomCode: code });
        assert.equal(room.players.length, 2);
        assert.equal(room.players[1].id, R.PRACTICE_BOT_ID);
        room = R.reduce(room, { type: 'join', actor: 'new-device', name: 'Marc', roomCode: code });
        room = R.reduce(room, { type: 'join', actor: 'friend', name: 'Dad', roomCode: code });
        assert.equal(room.players.filter(p => p.isAI).length, 1);
        assert.equal(room.players.length, 3);
    }
    let normal = R.reduce(null, { type: 'join', actor: 'human', name: 'Marc', roomCode: 'FAMILY' });
    assert.equal(normal.players.length, 1);
    assert.equal(normal.practice, undefined);
    normal = R.reduce(normal, { type: 'join', actor: 'new-device', name: 'Marc', roomCode: 'MARCTEST' });
    assert.equal(normal.players.filter(p => p.isAI).length, 1);
    assert.equal(R.isPracticeRoom('MARCTEST-2'), false);
});

test('the practice bot has a distinct name and cannot be claimed as a human seat', () => {
    const room = R.reduce(null, { type: 'join', actor: 'human', name: 'Ace Bot', roomCode: 'MARCTEST' });
    assert.equal(room.players[1].name, 'Ace Bot 2');
    assert.equal(R.reduce(room, { type: 'join', actor: 'other', name: 'Ace Bot 2', roomCode: 'MARCTEST' }), undefined);
    assert.equal(act(room, 'remove', 'human', { target: R.PRACTICE_BOT_ID }), undefined);
});

test('bot joining an active practice room waits for the next deal', () => {
    let room = table();
    room = R.reduce(room, { type: 'join', actor: 'a', name: 'Marc', roomCode: 'marctest' });
    assert.equal(room.players.length, 4);
    assert.equal(room.round.order.length, 3);
    assert.equal(R.chooseAIAction(room), undefined);
    for (const id of room.round.order) room = act(room, 'hold', id);
    room = act(room, 'deal', 'a', { deck: R.shuffledDeck() });
    assert.ok(room.round.order.includes(R.PRACTICE_BOT_ID));
});

test('AI trades low cards and holds stronger cards without looking at hidden hands or the deck', () => {
    for (const [rank, expected] of [[1, 'swap'], [6, 'swap'], [7, 'hold'], [12, 'hold'], [13, 'hold']]) {
        const room = practice([rank, 8]);
        assert.equal(R.chooseAIAction(room).type, expected);
        room.round.hands.human.rank = 13;
        room.round.deck.reverse();
        assert.equal(R.chooseAIAction(room).type, expected);
    }
});

test('AI uses known next cards and holds when safely above a finished player', () => {
    for (const [nextRank, expected] of [[3, 'hold'], [9, 'swap'], [13, 'hold']]) {
        let room = table([1, 4, nextRank]);
        room.practice = true;
        room.players.find(p => p.id === 'c').isAI = true;
        room = act(room, 'hold', 'b');
        room.round.knownCards.c[R.cardKey(room.round.hands.a)] = true;
        assert.equal(R.chooseAIAction(room).type, expected);
        room.round.knownCards.c[R.cardKey(room.round.hands.b)] = true;
        assert.equal(R.chooseAIAction(room).type, 'hold', 'the settled ace makes four safe');
    }
});

test('AI dealer cuts a weak card or a known losing tie, but holds a known safe card', () => {
    const bot = R.PRACTICE_BOT_ID;
    for (const [humanRank, botRank, known, expected] of [
        [9, 4, false, 'cut'], [2, 9, false, 'hold'], [9, 8, true, 'cut'],
        [8, 8, true, 'cut'], [3, 4, true, 'hold']
    ]) {
        let room = practice([humanRank, botRank], bot);
        room = act(room, 'hold', 'human');
        if (known) room.round.knownCards[bot][R.cardKey(room.round.hands.human)] = true;
        assert.equal(R.chooseAIAction(room).type, expected);
    }
});

test('AI reveals its king, waits for human king reveals, and never acts for a human', () => {
    const bot = R.PRACTICE_BOT_ID;
    let room = practice([1, 13], bot);
    assert.equal(R.chooseAIAction(room), undefined);
    room = act(room, 'swap', 'human');
    assert.deepEqual(R.chooseAIAction(room), { type: 'revealKing', actor: bot });
    room = act(room, 'revealKing', bot);
    assert.deepEqual(R.chooseAIAction(room), { type: 'hold', actor: bot });
    room = act(room, 'hold', bot);
    assert.equal(R.chooseAIAction(room), undefined);
    room = practice([1, 13]);
    room = act(room, 'swap', bot);
    assert.equal(R.chooseAIAction(room), undefined, 'human must reveal their own king');
});

test('competing phones cannot commit the same AI move twice', () => {
    const room = practice([2, 9]);
    const command = { ...R.chooseAIAction(room), revision: room.revision };
    const next = R.reduce(room, command);
    assert.equal(next.round.turn, 1);
    assert.equal(next.round.actions[R.PRACTICE_BOT_ID], 'swapped');
    assert.equal(R.reduce(next, command), undefined);
});
