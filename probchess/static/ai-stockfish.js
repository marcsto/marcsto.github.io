// Copyright Marc Stogaitis 2024. All Rights Reserved.

/**
 * A simple AI that runs asks stockfish for the best move. This doesn't look at probabilities at all.
 */
class StockfishAi {

    constructor() {
        this.stockfish = new SynchronousStockfish();
    }

    getBestMove(fen, callback, config={}) {
        let default_config = {
            depth: 10
        }
        config = Object.assign(default_config, config);
        this.stockfish.getBestMove(fen, config.depth, 3).then((result) => {
            let bestMove = chessMoveToIndices(result.bestMove);
            callback({"move":bestMove, "score":result.scores[0]});
        });
    }
}
