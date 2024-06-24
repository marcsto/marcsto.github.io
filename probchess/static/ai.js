var wasmSupported = typeof WebAssembly === 'object' && WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
var stockfish = new Worker(wasmSupported ? 'static/stockfish.wasm.js' : 'static/stockfish.js');

var bestMoveCallback;

stockfish.addEventListener('message', function (e) {
    console.log(e.data);
    if (e.data === 'uciok') {
        stockfish.postMessage('isready');
    }

    if (e.data.startsWith('bestmove')) {
        var bestMove = e.data.split(' ')[1];
        console.log('Best move: ' + bestMove);
        if (bestMoveCallback) {
            bestMoveCallback(bestMove);
        }
    } else if (e.data.startsWith('info depth 0 score mate 0')) {
        // Stockfish doesn't play when it's mate, but our game stops when you eat the king.
        bestMoveCallback(null);
    }
});

// Initialize the UCI
stockfish.postMessage('uci');

function get_best_move(fen, callback) {
    bestMoveCallback = function(bestMove) {
        if (!bestMove) {
            callback(null);
            return;
        }
        converted_move = chessMoveToIndices(bestMove);
        callback(converted_move);
    };
    stockfish.postMessage('position fen ' + fen);
    stockfish.postMessage('go depth 10');
}


// Example usage:
const move = 'e2e4';
const indices = chessMoveToIndices(move);
console.log(indices); // Output: { startRow: 6, startCol: 4, endRow: 4, endCol: 4 }
