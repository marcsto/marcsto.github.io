
/**
 * Syncronous Stockfish class. Encapsulates the Stockfish worker to provide a synchronous interface so 
 * callers don't have to deal with the async nature of sending messages back and forth to stockfish.
 */
class SynchronousStockfish {
    constructor() {
        var wasmSupported = typeof WebAssembly === 'object' && WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
        this.stockfish = new Worker(wasmSupported ? 'static/stockfish.wasm.js' : 'static/stockfish.js');        
        this.stockfish.addEventListener('message', (e) => this.handleMessage(e));
        this.stockfish.postMessage('uci');
        this.board = null;
        this.scores = []; // Scores for each PV evaluated (default is 1)
        this.lines = [];
        this.multiPvCount = 1; // Stockfish will evaluate this many principle variations
        this.resolveBestMove = null; // Resolve function for the best move promise
    }

    /**
     * Get the best move for the given FEN position.
     * 
     * @param {string} fen FEN of the position
     * @param {number} depth depth to search to
     * @param {number} multiPV number of principle variations to evaluate (i.e. number of best moves to find)
     * @param {Chess} board the board object. Needed to see if the king can be eaten as stockfish crashes. If null, a new board will be created.
     * @returns {Promise} Promise resolving to an object with the best move, scores and moves for each PV.
     *                    The format of the object is { bestMove, scores, moves, lines }. 
     *                    The format of bestMove is a chess.js move object (e.g. { from: 'e2', to: 'e4' })
     */
    getBestMove(fen, depth=10, multiPV=1, board=null) {
        if (!board) {
            board = new Chess(fen);
        }
        this.board = board;
        if (board.king_attacked(swapColor(board.turn()))) {
            // Attacking the opponent's king (we should eat it).
            console.log("King is attacked. Stockfish may crash. Picking move that eats the king.");
            let captureMoves = kingCaptureMoves(board);
            if (captureMoves.length > 0) {
                let move = captureMoves[0];
                console.log("King capture move: ", move);
                let score = move.captured === 'k' ? 10000 : -10000;
                return new Promise((resolve) => {
                    resolve({ bestMove: move, scores: [score], moves: [move], lines: [move]});
                });
            } else {
                throw "No king capture moves found. This is unexpected as the king is in check.";
            }
        }
        console.log("getBestMove position fen:", fen);
        if (this.multiPvCount !== multiPV) {
            this.setMultiplePrincipleVariations(multiPV);
        }
        this.scores = Array(multiPV).fill(-99999);
        this.lines = Array(multiPV).fill(null);
        this.stockfish.postMessage('position fen ' + fen);
        this.stockfish.postMessage('go depth ' + depth);
        return new Promise((resolve) => {
            this.resolveBestMove = resolve;
        });
    }

    /**
     * Puts the engine in a mode where it will evaluate multiple principle variations (PV).
     * This is useful for looking for more than one best move. 
     * 
     * @param {number} count the number of principle variations to evaluate
     */
    setMultiplePrincipleVariations(count) {
        this.stockfish.postMessage('setoption name MultiPV value ' + count);
    }

    handleMessage(event) {
        const message = event.data;
        // console.log("ucimsg: ", message);

        if (message === 'uciok') {
            this.stockfish.postMessage('isready');
        } else if (message.startsWith('info depth') && message.includes('score')) {
            this.processScore(message);
        } else if (message.startsWith('bestmove')) {
            this.processBestMove(message);
        }
    }

    processScore(message) {
        if (!message.includes('multipv')) {
            // When it's a mate, the format is: info depth 0 score mate 0
            if (message.includes('score mate')) {
                // We're currently in checkmate, so stockfish won't make a move.
                // Picking a random move prioritizing king capture moves, then king moves, than random.
                console.log("We're currently in checkmate, so stockfish won't make a move. Picking a random move prioritizing king moves");
                
                let moves = this.board.moves({'legal':false, 'verbose': true});
                let move = null;
                for (let i = 0; i < moves.length; i++) {
                    if (moves[i].piece == 'k') {
                        if (move == null || moves[i].captured) {
                            move = moves[i];
                        }
                    }
                }
                if (!move) {
                    move = moves[Math.floor(Math.random() * moves.length)];
                }
                let score = -10000;
                this.sendBestMoveToCaller(move, [score], [move], [move]);
                return;
            }
        }
        const pvIndex = parseInt(message.split('multipv ')[1].split(' ')[0]) - 1;
        const move = message.split(' pv ')[1];
        this.lines[pvIndex] = move;
        if (message.includes('score cp')) {
            const score = parseInt(message.split('score cp ')[1].split(' ')[0]);
            this.scores[pvIndex] = score;
        } else if (message.includes('score mate')) {
            const score = parseInt(message.split('score mate ')[1].split(' ')[0]);
            this.scores[pvIndex] = score > 0 ? 10000 : -10000;
        }
    }

    processBestMove(message) {    
        const bestMove = message.split(' ')[1];
        if (this.resolveBestMove) {
            let moves = null;
            try {
                moves = this.lines.map((line) => line.split(' ')[0]);
            } catch (e) {
                console.log("Error parsing moves: ", e);
                console.log("message", message);
                throw e;
            }
            this.sendBestMoveToCaller(bestMove, this.scores, moves, this.lines);
        }   
    }

    sendBestMoveToCaller(bestMove, scores, moves, lines) {
        if (this.resolveBestMove) {
            bestMove = stockfishMoveToJsChessMove(bestMove);
            moves = moves.map((move) => stockfishMoveToJsChessMove(move));
            this.resolveBestMove({ bestMove, scores: scores, moves, lines: lines});
            this.resolveBestMove = null;
        }
    }
}

/* Example stockfish output
    ucimsg:  info depth 4 seldepth 2 multipv 1 score mate 1 nodes 362 nps 30166 tbhits 0 time 12 pv h7h8
    ucimsg:  info depth 4 seldepth 2 multipv 2 score mate 1 nodes 362 nps 30166 tbhits 0 time 12 pv g7a7
    ucimsg:  info depth 4 seldepth 2 multipv 3 score mate 1 nodes 362 nps 30166 tbhits 0 time 12 pv g7b7
    ucimsg:  bestmove h7h8
*/
// Is checkmated: 5R1k/8/7K/8/8/8/8/8 b - - 0 1
// Can eat king:  5R1k/8/7K/8/8/8/8/8 w - - 0 1
// new SynchronousStockfish().getBestMove('5R1k/8/7K/8/8/8/8/8 w - - 0 1').then((result) => console.log(result));