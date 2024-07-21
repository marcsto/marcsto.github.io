// Copyright Marc Stogaitis 2024. All Rights Reserved.

/**
 * A simple AI that runs asks stockfish for the best move. This doesn't look at probabilities at all.
 */
class StockfishAi {

    constructor() {
        this.stockfish = new SynchronousStockfish();
        this.openingBook = {
            'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1': {bestMove: "e7e5", score: -66}, // Prevent d7d5 which leads to easy wins.
            'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1': {bestMove: "e7e5", score: 58}, // Prevent d7d5 which leads to easy wins.
        }
    }

    getBestMove(fen, callback, config={}) {
        let default_config = {
            depth: 10
        }
        config = Object.assign(default_config, config);

        if (fen in this.openingBook) {
            console.log("Opening book move:", this.openingBook[fen].bestMove);
            callback({"move":chessMoveToIndices(this.openingBook[fen].bestMove), "score":this.openingBook[fen].score});
            return;
        }
        this.stockfish.getBestMove(fen, config.depth, 3).then((result) => {
            console.log("bestmove:", result.bestMove);
            let bestMove = chessMoveToIndices(result.bestMove);
            callback({"move":bestMove, "score":result.scores[0]});
        });
    }
}
