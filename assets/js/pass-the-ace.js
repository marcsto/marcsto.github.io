(() => {
    'use strict';
    const R = window.AceRules;
    const $ = id => document.getElementById(id);
    const STORAGE = 'pass_the_ace';
    const ROOM_PATH = 'passTheAceRooms/';
    let soundEnabled = readSaved().sound !== false;
    const sounds = window.AceSounds?.create({ enabled: soundEnabled });
    let soundTimer, soundEpoch = 0, quietNextSnapshot = true;
    let db, roomRef, room, myId, roomCode, connected = false, busy = false;
    let lastEvent = '', firstSnapshot = true, toastTimer, flourishTimer, animationTimer;
    let processing = false, presentationEpoch = 0;
    let aiTimer, aiTimerKey = '';
    let autoDealTimer, autoDealKey = '', autoDealDeadline = 0, autoDealPending = '';
    let autoDealRetryAt = 0, serverTimeOffset = 0;
    let joiningAI = false;
    let supplyFrame, supplyTimer;
    const snapshots = [];
    const flightAnimations = new Set();
    const seatNodes = new Map();

    function readSaved() {
        try { return JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; }
        catch { return {}; }
    }
    function cancelSounds() {
        clearTimeout(soundTimer);
        sounds?.stop();
    }
    function silenceSounds() {
        soundEpoch++;
        cancelSounds();
    }
    function renderSoundSetting() {
        $('sound-button').textContent = soundEnabled ? 'On' : 'Off';
        $('sound-button').setAttribute('aria-pressed', String(soundEnabled));
    }
    function playRoundSound(round) {
        cancelSounds();
        if (!round) return;
        sounds?.play(round.kingCut ? 'crown' : round.event.kind);
        if (round.phase !== 'finished' || !round.order.includes(myId)) return;
        if (round.kingCut && !round.losers.includes(myId)) return;
        const epoch = soundEpoch;
        // Let the final card/tap land before the personal result cue.
        soundTimer = setTimeout(() => {
            if (epoch !== soundEpoch || room?.round?.number !== round.number || room.round.phase !== 'finished') return;
            const result = round.losers.includes(myId) ? 'loss' : 'win';
            sounds?.play(result);
        }, round.kingCut ? 2150 : round.event.kind === 'cut' ? 500 : 340);
    }
    function saveVisit(code, name, aiCount = 0) {
        try {
            const saved = readSaved();
            const recent = Array.isArray(saved.recent) ? saved.recent : [];
            localStorage.setItem(STORAGE, JSON.stringify({ ...saved, name, room: code,
                aiCount: aiCount || saved.aiCount || 1,
                recent: [{ code, name, aiCount }, ...recent.filter(r => r.code !== code)].slice(0, 4) }));
        } catch { /* Rooms still work when browser storage is unavailable. */ }
    }
    function showError(id, message = '') {
        $(id).textContent = message;
        $(id).hidden = !message;
    }
    function toast(message) {
        clearTimeout(toastTimer);
        $('toast').textContent = message;
        $('toast').hidden = false;
        toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
    }
    function playerName(id) {
        return room?.round?.names?.[id] || room?.players?.find(p => p.id === id)?.name || 'A player';
    }
    function joinNames(names) {
        if (names.length < 2) return names[0] || '';
        return names.slice(0, -1).join(', ') + ' & ' + names.at(-1);
    }
    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function transaction(ref, action) {
        return new Promise((resolve, reject) => {
            ref.transaction(data => R.reduce(data, { ...action, finishedAt: firebase.database.ServerValue.TIMESTAMP }), (error, committed, snapshot) => {
                if (error) reject(error);
                else resolve({ committed, data: snapshot?.val() });
            }, false);
        });
    }
    function setBusy(value) {
        busy = value;
        $('join-button').disabled = busy || !db || !connected;
        $('join-button').textContent = busy && !roomRef && !joiningAI ? 'Finding your seat…' : 'Join game ↗';
        $('ai-button').disabled = busy || !db || !connected;
        $('ai-button').textContent = busy && joiningAI ? 'Creating your table…' : 'Play with AI';
        $('ai-count').disabled = busy;
        if (roomRef && room) renderControls();
        if ($('table-dialog').open) renderManagement();
        $('leave-button').disabled = busy;
        $('table-leave-button').disabled = busy;
        scheduleAI();
    }

    function practiceCode() {
        const bytes = new Uint8Array(6);
        if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
        else bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
        return 'AI-' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    async function joinGame(event, createAI = false) {
        event?.preventDefault();
        if (busy) return;
        showError('join-error');
        let code = $('room-name').value.trim().toUpperCase().replace(/\s+/g, '-');
        const name = $('player-name').value.trim();
        if (!name) {
            showError('join-error', 'Add your name to take a seat.');
            $('player-name').focus();
            return;
        }
        if (!createAI && !/^[A-Z0-9-]{1,24}$/.test(code)) {
            showError('join-error', 'Add your name and a room name using letters, numbers or hyphens.');
            return;
        }
        if (!db || !connected) {
            showError('join-error', 'Waiting for a connection. Please check your internet and try again.');
            return;
        }
        joiningAI = createAI;
        setBusy(true);
        try {
            const id = 'p_' + (window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`);
            let ref, result;
            if (createAI) {
                const botCount = Number($('ai-count').value);
                // Claim a fresh generated room atomically, retrying a name collision.
                for (let attempt = 0; attempt < 3; attempt++) {
                    code = practiceCode();
                    ref = db.ref(ROOM_PATH + code);
                    result = await transaction(ref, { type: 'join', actor: id, name, roomCode: code, createPractice: true, botCount });
                    if (result.committed) break;
                }
                if (!result.committed) throw new Error('Couldn’t create a new AI table. Please try again.');
            } else {
                ref = db.ref(ROOM_PATH + code);
                const existing = (await ref.once('value')).val();
                if (existing && ![1, 2, 3].includes(existing.version)) throw new Error('This table needs a newer version. Please refresh the page.');
                const players = existing?.players || [];
                if (players.some(p => p.isAI && p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
                    throw new Error('That’s an AI opponent’s name. Please enter your own name.');
                }
                if (players.length >= R.MAX_PLAYERS && !players.some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
                    throw new Error('This table has all 8 seats filled. Try another room name.');
                }
                result = await transaction(ref, { type: 'join', actor: id, name, roomCode: code });
            }
            if (!result.committed) throw new Error('The table changed while you were joining. Please try again.');
            const me = result.data.players.find(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase());
            myId = me.id;
            roomCode = code;
            roomRef = ref;
            firstSnapshot = true;
            lastEvent = '';
            saveVisit(code, me.name, result.data.players.filter(p => p.isAI).length);
            $('room-name').value = code;
            const url = new URL(location.href);
            url.searchParams.set('room', code);
            history.replaceState(null, '', url);
            $('lobby-view').hidden = true;
            $('game-view').hidden = false;
            document.body.classList.add('at-table');
            $('room-label').textContent = code;
            $('room-label').title = code;
            window.scrollTo({ top: 0, behavior: 'instant' });
            ref.on('value', onRoom, error => showError('game-error', `Couldn’t sync the table: ${error.message}`));
        } catch (error) {
            showError('join-error', error.message || 'Couldn’t join. Please try again.');
        } finally { joiningAI = false; setBusy(false); }
    }

    function onRoom(snapshot) {
        cancelAI();
        const data = snapshot.val();
        if (!data || !(data.players || []).some(p => p.id === myId)) {
            leaveView();
            toast('Your seat was removed. You can join the table again.');
            return;
        }
        snapshots.push({ data, audible: connected && !document.hidden && !quietNextSnapshot,
            soundEpoch, receivedAt: performance.now() });
        quietNextSnapshot = false;
        if (!processing) void presentSnapshots();
    }

    async function presentSnapshots() {
        const epoch = presentationEpoch;
        processing = true;
        try {
            // Let each exchange arrive before showing the next one, even if people play quickly.
            while (snapshots.length && epoch === presentationEpoch) {
                const snapshot = snapshots.shift();
                room = snapshot.data;
                render();
                const round = room.round;
                const key = round ? `${round.number}:${JSON.stringify(round.event)}` : '';
                if (!firstSnapshot && key !== lastEvent) {
                    if (snapshot.audible && snapshot.soundEpoch === soundEpoch && performance.now() - snapshot.receivedAt < 2500) playRoundSound(round);
                    await animateEvent(round);
                }
                if (epoch !== presentationEpoch) return;
                lastEvent = key;
                firstSnapshot = false;
                if ($('table-dialog').open) renderManagement();
            }
        } finally {
            if (epoch === presentationEpoch) {
                processing = false;
                renderControls();
                scheduleAI();
            }
        }
    }

    async function send(type, extra = {}) {
        if (busy || processing || !roomRef || !room) return false;
        if (!connected) {
            showError('game-error', 'You’re offline. Your seat is saved; reconnect to keep playing.');
            return false;
        }
        const ref = roomRef;
        const command = { type, actor: myId, revision: room.revision, ...extra };
        showError('game-error');
        setBusy(true);
        try {
            const result = await transaction(ref, command);
            if (!result.committed) {
                if (type !== 'deal') toast('The table just changed. Take another look and try again.');
                return false;
            }
            return true;
        } catch (error) {
            showError('game-error', `That didn’t go through. Please try again. ${error.message || ''}`);
            return false;
        } finally { setBusy(false); }
    }

    function cancelAI() {
        clearTimeout(aiTimer);
        aiTimer = undefined;
        aiTimerKey = '';
    }

    function cancelAutoDeal() {
        clearInterval(autoDealTimer);
        autoDealTimer = undefined;
        autoDealKey = '';
        autoDealPending = '';
    }

    function syncAutoDeal() {
        const round = room?.round;
        if (!roomRef || round?.phase !== 'finished' || room.players.length < 2) {
            cancelAutoDeal();
            return;
        }
        const key = `${roomCode}:${round.number}`;
        if (autoDealKey !== key) {
            cancelAutoDeal();
            autoDealKey = key;
            // A saved round from an older version gets a fresh three-second countdown.
            autoDealDeadline = (Number.isFinite(round.finishedAt) ? round.finishedAt : Date.now() + serverTimeOffset) + 3000;
            autoDealRetryAt = 0;
            autoDealTimer = setInterval(tickAutoDeal, 100);
        }
        tickAutoDeal();
    }

    function tickAutoDeal() {
        if (!roomRef || room?.round?.phase !== 'finished' || room.players.length < 2) {
            cancelAutoDeal();
            return;
        }
        const remaining = Math.max(0, Math.min(3, Math.ceil((autoDealDeadline - Date.now() - serverTimeOffset) / 1000)));
        const button = $('deal-actions').querySelector('button');
        if (button) {
            const badge = button.querySelector('.deal-countdown');
            const count = String(remaining || '…');
            const label = remaining ? `Deal again. Automatically deals in ${remaining} seconds.` : 'Deal again. Dealing now.';
            if (badge && badge.textContent !== count) badge.textContent = count;
            if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
        }
        if (remaining || !connected || busy || processing || autoDealPending || Date.now() < autoDealRetryAt) return;
        const ref = roomRef, key = autoDealKey, revision = room.revision;
        const pending = `${key}:${revision}`;
        autoDealPending = pending;
        autoDealRetryAt = Date.now() + 1000;
        // Every phone can take over. The transaction revision lets only one deal win,
        // including a manual tap arriving at the same time as another phone's timer.
        void transaction(ref, { type: 'deal', actor: myId, revision, deck: R.shuffledDeck() })
            .then(result => { if (result.committed && roomRef === ref) showError('game-error'); })
            .catch(error => {
                if (roomRef === ref && autoDealKey === key && connected) showError('game-error', `Couldn’t deal yet. We’ll retry. ${error.message || ''}`);
            })
            .finally(() => { if (autoDealPending === pending) autoDealPending = ''; });
    }

    function scheduleAI() {
        const decision = !busy && !processing && connected && roomRef && room?.practice
            ? R.chooseAIAction(room) : undefined;
        if (!decision) { cancelAI(); return; }
        const revision = room.revision;
        const key = `${roomCode}:${revision}:${decision.actor}:${decision.type}`;
        if (aiTimerKey === key) return;
        cancelAI();
        aiTimerKey = key;
        const ref = roomRef;
        // Leave time to watch exchanges and the king reveal before the bot moves again.
        const delay = room.round.event.kind === 'king' ? 2800 : 1700;
        aiTimer = setTimeout(async () => {
            if (aiTimerKey !== key || roomRef !== ref || room?.revision !== revision || !connected || processing || busy) return;
            const action = { ...decision, revision };
            if (decision.type === 'cut') action.cutIndex = Math.floor(Math.random() * room.round.deck.length);
            try {
                // Every connected phone can drive the bot. The revision check lets only
                // one commit, so another phone can take over without a host or a server.
                await transaction(ref, action);
            } catch (error) {
                if (roomRef === ref && connected) showError('game-error', `Ace Bot couldn’t move. Refresh to try again. ${error.message || ''}`);
            } finally {
                if (aiTimerKey === key) { aiTimerKey = ''; aiTimer = undefined; }
            }
        }, delay);
    }

    function leaveView() {
        silenceSounds();
        cancelAI();
        cancelAutoDeal();
        cancelAnimationFrame(supplyFrame);
        clearTimeout(supplyTimer);
        $('dealer-supply').hidden = true;
        presentationEpoch++;
        snapshots.length = 0;
        processing = false;
        for (const animation of flightAnimations) animation.cancel();
        flightAnimations.clear();
        $('card-flights').replaceChildren();
        roomRef?.off('value', onRoom);
        roomRef = null;
        room = null;
        seatNodes.clear();
        $('seats').replaceChildren();
        clearTimeout(flourishTimer);
        $('table-flourish').hidden = true;
        $('game-view').hidden = true;
        document.body.classList.remove('at-table');
        $('lobby-view').hidden = false;
        for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
        const url = new URL(location.href);
        url.searchParams.delete('room');
        history.replaceState(null, '', url);
        renderRecent();
        setBusy(false);
    }

    function renderCard(node, card, visible) {
        const key = visible && card ? `${card.rank}-${card.suit}` : 'back';
        if (node.dataset.card === key) return;
        node.dataset.card = key;
        node.setAttribute('role', 'img');
        node.setAttribute('aria-label', visible && card ? R.cardLabel(card) : 'Face-down card');
        let inner = node.querySelector('.card-inner');
        if (!inner) {
            inner = element('div', 'card-inner');
            const front = element('div', 'card-face');
            const back = element('div', 'card-back');
            const diamond = element('span');
            diamond.append(element('b', '', '♠'));
            back.append(diamond);
            inner.append(front, back);
            node.append(inner);
        }
        const front = inner.querySelector('.card-face');
        front.replaceChildren();
        front.classList.toggle('red', Boolean(card && ['hearts', 'diamonds'].includes(card.suit) && visible));
        if (visible && card) {
            for (const position of ['', ' bottom']) {
                const corner = element('span', 'card-corner' + position, R.rankLabel(card.rank));
                corner.append(element('small', '', R.SYMBOLS[card.suit]));
                front.append(corner);
            }
            const royal = card.rank >= 11;
            front.append(element('span', 'card-pip' + (royal ? ' royal' : ''),
                royal ? ({ 11: '♝', 12: '♛', 13: '♚' }[card.rank]) : R.SYMBOLS[card.suit]));
        }
        // A newly built card needs its initial back transform before it can flip.
        if (visible && card) requestAnimationFrame(() => {
            if (node.dataset.card === key) node.classList.add('face-up');
        });
        else node.classList.remove('face-up');
    }

    function renderWinner(node, winner, label, icon = '🏆') {
        node.classList.toggle('is-winner', winner);
        node.setAttribute('aria-label', label + (winner ? '. Winner!' : ''));
        let badge = node.querySelector('.winner-badge');
        if (winner && !badge) {
            badge = element('span', 'winner-badge');
            badge.setAttribute('aria-hidden', 'true');
            badge.append(element('span', 'winner-trophy'), document.createTextNode('Winner'));
            node.append(badge);
        } else if (!winner && badge) badge.remove();
        if (winner) badge.querySelector('.winner-trophy').textContent = icon;
    }

    function renderSeats() {
        const r = room.round;
        const ids = r ? r.seats : room.players.map(p => p.id);
        let offset = ids.indexOf(myId);
        if (offset < 0) offset = 0;
        const ordered = ids.slice(offset).concat(ids.slice(0, offset));
        const count = Math.max(ordered.length, 3);
        const dense = ordered.length > 4;
        $('table-stage').classList.toggle('dense', dense);
        $('table-stage').classList.toggle('medium-table', ordered.length === 4 || ordered.length === 5);
        $('table-stage').classList.toggle('top-seat', ordered.length > 1 && ordered.length !== 3);
        const wanted = new Set(ordered);
        if (!r && ordered.length < 3) for (let i = ordered.length; i < 3; i++) wanted.add(`empty_${i}`);
        for (const [id, node] of seatNodes) if (!wanted.has(id)) { node.remove(); seatNodes.delete(id); }
        const allIds = [...ordered, ...[...wanted].filter(id => id.startsWith('empty_'))];
        allIds.forEach((id, index) => {
            const empty = id.startsWith('empty_');
            let node = seatNodes.get(id);
            if (!node) {
                node = element('div', 'seat');
                node.dataset.player = id;
                if (empty) node.append(element('div', 'empty-card', '+'));
                else node.append(element('div', 'playing-card'));
                node.append(element('div', 'seat-action'), element('div', 'seat-name'), element('div', 'seat-status'));
                seatNodes.set(id, node);
                $('seats').append(node);
            }
            const angle = (90 + index * 360 / (r ? ordered.length : count)) * Math.PI / 180;
            const radiusX = r && ordered.length === 2 ? 0 : (dense ? 37 : 35);
            const radiusY = dense ? 37 : 35;
            node.style.left = `${50 + Math.cos(angle) * radiusX}%`;
            node.style.top = `${50 + Math.sin(angle) * radiusY}%`;
            node.style.setProperty('--seat-index', index);
            node.classList.toggle('is-empty', empty);
            if (empty) {
                node.querySelector('.seat-name').textContent = 'Open seat';
                node.querySelector('.seat-status').textContent = 'Invite a friend';
                return;
            }
            const mine = id === myId;
            const active = r && r.phase !== 'finished' && (r.phase === 'challenge' ? r.pending.to : r.order[r.turn]) === id;
            const loser = r?.phase === 'finished' && r.losers.includes(id);
            const cut = r?.phase === 'finished' && r.cutCard && r.dealerId === id;
            const previous = cut && r.beforeCutCard;
            node.classList.toggle('is-active', Boolean(active));
            node.classList.toggle('is-loser', Boolean(loser));
            node.classList.toggle('has-cut', Boolean(cut));
            node.classList.toggle('is-you', mine);
            const label = node.querySelector('.seat-name');
            const name = r?.names[id] || room.players.find(p => p.id === id)?.name || 'Player';
            const isAI = room.players.some(p => p.id === id && p.isAI);
            label.replaceChildren(document.createTextNode(name));
            if (mine) label.append(element('span', 'you-marker', ' · you'));
            if (isAI) label.append(element('span', 'you-marker', ' · AI'));
            label.title = name + (mine ? ' (you)' : isAI ? ' (AI practice opponent)' : '');
            const dealer = (r?.dealerId || room.nextDealerId) === id;
            let marker = node.querySelector('.dealer-marker');
            if (dealer && !marker) {
                marker = element('span', 'dealer-marker', 'D');
                marker.title = 'Dealer · plays last';
                marker.setAttribute('aria-label', 'Dealer');
                node.append(marker);
            } else if (!dealer && marker) marker.remove();
            let status = !r ? 'Ready to play' : '';
            if (r?.phase === 'finished') status = loser ? (r.kingCut ? 'King cut!' : r.dealerLosesTie ? 'Dealer loses tie' : 'Low card') : '';
            else if (r) {
                if (active) status = r.phase === 'challenge' ? 'Swap requested' : (mine ? 'Your turn' : 'Thinking…');
                else if (r.revealedKings?.[id]) status = 'King revealed';
                else if (r.order.indexOf(id) < r.turn) status = '';
                else if (dealer) status = 'Dealer · plays last';
            }
            node.querySelector('.seat-status').textContent = cut ? (previous ? 'Discarded' : 'Card on deck') : status;
            const action = r?.actions?.[id];
            const actionLabel = node.querySelector('.seat-action');
            const reserveCutLabel = dealer && r && r.phase !== 'finished' && !action;
            actionLabel.textContent = ({ held: 'Held', swapped: 'Swapped', blocked: 'Blocked', cut: previous ? 'Before cut' : 'Cut' })[action] || (reserveCutLabel ? 'Before cut' : '');
            actionLabel.title = cut ? 'This card was replaced by the new card on the deck' : '';
            actionLabel.hidden = !action && !reserveCutLabel;
            actionLabel.classList.toggle('layout-reserve', Boolean(reserveCutLabel));
            if (reserveCutLabel) actionLabel.setAttribute('aria-hidden', 'true');
            else actionLabel.removeAttribute('aria-hidden');
            const card = node.querySelector('.playing-card');
            const shown = cut ? previous : r?.hands[id];
            const visible = cut ? Boolean(previous) : R.canSee(r, myId, id);
            renderCard(card, shown, visible);
            renderWinner(card, Boolean(r?.phase === 'finished' && !loser && !cut),
                previous ? `Before cut: ${R.cardLabel(previous)}. Discarded; does not count for this round.` :
                    visible && shown ? R.cardLabel(shown) : 'Face-down card');
        });
    }

    function renderDealerSupply() {
        const r = room.round;
        const supply = $('dealer-supply');
        const dealerId = r?.dealerId || room.nextDealerId;
        supply.hidden = !seatNodes.has(dealerId);
        supply.dataset.dealer = dealerId || '';
        supply.setAttribute('aria-label', `${playerName(dealerId)}’s deck`);
        const cut = r?.phase === 'finished' && r.cutCard;
        const loser = Boolean(cut && r.losers.includes(dealerId));
        supply.classList.toggle('has-cut', Boolean(cut));
        supply.classList.toggle('is-loser', loser);
        $('deck-caption').textContent = cut ? 'New card' : 'Deck';
        const card = $('deck-card');
        renderCard(card, cut, Boolean(cut));
        renderWinner(card, Boolean(cut && !loser), cut
            ? `${playerName(dealerId)}’s new card: ${R.cardLabel(cut)}. ${r.kingCut ? 'King cut; only the dealer wins' : 'Counts for this round'}${loser ? '. ' + (r.dealerLosesTie ? 'Dealer loses tie' : 'Low card; loses') : ''}`
            : 'Face-down deck', r?.kingCut ? '👑' : '🏆');
    }

    function scheduleSupplyLayout() {
        cancelAnimationFrame(supplyFrame);
        clearTimeout(supplyTimer);
        supplyFrame = requestAnimationFrame(positionDealerSupply);
        // Seats can move when someone joins; settle the pile beside their final position.
        supplyTimer = setTimeout(positionDealerSupply, 460);
    }

    function positionDealerSupply() {
        const supply = $('dealer-supply');
        if (!room || supply.hidden || $('game-view').hidden) return;
        const dealer = seatNodes.get(supply.dataset.dealer);
        if (!dealer) return;
        const stage = $('table-stage').getBoundingClientRect();
        const hand = dealer.querySelector('.playing-card').getBoundingClientRect();
        const width = supply.offsetWidth, height = supply.offsetHeight;
        const origin = { x: hand.left + hand.width / 2 - stage.left, y: hand.top + hand.height / 2 - stage.top };
        const obstacles = [...$('seats').querySelectorAll('.playing-card, .empty-card, .seat-name, .seat-action, .seat-status'),
            document.querySelector('.table-center')]
            .filter(node => !node.hidden && (getComputedStyle(node).visibility !== 'hidden' || node.classList.contains('layout-reserve')) &&
                (!node.classList.contains('seat-status') || node.textContent.trim()))
            .map(node => {
                const rect = node.getBoundingClientRect();
                return { left: rect.left - stage.left, top: rect.top - stage.top,
                    right: rect.right - stage.left, bottom: rect.bottom - stage.top };
            });
        const layoutKey = `${roomCode}:${room.round?.number || 0}:${supply.dataset.dealer}:${stage.width}:${stage.height}:${width}:${height}`;
        const previousX = parseFloat(supply.style.left) + width / 2;
        const previousY = parseFloat(supply.style.top) + height / 2;
        const keepNearby = supply.dataset.layoutKey === layoutKey && Number.isFinite(previousX) && Number.isFinite(previousY) &&
            Math.hypot(previousX - origin.x, previousY - origin.y) < 200;
        let best;
        const spacing = (hand.width + width) / 2 + 12;
        function consider(candidateX, candidateY) {
            const x = Math.max(width / 2 + 4, Math.min(stage.width - width / 2 - 4, candidateX));
            const y = Math.max(height / 2 + 4, Math.min(stage.height - height / 2 - 4, candidateY));
            const left = x - width / 2, top = y - height / 2;
            const overlap = obstacles.reduce((area, rect) => area +
                Math.max(0, Math.min(left + width, rect.right) - Math.max(left, rect.left)) *
                Math.max(0, Math.min(top + height, rect.bottom) - Math.max(top, rect.top)), 0);
            const proximity = obstacles.reduce((area, rect) => area +
                Math.max(0, Math.min(left + width, rect.right + 5) - Math.max(left, rect.left - 5)) *
                Math.max(0, Math.min(top + height, rect.bottom + 5) - Math.max(top, rect.top - 5)), 0);
            const edge = Math.max(0, ((x - stage.width / 2) / (stage.width * .43)) ** 2 +
                ((y - stage.height / 2) / (stage.height * .42)) ** 2 - 1);
            const score = (overlap > 0 ? 1e9 + overlap * 10000 : 0) + proximity * 10 + edge * 100 +
                Math.hypot(x - origin.x, y - origin.y) + Math.abs(y - origin.y) * .08 +
                (keepNearby ? Math.hypot(x - previousX, y - previousY) * 2 : 0);
            if (!best || score < best.score) best = { left, top, score, overlap };
        }
        if (keepNearby) {
            consider(previousX, previousY);
            // Turn the cut card over where the deck already sits, unless new labels need the space.
            if (best.overlap === 0) return;
            for (let dx = -24; dx <= 24; dx += 4) for (let dy = -24; dy <= 24; dy += 4) consider(previousX + dx, previousY + dy);
        }
        supply.dataset.layoutKey = layoutKey;
        // Pick the closest clear patch of felt, favoring the inside of the table.
        // Checking several directions also keeps the cut card readable at an eight-seat table.
        for (const distance of [spacing, spacing + 22, spacing + 44, spacing + 68, spacing + 94, spacing + 122]) {
            for (let step = 0; step < 24; step++) {
                const angle = step * Math.PI / 12;
                consider(origin.x + Math.cos(angle) * distance, origin.y + Math.sin(angle) * distance);
            }
        }
        const centerX = best.left + width / 2, centerY = best.top + height / 2;
        for (let dx = -24; dx <= 24; dx += 3) for (let dy = -24; dy <= 24; dy += 3) consider(centerX + dx, centerY + dy);
        const fineX = best.left + width / 2, fineY = best.top + height / 2;
        for (let dx = -3; dx <= 3; dx += .5) for (let dy = -3; dy <= 3; dy += .5) consider(fineX + dx, fineY + dy);
        if (best.overlap > 0) {
            // Very narrow tables can have only a small gap between two labels.
            const xs = [origin.x, stage.width / 2, ...obstacles.flatMap(rect => [rect.left - width / 2 - .5, rect.right + width / 2 + .5])];
            const ys = [origin.y, stage.height / 2, ...obstacles.flatMap(rect => [rect.top - height / 2 - .5, rect.bottom + height / 2 + .5])];
            for (const x of xs) for (const y of ys) consider(x, y);
        }
        supply.style.left = `${best.left}px`;
        supply.style.top = `${best.top}px`;
    }

    function render() {
        const r = room.round;
        renderSeats();
        renderDealerSupply();
        const finished = r?.phase === 'finished';
        document.querySelector('.round-banner').classList.toggle('result-banner', Boolean(finished));
        let title, subtitle, kicker;
        if (!r) {
            kicker = 'MAKE YOURSELF AT HOME';
            title = room.players.length === 1 ? 'A little company?' : 'Everyone comfortable?';
            subtitle = room.players.length === 1 ? 'Invite someone to your table. It only takes two.' : `${room.players.length} at the table. Deal whenever you’re ready.`;
            if (room.practice) {
                const count = room.players.filter(p => p.isAI).length;
                subtitle = `${count === 1 ? 'Your AI opponent is' : `${count} AI opponents are`} ready. Deal whenever you like.`;
            }
        } else if (finished) {
            kicker = `ROUND ${r.number} · CARDS ON THE TABLE`;
            if (r.kingCut) {
                title = r.dealerId === myId ? 'Long live the king!' : 'The dealer takes the crown.';
                subtitle = `${playerName(r.dealerId)} cut a king and wins! Everyone else loses, even with a king.`;
            } else {
                const losers = joinNames(r.losers.map(playerName));
                title = r.losers.length === r.order.length ? 'A table full of low cards.' : r.losers.includes(myId) ? 'Ah, better luck next round.' : 'You’re off the hook.';
                if (!r.order.includes(myId)) title = 'The cards are in.';
                subtitle = `${losers} ${r.losers.length > 1 ? 'lose' : 'loses'} with ${r.lowRank === 1 ? 'the ace' : 'the lowest card (' + R.rankLabel(r.lowRank) + ')'}.`;
                if (r.dealerLosesTie) subtitle = `${playerName(r.dealerId)} loses the tie. The dealer must beat the lowest card.`;
            }
        } else if (r.phase === 'challenge') {
            kicker = `ROUND ${r.number} · A LITTLE SUSPENSE`;
            title = r.pending.to === myId ? 'Something up your sleeve?' : 'Not so fast…';
            subtitle = `${playerName(r.pending.from)} wants to swap with ${playerName(r.pending.to)}.`;
        } else {
            const active = r.order[r.turn];
            const mine = active === myId;
            const last = r.turn === r.order.length - 1;
            kicker = `ROUND ${r.number} · ${last ? 'THE DEALER’S CHOICE' : 'HOLD YOUR NERVE'}`;
            title = mine ? 'Your move.' : `${playerName(active)}’s move.`;
            subtitle = last ? 'Keep your card, or see what the deck has in store.' : mine ? `Like your card? Hold. Feeling brave? Swap with ${playerName(r.order[r.turn + 1])}.` : 'A little patience. A little poker face.';
        }
        $('round-kicker').textContent = kicker;
        $('round-title').textContent = title;
        $('round-subtitle').textContent = subtitle;
        const compactStatus = !r ? 'Ready when you are.' : finished
            ? r.kingCut ? `${playerName(r.dealerId)} wins with a king!` : r.dealerLosesTie ? `${playerName(r.dealerId)} loses the tie.` : `${joinNames(r.losers.map(playerName))} ${r.losers.length > 1 ? 'lose' : 'loses'} this round.`
            : `Round ${r.number} · ${r.phase === 'challenge' ? 'Waiting for ' + playerName(r.pending.to) : r.order[r.turn] === myId ? 'Your turn' : playerName(r.order[r.turn]) + '’s turn'}`;
        $('compact-status').textContent = compactStatus;
        $('compact-status').title = compactStatus;
        $('center-caption').textContent = 'PASS THE ACE';
        $('center-detail').textContent = r ? (finished ? 'Shall we go again?' : 'Clockwise · ace is low') : 'A seat for everyone.';
        $('event-line').textContent = eventText(r);
        const queued = r ? room.players.filter(p => !r.order.includes(p.id)) : [];
        $('queued-players').hidden = queued.length === 0;
        $('queued-players').textContent = queued.length ? `${joinNames(queued.map(p => p.name))} ${queued.length === 1 ? 'joins' : 'join'} on the next deal.` : '';
        renderControls();
    }

    function eventText(r) {
        if (!r) return 'Your card stays face up on your own phone.';
        const e = r.event;
        if (!e) return '';
        if (e.kind === 'deal') return `${playerName(r.dealerId)} is the dealer. ${playerName(r.order[0])} starts.`;
        if (e.kind === 'swap') return `${playerName(e.actor)} swapped with ${playerName(e.target)}.`;
        if (e.kind === 'hold') return `${playerName(e.actor)} held their card.`;
        if (e.kind === 'challenge') return `Waiting for ${playerName(e.target)} to respond…`;
        if (e.kind === 'king') return `${playerName(e.actor)} revealed a king! ${playerName(e.blocked)} keeps their card.`;
        if (e.kind === 'cut') return r.beforeCutCard
            ? `${playerName(e.actor)} cut: ${R.rankLabel(r.beforeCutCard.rank)}${R.SYMBOLS[r.beforeCutCard.suit]} → ${R.rankLabel(r.cutCard.rank)}${R.SYMBOLS[r.cutCard.suit]}. The new card counts.`
            : `${playerName(e.actor)} cut the ${R.cardLabel(r.cutCard).toLowerCase()}.`;
        return '';
    }

    function actionButton(label, type, className = 'primary', extra) {
        const revision = room.revision;
        const button = element('button', `button ${className}`, label);
        button.type = 'button';
        button.dataset.action = type;
        button.disabled = busy || processing || !connected;
        button.addEventListener('click', () => {
            if (room.revision !== revision || processing) return;
            const data = type === 'deal' ? { deck: R.shuffledDeck() } :
                type === 'cut' ? { cutIndex: Math.floor(Math.random() * room.round.deck.length) } : extra || {};
            void send(type, data);
        });
        $(type === 'deal' ? 'deal-actions' : 'actions').append(button);
        return button;
    }
    function renderControls() {
        if (!room) return;
        scheduleSupplyLayout();
        const r = room.round;
        const finished = !r || r.phase === 'finished';
        let compactCopy;
        if (!connected) compactCopy = 'Reconnecting… Your seat is saved.';
        else if (finished) compactCopy = room.players.length < 2 ? 'Invite a friend to get started.' : `${playerName(room.nextDealerId)} deals ${r ? 'next. Starting automatically.' : 'first. Tap Deal cards.'}`;
        else if (!r.order.includes(myId)) compactCopy = 'You’re in on the next deal.';
        else if (r.phase === 'challenge') compactCopy = r.pending.to === myId ? 'Your king blocks the swap.' : `Waiting for ${playerName(r.pending.to)}…`;
        else if (r.order[r.turn] === myId) compactCopy = r.dealerId === myId ? 'Keep your card, or cut the deck.' : 'Keep your card, or swap.';
        else compactCopy = `Waiting for ${playerName(r.order[r.turn])}…`;
        $('compact-action-copy').textContent = compactCopy;
        $('compact-action-copy').title = compactCopy;
        const copy = $('action-copy');
        copy.replaceChildren();
        $('actions').replaceChildren();
        $('deal-actions').replaceChildren();
        document.querySelector('.action-panel').classList.toggle('king-prompt', r?.phase === 'challenge' && r.pending.to === myId);
        if (!connected) {
            copy.textContent = 'Reconnecting… Your seat and cards are saved.';
            syncAutoDeal();
            return;
        }
        if (!r || r.phase === 'finished') {
            const enough = room.players.length >= 2;
            copy.textContent = enough ? `${playerName(room.nextDealerId)} deals ${r ? 'next. Starting automatically, or tap to deal now.' : 'first. Tap Deal cards when everyone is ready.'}` : 'Share your room link to bring everyone together.';
            if (enough) {
                const button = actionButton(r ? 'Deal again ' : 'Deal cards ↗', 'deal');
                if (r) {
                    const badge = element('span', 'deal-countdown', '3');
                    badge.setAttribute('aria-hidden', 'true');
                    button.append(badge);
                    button.title = 'Next round starts automatically after 3 seconds. Tap to deal sooner.';
                }
            }
            else {
                const button = element('button', 'button primary', 'Invite your people ↗');
                button.addEventListener('click', invite);
                $('actions').append(button);
            }
        } else if (!r.order.includes(myId)) {
            copy.textContent = 'You’ve got a seat for the next round. Enjoy the suspense!';
        } else if (r.phase === 'challenge' && r.pending.to === myId) {
            copy.append(element('strong', '', 'You have a king. Make an entrance.'));
            actionButton('♚  Reveal king!', 'revealKing');
        } else if (r.phase === 'playing' && r.order[r.turn] === myId) {
            const last = r.turn === r.order.length - 1;
            copy.append(element('strong', '', `Your card: ${R.cardLabel(r.hands[myId])}. `));
            copy.append(document.createTextNode(last ? 'A cut replaces it. Cut a king and only you win.' : 'Trust it, or trade it?'));
            actionButton('Hold', 'hold', 'secondary');
            actionButton(last ? 'Cut the deck' : '← Swap', last ? 'cut' : 'swap');
        } else {
            const dots = element('span', 'waiting-dots');
            dots.setAttribute('aria-hidden', 'true');
            dots.append(element('i'), element('i'), element('i'));
            copy.append(dots, document.createTextNode(r.phase === 'challenge' ? `Waiting for ${playerName(r.pending.to)}…` : `Waiting for ${playerName(r.order[r.turn])}. Make yourself comfortable.`));
        }
        syncAutoDeal();
    }

    async function animateEvent(r) {
        clearTimeout(animationTimer);
        const stage = $('table-stage');
        stage.classList.remove('dealing', 'revealing');
        clearTimeout(flourishTimer);
        $('table-flourish').hidden = true;
        if (!r) return;
        void stage.offsetWidth;
        if (r.event.kind === 'deal') stage.classList.add('dealing');
        if (r.phase === 'finished') stage.classList.add('revealing');
        if (r.event.kind === 'king') {
            $('flourish-detail').textContent = `${playerName(r.event.actor)} has a king. No swap for you!`;
            $('table-flourish').hidden = false;
            flourishTimer = setTimeout(() => { $('table-flourish').hidden = true; }, 2400);
        }
        animationTimer = setTimeout(() => stage.classList.remove('dealing', 'revealing'), 2200);
        if (r.event.kind === 'swap') await animateSwap(r);
        // Also gives everyone a moment to see the new deal before turn buttons enable.
        if (r.event.kind === 'deal') await new Promise(resolve => setTimeout(resolve, 700));
    }

    async function animateSwap(r) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const { actor, target } = r.event;
        const nodes = [seatNodes.get(actor), seatNodes.get(target)];
        if (nodes.some(node => !node)) return;
        const stage = $('table-stage').getBoundingClientRect();
        const rects = nodes.map(node => node.querySelector('.playing-card').getBoundingClientRect());
        const cards = [r.event.fromCard || r.hands[target], r.event.toCard || r.hands[actor]];
        const destinations = [target, actor];
        const flights = [];
        const animations = [];
        nodes.forEach(node => node.classList.add('is-transferring'));
        try {
            for (let i = 0; i < 2; i++) {
                const from = rects[i], to = rects[1 - i];
                const dx = to.left - from.left, dy = to.top - from.top;
                const length = Math.hypot(dx, dy) || 1;
                const curve = Math.min(38, length * .15);
                const flight = element('div', 'playing-card flying-card');
                flight.style.setProperty('--card-width', `${from.width}px`);
                flight.style.left = `${from.left - stage.left}px`;
                flight.style.top = `${from.top - stage.top}px`;
                renderCard(flight, cards[i], R.canSee(r, myId, destinations[i]));
                flight.classList.toggle('face-up', R.canSee(r, myId, destinations[i]));
                flight.setAttribute('aria-hidden', 'true');
                $('card-flights').append(flight);
                flights.push(flight);
                const animation = flight.animate([
                    { transform: 'translate(0, 0) rotate(0deg)' },
                    { transform: `translate(${dx / 2 - dy / length * curve}px, ${dy / 2 + dx / length * curve}px) rotate(${i ? -9 : 9}deg)`, offset: .5 },
                    { transform: `translate(${dx}px, ${dy}px) rotate(0deg)` }
                ], { duration: 1050, easing: 'cubic-bezier(.35, 0, .25, 1)', fill: 'forwards' });
                animations.push(animation);
                flightAnimations.add(animation);
            }
            await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
        } finally {
            animations.forEach(animation => { animation.cancel(); flightAnimations.delete(animation); });
            flights.forEach(flight => flight.remove());
            nodes.forEach(node => node.classList.remove('is-transferring'));
        }
    }

    async function invite() {
        const url = new URL(location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('room', roomCode);
        try {
            if (navigator.share) await navigator.share({ title: 'Pass the Ace', text: `Come play! Join our ${roomCode} table.`, url: url.href });
            else { await navigator.clipboard.writeText(url.href); toast('Invite link copied. Send it to your people.'); }
        } catch (error) {
            if (error.name !== 'AbortError') {
                toast(`Join room ${roomCode} at this page’s address.`);
            }
        }
    }

    function confirmAction(title, detail, label) {
        return new Promise(resolve => {
            const dialog = $('confirm-dialog');
            $('confirm-title').textContent = title;
            $('confirm-detail').textContent = detail;
            $('confirm-ok').textContent = label;
            dialog.returnValue = '';
            dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
            dialog.showModal();
        });
    }

    function renderManagement() {
        if (!room) return;
        const playing = room.round && room.round.phase !== 'finished';
        $('manage-hint').textContent = playing ? 'A round is in progress. You can tidy up seats between rounds. If someone has left, end the round to get everyone playing again.' : 'Seats run clockwise in join order. Remove someone who has left to free up their chair.';
        $('manage-players').replaceChildren();
        for (const player of room.players) {
            const row = element('div', 'manage-row');
            const name = element('span', '', player.name + (player.id === myId ? ' (you)' : ''));
            if (player.isAI) name.append(element('small', '', 'AI practice opponent'));
            if (player.id === room.nextDealerId) name.append(element('small', '', 'Deals next'));
            row.append(name);
            if (!playing && !player.isAI) {
                const button = element('button', '', 'Remove');
                button.disabled = busy || !connected;
                button.addEventListener('click', async () => {
                    if (await confirmAction(`Remove ${player.name}?`, 'They can join again with the same room name whenever they like.', 'Remove')) {
                        await send('remove', { target: player.id });
                    }
                });
                row.append(button);
            }
            $('manage-players').append(row);
        }
        $('reset-button').hidden = !playing;
        $('reset-button').disabled = busy || !connected;
    }

    function renderRecent() {
        const recent = readSaved().recent;
        $('recent-rooms').replaceChildren();
        $('recent-section').hidden = !Array.isArray(recent) || !recent.length;
        if (!Array.isArray(recent)) return;
        for (const visit of recent.slice(0, 4)) {
            const button = element('button', 'recent-room');
            button.type = 'button';
            button.append(element('span', '', visit.aiCount ? `AI table · ${visit.aiCount} ${visit.aiCount === 1 ? 'opponent' : 'opponents'}` : visit.code), element('small', '', `${visit.name} ↗`));
            button.title = visit.code;
            button.addEventListener('click', () => {
                $('room-name').value = visit.code;
                $('player-name').value = visit.name;
                void joinGame();
            });
            $('recent-rooms').append(button);
        }
    }

    // Resume audio within a user gesture; incoming network events never request autoplay.
    document.addEventListener('pointerdown', () => { void sounds?.unlock(); }, { passive: true });
    document.addEventListener('keydown', () => { void sounds?.unlock(); });
    document.addEventListener('click', () => { void sounds?.unlock(); });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) silenceSounds();
    });
    window.addEventListener('pagehide', silenceSounds);
    $('sound-button').addEventListener('click', async () => {
        soundEnabled = !soundEnabled;
        silenceSounds();
        sounds?.setEnabled(soundEnabled);
        renderSoundSetting();
        try { localStorage.setItem(STORAGE, JSON.stringify({ ...readSaved(), sound: soundEnabled })); }
        catch { /* The toggle still works for this visit without storage. */ }
        if (soundEnabled && await sounds?.unlock()) sounds.play('hold');
    });
    renderSoundSetting();

    $('join-form').addEventListener('submit', joinGame);
    $('ai-button').addEventListener('click', event => void joinGame(event, true));
    window.addEventListener('resize', scheduleSupplyLayout);
    $('rules-button').addEventListener('click', () => $('rules-dialog').showModal());
    $('table-button').addEventListener('click', () => { renderManagement(); $('table-dialog').showModal(); });
    $('table-rules-button').addEventListener('click', () => { $('table-dialog').close(); $('rules-dialog').showModal(); });
    $('table-invite-button').addEventListener('click', () => { $('table-dialog').close(); void invite(); });
    $('table-leave-button').addEventListener('click', () => { $('table-dialog').close(); $('leave-button').click(); });
    $('invite-button').addEventListener('click', invite);
    $('confirm-ok').addEventListener('click', () => $('confirm-dialog').close('yes'));
    $('confirm-cancel').addEventListener('click', () => $('confirm-dialog').close('no'));
    document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
    $('reset-button').addEventListener('click', async () => {
        if (await confirmAction('Call this one off?', 'Everyone’s cards will be put away. You can remove empty seats and deal a fresh round.', 'End round')) {
            if (await send('reset')) $('table-dialog').close();
        }
    });
    $('leave-button').addEventListener('click', async () => {
        const playing = room?.round && room.round.phase !== 'finished';
        if (playing) {
            if (await confirmAction('Step away from the table?', 'Your seat stays in this round. Rejoin with the same name to carry on. The table can end the round if you’re done for now.', 'Step away')) leaveView();
        } else if (await confirmAction('Leave the table?', 'This frees up your seat. You can come back with the same room name.', 'Leave table')) {
            if (await send('remove', { target: myId })) leaveView();
        }
    });

    const saved = readSaved();
    $('room-name').value = new URLSearchParams(location.search).get('room') || saved.room || '';
    $('player-name').value = saved.name || '';
    $('ai-count').value = String(Number.isInteger(saved.aiCount) && saved.aiCount >= 1 && saved.aiCount < R?.MAX_PLAYERS ? saved.aiCount : 1);
    renderRecent();
    if (!R || !window.firebase) {
        showError('join-error', 'The game couldn’t load. Check your internet connection and refresh to try again.');
        $('join-button').disabled = true;
        $('ai-button').disabled = true;
        return;
    }
    try {
        const app = firebase.initializeApp({ databaseURL: 'https://photobookshelf.firebaseio.com/' }, 'pass-the-ace');
        db = app.database();
        db.ref('.info/serverTimeOffset').on('value', snapshot => {
            serverTimeOffset = Number(snapshot.val()) || 0;
        });
        db.ref('.info/connected').on('value', snapshot => {
            connected = snapshot.val() === true;
            if (!connected) { quietNextSnapshot = true; silenceSounds(); }
            $('connection').textContent = connected ? 'Connected' : 'Reconnecting';
            $('connection').classList.toggle('online', connected);
            if (connected) {
                showError('game-error');
                if (!roomRef) showError('join-error');
            }
            setBusy(busy);
        });
        setBusy(false);
        setTimeout(() => {
            if (!connected && !roomRef) showError('join-error', 'Still connecting. Check your internet connection; we’ll keep trying.');
        }, 10000);
    } catch (error) {
        showError('join-error', `Couldn’t connect to the table. ${error.message}`);
        $('join-button').disabled = true;
        $('ai-button').disabled = true;
    }
})();
