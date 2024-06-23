
class StockfishEvaluator {
    constructor() {
        var wasmSupported = typeof WebAssembly === 'object' && WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
        this.stockfish = new Worker(wasmSupported ? 'static/stockfish.wasm.js' : 'static/stockfish.js');        
        this.scores = [];
        this.fenIndex = 0;
        this.fens = [];
        this.moves = [];
        // 2D array of probabilities for each to-square
        this.probabilities = [];
        this.callback = null;
        this.bestMoveCallback = null;
        this.currentFen = '';
        this.depth = 10;

        this.stockfish.addEventListener('message', (e) => this.handleMessage(e));
        this.initialize();
    }

    initialize() {
        this.stockfish.postMessage('uci');
    }

    handleMessage(event) {
        const message = event.data;
        console.log("ucimsg: ", message);

        if (message === 'uciok') {
            this.stockfish.postMessage('isready');
        } else if (message.startsWith('info depth') && message.includes('score')) {
            this.processScore(message);
        } else if (message.startsWith('bestmove')) {
            this.processBestMove(message);
        }
    }

    processNextFen() {
        if (this.bestMoveCallback) {
            this.evaluateFen(this.currentFen);
        } else if (this.fenIndex < this.fens.length) {
            this.evaluateFen(this.fens[this.fenIndex]);
        }
    }

    processScore(message) {
        if (message.includes('score cp')) {
            const score = parseInt(message.split('score cp ')[1].split(' ')[0]);
            this.scores[this.fenIndex] = score;
        } else if (message.includes('score mate')) {
            const score = parseInt(message.split('score mate ')[1].split(' ')[0]);
            this.scores[this.fenIndex] = score > 0 ? 10000 : -10000;
            if (score === 0) {
                // Stockfish won't always call bestmove when it's mate.
                this.processBestMove(null);
            }
        }
    }

    processBestMove(message) {
        if (this.bestMoveCallback) {
            const bestMove = message.split(' ')[1];
            this.bestMoveCallback(this.convertMove(bestMove));
            this.bestMoveCallback = null;
        } else {
            this.fenIndex++;
            if (this.fenIndex < this.fens.length) {
                this.evaluateFen(this.fens[this.fenIndex]);
            } else {
                this.callback(this.determineBestMoveFromScores());
            }
        }
    }

    evaluateFen(fen) {
        console.log("Sending go command for fen: ", fen);
        
        let moves = get_all_moves(fen);
        for (let i = 0; i < moves.length; i++) {
            let move = moves[i];
            // If a move eats the king, pick that move and give it a high score. Don't do the stockfish
            // analysis as it will crash.
            if (move.captured === 'k' || move.captured === 'K') {
                this.scores[this.fenIndex] = 10000;
                // TODO: It would be better to pass this into the message queue callback like stockfish does.
                this.processBestMove("bestmove " + move.from + move.to);
                return;
            }
        }

        this.stockfish.postMessage('position fen ' + fen);
        this.stockfish.postMessage('go depth ' + this.depth);
        //this.stockfish.postMessage('go movetime 500');
        
    }

    convertMove(bestMove) {
        if (!bestMove) {
            return null;
        }
        return this.chessMoveToIndices(bestMove);
    }

    determineBestMoveFromScores() {
        /* Run expectation maximization to determine the best move */
        let noPlayScore = -this.scores[this.scores.length - 1];
        this.scores = this.scores.slice(0, this.scores.length - 1);
        console.log("noPlayScore: ", noPlayScore);

        let bestScore = -Infinity;
        let bestIndex = -1;
        for (let i = 0; i < this.scores.length; i++) {
            let score = -this.scores[i];
            let move = this.moves[i];
            // Determine the column and row of the move destination
            let moveIndices = this.chessMoveToIndices(move.from + move.to);
            let prob = this.probabilities[moveIndices.endRow][moveIndices.endCol];

            let expectedValue = prob * score + (1 - prob) * noPlayScore;

            console.log("fenscore:", move.from + move.to, expectedValue, score, prob, this.fens[i]);
            if (expectedValue > bestScore) {
                bestScore = expectedValue;
                bestIndex = i;
            }
        }
        console.log("Best move: ", this.moves[bestIndex], " with ev: ", bestScore, "and score: ", -this.scores[bestIndex]);
        let bestMove = this.moves[bestIndex];
        return this.chessMoveToIndices(bestMove.from + bestMove.to);
    }

    chessNotationToIndex(pos) {
        const column = pos.charCodeAt(0) - 'a'.charCodeAt(0);
        const row = 8 - parseInt(pos[1]);
        return { row: row, column: column };
    }
    
     chessMoveToIndices(move) {
        // Convert a single position from chess notation to indices
        // e.g. e2e4 -> { startRow: 6, startCol: 4, endRow: 4, endCol: 4 } 

        // Check if move is a string
        if (typeof move !== 'string') {
            move = move.from + move.to;
        }

        const startPos = move.slice(0, 2);
        const endPos = move.slice(2);
    
        const start = this.chessNotationToIndex(startPos);
        const end = this.chessNotationToIndex(endPos);
    
        return { startRow: start.row, startCol: start.column, endRow: end.row, endCol: end.column };
    }

    getBestMoveEm(fen, probabilities, callback, depth=10) {
        console.log("getBestMoveEm: ", fen, probabilities, depth);
        let fensAndMoves = generateFensForAllMoves(fen);
        let fens = fensAndMoves[0];
        let moves = fensAndMoves[1];
        // If a move eats the king, return that move.
        for (let i = 0; i < moves.length; i++) {
            if (moves[i].captured === 'k' || moves[i].captured === 'K'){
                callback(this.chessMoveToIndices(moves[i]));
                return;
            }
        }

        console.log("gens ", fens, moves);
        this.getBestMoveEmInternal(fens, moves, probabilities, callback, depth);
    }

    getBestMoveEmInternal(fens, moves, probabilities, callback, depth=10) {
        this.scores = [];
        this.fenIndex = 0;
        this.fens = fens;
        this.moves = moves;
        this.probabilities = probabilities;
        this.callback = callback;
        this.depth = depth;

        if (this.fens.length > 0) {
            this.processNextFen();
        } else {
            throw new Error('No FENs provided');
        }
    }

    getBestMove(fen, callback, depth=10) {
        this.bestMoveCallback = callback;
        this.depth = depth;
        this.currentFen = fen;
        this.processNextFen();
    }
}

// Stockfish crash: r3kb1r/ppp1ppp1/7p/8/4pn2/8/PPPP1P2/RNB2Kq1 b kq - 1 16
// 3rk1nr/pp1qbpNp/1npp4/4p2Q/4P3/2PP4/PP3PPP/RNB1KB1R b KQk - 0 17
// 3r4/r1p2ppk/1nR1p2p/3pPP2/PR1Pb1P1/6BP/P1PQ3K/8 b - - 0 32