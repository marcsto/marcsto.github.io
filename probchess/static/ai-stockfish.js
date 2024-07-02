/**
 * A simple AI that runs asks stockfish for the best move. This doesn't look at probabilities at all.
 */
class StockfishAi {

    constructor() {
        this.stockfish = new SynchronousStockfish();
    }

    getBestMove(fen, callback, depth=10) {
        this.stockfish.getBestMove(fen, depth).then((result) => {
            let bestMove = chessMoveToIndices(result.bestMove);
            callback(bestMove);
        });
    }
}
