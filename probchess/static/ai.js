var wasmSupported = typeof WebAssembly === 'object' && WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
var stockfish = new Worker(wasmSupported ? 'static/stockfish.wasm.js' : 'static/stockfish.js');

var bestMoveCallback;

stockfish.addEventListener('message', function (e) {
    console.log(e.data);
    if (e.data === 'uciok') {
        stockfish.postMessage('isready');
    }
    // if (e.data === 'readyok') {
    //     if (bestMoveCallback) {
    //         bestMoveCallback();
    //     }
    // }
    if (e.data.startsWith('bestmove')) {
        var bestMove = e.data.split(' ')[1];
        console.log('Best move: ' + bestMove);
        if (bestMoveCallback) {
            bestMoveCallback(bestMove);
        }
    }
});

// Initialize the UCI
stockfish.postMessage('uci');

function get_best_move(fen, callback) {
    bestMoveCallback = function(bestMove) {
        converted_move = chessMoveToIndices(bestMove);
        callback(converted_move);
    };
    stockfish.postMessage('position fen ' + fen);
    stockfish.postMessage('go depth 10');
}

function chessMoveToIndices(move) {
    // Convert a single position from chess notation to indices
    // e.g. e2e4 -> { startRow: 6, startCol: 4, endRow: 4, endCol: 4 } 
    function chessNotationToIndex(pos) {
        const column = pos.charCodeAt(0) - 'a'.charCodeAt(0);
        const row = 8 - parseInt(pos[1]);
        return { row: row, column: column };
    }

    const startPos = move.slice(0, 2);
    const endPos = move.slice(2);

    const start = chessNotationToIndex(startPos);
    const end = chessNotationToIndex(endPos);

    return { startRow: start.row, startCol: start.column, endRow: end.row, endCol: end.column };
}

// Example usage:
const move = 'e2e4';
const indices = chessMoveToIndices(move);
console.log(indices); // Output: { startRow: 6, startCol: 4, endRow: 4, endCol: 4 }
