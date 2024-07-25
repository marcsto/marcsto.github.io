class GameEncoder {
    constructor() {
        this.base66Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~";
        this.promoPieceMap = { 'q': 0, 'r': 1, 'b': 2, 'n': 3 }; // Map promo pieces to integers
        this.inversePromoPieceMap = { 0: 'q', 1: 'r', 2: 'b', 3: 'n' }; // Map integers back to promo pieces
    }

    // Convert to URL
    toUrl(probabilities, gameHistory, initialChips) {
        const moves = [];
        const promotions = [];
        const probabilityChipsUsed = [];

        gameHistory.forEach((move, index) => {
            const fromSquare = this.algebraicToSquare(move.algebraicMove.substring(0, 2));
            const toSquare = this.algebraicToSquare(move.algebraicMove.substring(2, 4));
            const succeeded = move.played;
            moves.push({ fromSquare, toSquare, succeeded });

            if (move.algebraicMove.length === 5) {
                promotions.push({
                    halfMoveNumber: index,
                    promoPiece: move.algebraicMove[4]
                });
            }

            if (move.chipUsed !== null) {
                probabilityChipsUsed.push({
                    halfMoveNumber: index,
                    probability: move.chipUsed
                });
            }
        });

        const encodedProbabilities = this.encodeProbabilities(probabilities);
        const encodedMoves = this.encodeMoves(moves);
        const encodedPromotions = this.encodePromotions(promotions);

        let url = `?b=${encodedProbabilities}&m=${encodedMoves}&p=${encodedPromotions}`;
        if (initialChips) {
            const encodedInitialProbabilityChips = this.encodeInitialProbabilityChips(initialChips);
            const encodedProbabilityChipsUsed = this.encodeProbabilityChips(probabilityChipsUsed);
            url += `&c=${encodedProbabilityChipsUsed}&d=${encodedInitialProbabilityChips}`;
        }
        url += "&" + this.encodeUi();
        return url;
    }

    // Convert from URL
    fromUrl(params) {
        // If params is a string
        if (typeof params === 'string') {
            params = new URLSearchParams(params);
        }
        if (!params.has('b')) {
            return null;
        }
        const encodedProbabilities = params.get('b');
        const encodedMoves = params.get('m');
        const encodedPromotions = params.get('p');

        const probabilities = this.decodeProbabilities(encodedProbabilities);
        const moves = this.decodeMoves(encodedMoves);
        const promotions = this.decodePromotions(encodedPromotions);

        let probabilityChipsUsed = null;
        let initialProbabilityChips = null;
        if (params.has('c') && params.has('d')) {
            const encodedProbabilityChipsUsed = params.get('c');
            const encodedInitialProbabilityChips = params.get('d');
            probabilityChipsUsed = this.decodeProbabilityChips(encodedProbabilityChipsUsed);
            initialProbabilityChips = this.decodeInitialProbabilityChips(encodedInitialProbabilityChips);
        }

        const gameHistory = moves.map((move, index) => {
            const fromAlgebraic = this.squareToAlgebraic(move.fromSquare);
            const toAlgebraic = this.squareToAlgebraic(move.toSquare);
            let algebraicMove = fromAlgebraic + toAlgebraic;

            const promotion = promotions.find(promo => promo.halfMoveNumber === index);
            if (promotion) {
                algebraicMove += promotion.promoPiece;
            }

            let chipUsed = null;
            if (probabilityChipsUsed) {
                chipUsed = probabilityChipsUsed.find(chip => chip.halfMoveNumber === index)?.probability || null;
            }

            return {
                algebraicMove,
                played: move.succeeded,
                chipUsed
            };
        });

        this.decodeUi();

        return {
            probabilities,
            gameHistory,
            initialProbabilityChips
        };
    }

    // Encode a single move
    encodeMove(fromSquare, toSquare, succeeded) {
        let move = 0;
        move |= fromSquare & 0b111111;
        move |= (toSquare & 0b111111) << 6;
        move |= (succeeded ? 1 : 0) << 12;
        return move;
    }

    // Decode a single move
    decodeMove(encodedMove) {
        return {
            fromSquare: encodedMove & 0b111111,
            toSquare: (encodedMove >> 6) & 0b111111,
            succeeded: ((encodedMove >> 12) & 1) === 1
        };
    }

    // Encode an array of moves
    encodeMoves(moves) {
        let bigInt = 0n;
        for (let i = 0; i < moves.length; i++) {
            bigInt = (bigInt << 13n) | BigInt(this.encodeMove(moves[i].fromSquare, moves[i].toSquare, moves[i].succeeded));
        }
        return this.customBase66Encode(bigInt);
    }

    // Decode an encoded string back to an array of moves
    decodeMoves(encodedString) {
        let bigInt = this.customBase66Decode(encodedString);
        const moves = [];
        let mask = (1n << 13n) - 1n;
        while (bigInt > 0n) {
            const moveInt = Number(bigInt & mask);
            moves.unshift(this.decodeMove(moveInt));
            bigInt >>= 13n;
        }
        return moves;
    }

    // Encode probabilities
    encodeProbabilities(probabilities) {
        if (probabilities.length !== 8) {
            throw new Error('There must be an 8x8 array of probabilities.');
        }

        let bigInt = 0n;
        for (let row of probabilities) {
            for (let prob of row) {
                prob = Math.round(prob * 100); // Should already be an int.
                if (prob < 0 || prob > 100) {
                    throw new Error('Each probability must be between 0 and 100. ' + prob);
                }
                bigInt = (bigInt << 7n) | BigInt(prob);
            }
        }
        return this.customBase66Encode(bigInt);
    }


    // Decode probabilities
    decodeProbabilities(encodedString) {
        let bigInt = this.customBase66Decode(encodedString);
        const flatProbabilities = [];
        const mask = (1n << 7n) - 1n;

        while (bigInt > 0n) {
            flatProbabilities.unshift(Number(bigInt & mask));
            bigInt >>= 7n;
        }

        // Ensure we have exactly 64 probabilities, filling with zeroes if necessary
        while (flatProbabilities.length < 64) {
            flatProbabilities.unshift(0);
        }

        // Convert the flat array back to 8x8
        const probabilities = [];
        for (let i = 0; i < 8; i++) {
            probabilities.push(flatProbabilities.slice(i * 8, i * 8 + 8));
        }
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                probabilities[i][j] /= 100;
            }
        }

        return probabilities;
    }


    // Encode promotions
    encodePromotions(promotions) {
        let bigInt = 0n;
        for (let i = 0; i < promotions.length; i++) {
            const promoPieceCode = this.promoPieceMap[promotions[i].promoPiece];
            if (promoPieceCode === undefined) {
                throw new Error('Invalid promoPiece value.');
            }
            let promotion = 0;
            promotion |= promotions[i].halfMoveNumber & 0xFFFF;
            promotion |= (promoPieceCode & 0b11) << 16;
            bigInt = (bigInt << 18n) | BigInt(promotion);
        }
        return this.customBase66Encode(bigInt);
    }

    // Decode promotions
    decodePromotions(encodedString) {
        let bigInt = this.customBase66Decode(encodedString);
        const promotions = [];
        let mask = (1n << 18n) - 1n;
        while (bigInt > 0n) {
            const promotionInt = Number(bigInt & mask);
            const halfMoveNumber = promotionInt & 0xFFFF;
            const promoPieceCode = (promotionInt >> 16) & 0b11;
            promotions.unshift({ halfMoveNumber, promoPiece: this.inversePromoPieceMap[promoPieceCode] });
            bigInt >>= 18n;
        }
        return promotions;
    }

    // Encode uses of probability chips
    encodeProbabilityChips(probabilityChips) {
        let bigInt = 0n;
        for (let i = 0; i < probabilityChips.length; i++) {
            const { halfMoveNumber, probability } = probabilityChips[i];
            if (probability < 1 || probability > 100) {
                throw new Error('Each probability must be between 1 and 100.');
            }
            let chip = 0;
            chip |= halfMoveNumber & 0xFFFF;
            chip |= (probability & 0x7F) << 16;
            bigInt = (bigInt << 23n) | BigInt(chip);
        }
        return this.customBase66Encode(bigInt);
    }

    // Decode uses of probability chips
    decodeProbabilityChips(encodedString) {
        let bigInt = this.customBase66Decode(encodedString);
        const probabilityChips = [];
        let mask = (1n << 23n) - 1n;
        while (bigInt > 0n) {
            const chipInt = Number(bigInt & mask);
            const halfMoveNumber = chipInt & 0xFFFF;
            const probability = (chipInt >> 16) & 0x7F;
            probabilityChips.unshift({ halfMoveNumber, probability });
            bigInt >>= 23n;
        }
        return probabilityChips;
    }

    // Encode initial probability chips
    encodeInitialProbabilityChips(initialProbabilityChips) {
        let bigInt = 0n;
        for (let i = 0; i < initialProbabilityChips.length; i++) {
            const { probability, count } = initialProbabilityChips[i];
            if (probability < 1 || probability > 100) {
                throw new Error('Each probability must be between 1 and 100.');
            }
            if (count < 0 || count > 255) {
                throw new Error('Count must be between 0 and 255.');
            }
            let chip = 0;
            chip |= probability & 0x7F;
            chip |= (count & 0xFF) << 7;
            bigInt = (bigInt << 15n) | BigInt(chip);
        }
        return this.customBase66Encode(bigInt);
    }

    // Decode initial probability chips
    decodeInitialProbabilityChips(encodedString) {
        let bigInt = this.customBase66Decode(encodedString);
        const initialProbabilityChips = [];
        let mask = (1n << 15n) - 1n;
        while (bigInt > 0n) {
            const chipInt = Number(bigInt & mask);
            const probability = chipInt & 0x7F;
            const count = (chipInt >> 7) & 0xFF;
            initialProbabilityChips.unshift({ probability, count });
            bigInt >>= 15n;
        }
        return initialProbabilityChips;
    }

    encodeUi() {
    
        const state = {};
        const keys = new Set();
        let hasDuplicates = false;
    
        // Handle select elements
        document.querySelectorAll('select[data-key]').forEach(select => {
            const key = select.getAttribute('data-key');
            if (keys.has(key)) {
                console.warn(`Duplicate data-key found: ${key}`);
                hasDuplicates = true;
            } else {
                keys.add(key);
                const selectedOption = select.options[select.selectedIndex];
                state[key] = selectedOption.getAttribute('data-id');
            }
        });
    
        // Handle checkbox elements
        document.querySelectorAll('input[type="checkbox"][data-key]').forEach(checkbox => {
            const key = checkbox.getAttribute('data-key');
            if (keys.has(key)) {
                console.warn(`Duplicate data-key found: ${key}`);
                hasDuplicates = true;
            } else {
                keys.add(key);
                state[key] = checkbox.checked ? '1' : '0';
            }
        });
    
        if (hasDuplicates) {
            console.warn('WARNING: There are duplicate data-keys in the document. DO NOT SUBMIT THIS');
        }
    
        return new URLSearchParams(state).toString();
    }

    decodeUi() {
        const params = new URLSearchParams(window.location.search);

        // Handle select elements
        params.forEach((value, key) => {
            const select = document.querySelector(`select[data-key="${key}"]`);
            if (select) {
                const optionToSelect = Array.from(select.options).find(option => option.getAttribute('data-id') === value);
                if (optionToSelect) {
                    select.value = optionToSelect.value;
                    // Trigger change event
                    const event = new Event('change', { bubbles: true });
                    select.dispatchEvent(event);
                }
            }

            // Handle checkbox elements
            const checkbox = document.querySelector(`input[type="checkbox"][data-key="${key}"]`);
            if (checkbox) {
                checkbox.checked = value === '1';
                // Trigger change event
                const event = new Event('change', { bubbles: true });
                checkbox.dispatchEvent(event);
            }
        });
    }

    // Helper function to convert algebraic notation to square index
    algebraicToSquare(algebraic) {
        const file = algebraic.charCodeAt(0) - 'a'.charCodeAt(0);
        const rank = algebraic.charCodeAt(1) - '1'.charCodeAt(0);
        return rank * 8 + file;
    }

    // Helper function to convert square index to algebraic notation
    squareToAlgebraic(square) {
        const file = String.fromCharCode((square % 8) + 'a'.charCodeAt(0));
        const rank = String.fromCharCode(Math.floor(square / 8) + '1'.charCodeAt(0));
        return file + rank;
    }

    // Custom Base66 encoding (66 truly URL-safe characters)
    customBase66Encode(bigInt) {
        let result = '';
        while (bigInt > 0n) {
            result = this.base66Chars[Number(bigInt % 66n)] + result;
            bigInt /= 66n;
        }
        return result;
    }

    customBase66Decode(str) {
        let result = 0n;
        for (let i = 0; i < str.length; i++) {
            result = result * 66n + BigInt(this.base66Chars.indexOf(str[i]));
        }
        return result;
    }
}

function loadGameFromSavedState(decodedData) {
    if (!decodedData) {
        return;
    }
    
    probabilities.probabilities = decodedData.probabilities;
    gameHistory = decodedData.gameHistory;
    indexInGameHistory = gameHistory.length;
    probabilities.initializeProbabilityChips(decodedData.initialChips);

    // Need to add boardMove, humanMove, fenBefore, fenAfter to gameHistory
    let board = new Chess();
    for (let i = 0; i < gameHistory.length; i++) {
        const historyObj = gameHistory[i];

        // Remove chip from probabilities object if it was used
        let moveTurn = board.turn();
        let isWhite = moveTurn === 'w';
        if (historyObj.chipUsed !== null) {
            probabilities.useProbabilityChip(isWhite, historyObj.chipUsed);
        }

        const algebraicMove = historyObj.algebraicMove;
        historyObj.fenBefore = board.fen();
        var moveObj = board.move(stockfishMoveToJsChessMove(algebraicMove), {'legal':false, verbose: true});
        if (!moveObj) {
            throw "Illegal move: " + algebraicMove;
        }

        let newFen = null;
        if (historyObj.played) {
            newFen = board.fen();
        } else {
            board.undo();
            newFen = board.fen();
            newFen = changeTurnFen(newFen);
            board = new Chess(newFen);
        }

        historyObj.boardMove = chessMoveToIndices(moveObj);
        historyObj.humanMove = moveObj.san;
        historyObj.fenAfter = newFen;

        addMoveToSidePanel(historyObj.humanMove, moveTurn, !historyObj.played, historyObj.fenAfter, null, i);

    }
    probabilities.resetProbabilityModifier();
    currentFEN = board.fen();
    updateBoardFromFEN(currentFEN);

            

}

function gameEncoderTests() {
    const moves = [
        { fromSquare: 8, toSquare: 16, succeeded: true },
        { fromSquare: 50, toSquare: 34, succeeded: false },
        { fromSquare: 1, toSquare: 18, succeeded: true }
    ];

    const encoder = new GameEncoder();
    const encodedMoves = encoder.encodeMoves(moves);
    console.log('Encoded Moves:', encodedMoves);

    const decodedMoves = encoder.decodeMoves(encodedMoves);
    console.log('Decoded Moves:', decodedMoves);

    // Fill an array of probabilities from 1 to 64, in an 8x8 grid.
    const probabilities1 = [];
    for (let i = 0; i < 8; i++) {
        probabilities1.push([]);
        for (let j = 0; j < 8; j++) {
            probabilities1[i].push((i * 8 + j + 1) / 100);
        }
    }


    const encodedProbabilities = encoder.encodeProbabilities(probabilities1);
    console.log('Encoded Probabilities:', encodedProbabilities);

    const decodedProbabilities = encoder.decodeProbabilities(encodedProbabilities);
    console.log('Decoded Probabilities:', decodedProbabilities);

    const promotions = [
        { halfMoveNumber: 1, promoPiece: 'Q' },
        { halfMoveNumber: 2, promoPiece: 'R' },
        { halfMoveNumber: 3, promoPiece: 'B' },
        { halfMoveNumber: 4, promoPiece: 'N' }
    ];
    const encodedPromotions = encoder.encodePromotions(promotions);
    console.log('Encoded Promotions:', encodedPromotions);

    const decodedPromotions = encoder.decodePromotions(encodedPromotions);
    console.log('Decoded Promotions:', decodedPromotions);

    const probabilityChips = [
        { halfMoveNumber: 1, probability: 50 },
        { halfMoveNumber: 2, probability: 75 },
        { halfMoveNumber: 3, probability: 100 },
        { halfMoveNumber: 4, probability: 25 }
    ];
    const encodedProbabilityChips = encoder.encodeProbabilityChips(probabilityChips);
    console.log('Encoded Probability Chips:', encodedProbabilityChips);

    const decodedProbabilityChips = encoder.decodeProbabilityChips(encodedProbabilityChips);
    console.log('Decoded Probability Chips:', decodedProbabilityChips);

    const initialProbabilityChips = [
        { probability: 20, count: 4 },
        { probability: 40, count: 2 },
        { probability: 60, count: 3 },
        { probability: 80, count: 1 }
    ];
    const encodedInitialProbabilityChips = encoder.encodeInitialProbabilityChips(initialProbabilityChips);
    console.log('Encoded Initial Probability Chips:', encodedInitialProbabilityChips);

    const decodedInitialProbabilityChips = encoder.decodeInitialProbabilityChips(encodedInitialProbabilityChips);
    console.log('Decoded Initial Probability Chips:', decodedInitialProbabilityChips);

    const gameHistory1 = [
        { algebraicMove: 'e2e4', played: true, chipUsed: null },
        { algebraicMove: 'e7e5', played: true, chipUsed: null },
        { algebraicMove: 'h7h8Q', played: true, chipUsed: 75 }
    ];

    const url = encoder.toUrl(probabilities1, gameHistory1, initialProbabilityChips);
    console.log('Generated URL:', url);

    const decodedData = encoder.fromUrl(url);
    console.log('Decoded Data:', decodedData);
}

// gameEncoderTests();