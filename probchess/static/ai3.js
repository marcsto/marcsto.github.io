
/**
 * A chess AI that runs a montecarlo simulation to determine the best move.
 * It uses the Stockfish engine to evaluate the board state and guide the monte carlo search.
 */
class MonteCarloAi {

    constructor() {
        this.stockfish = new SynchronousStockfish();
    }

    async runMonteCarlo(fen, probabilities, depth, initialDepth, simDepth, simCount, multiPV=3) {
        let board = new Chess(fen);
        const { bestMove, scores, moves, lines } = await this.stockfish.getBestMove(fen, initialDepth, multiPV, board);
        console.log("Got result: ", { bestMove, scores, moves, lines });
        
        let simScores = [];
        let bestScore = -Infinity;
        let bestMoveIndex = -1;
        for (let i = 0; i < moves.length; i++) {
            console.log("*Move: ", moves[i], " initialScore: ", scores[i]);
            let simScore = await this.runSimulations(moves[i], fen, probabilities, depth, simDepth, simCount);
            console.log("    Sim score: ", simScore);
            simScores.push(simScore);
            // Take the highest score. Note that when the scores are very high, the engine stops giving meaningful differences
            // i.e. if you have a bunch of winning moves. Pick the first on in that case.
            if ((i==0)  
                ||(simScore < 1000 && simScore > bestScore)
                || (simScore >= 1000 && simScore > bestScore && Math.abs(bestScore - simScore) > 100)
            ) {
                bestScore = simScore;
                bestMoveIndex = i;
            }
        }
        for (let i = 0; i < moves.length; i++) {
            console.log("*Move: ", moves[i], " simScore: ", simScores[i]);
        }
        console.log("Best move: ", moves[bestMoveIndex], " with score: ", bestScore);
        return chessMoveToIndices(moves[bestMoveIndex]);
        
    }

    async runSimulations(move, fen, probabilities, depth, simDepth, simCount) {
        let scoreSum = 0;
        for (let i = 0; i < simCount; i++) {
            let score = await this.runOneSimulation(move, fen, probabilities, depth, simDepth);
            console.log("    Simulation ", i, " score: ", score);
            scoreSum += score;
        }
        return scoreSum / simCount;
    }

    /**
     * Runs one simulation up to simDepth. 
     * 
     * @param {string*} fen 
     * @param {*} probabilities 
     * @param {number} simDepth 
     * @param {number} depth 
     * @returns the stockfish score of the final position. Always relative to the player to move at the start of the simulation.
     */
    async runOneSimulation(move, fen, probabilities, depth, simDepth) {
        let board = new Chess(fen);
        // maybe save last 'incheck value?
        for (let i = 0; i < simDepth; i++) {
            if (getWinnerFen(fen)) {
                break;
            }
            let bestMove = null;
            if (i == 0) {
                bestMove = move;
            } else {
                // Result format: { bestMove, scores, moves, lines }
                const result = await this.stockfish.getBestMove(fen, depth, 1, board);
                bestMove = result.bestMove;
            }
            
            const moveIndices = chessMoveToIndices(bestMove);
            var destProb = probabilities[moveIndices.endRow][moveIndices.endCol];
            if (Math.random() < destProb) {
                // Play the move.
                let success = board.move(bestMove, {'legal':false});
                if (!success) {
                    console.log("Illegal move: ", bestMove);
                    throw "Illegal move: " + bestMove;
                }
                fen = board.fen();
            } else {
                // Skip the turn
                fen = changeTurnFen(fen);
                board = new Chess(fen);
            }
        }

        let winner = getWinnerFen(fen);
        let score = -9999;
        if (winner === turnFen(fen)) {
            score = 10000;
        } else if (winner) {
            score = -10000;
        } else {
            const result = await this.stockfish.getBestMove(fen, depth, 1, board);
            score = result.scores[0];
        }
        
        if (simDepth % 2 === 0) {
            return score;
        } else {
            return -score;
        }
    }


    getBestMoveEm(fen, probabilities, callback, depth=5, initialDepth=10) {
        depth = 10; // TODO: Hardcoded for now.
        initialDepth = 10;
        let simDepth=5
        let simCount=50
        this.runMonteCarlo(fen, probabilities, depth, initialDepth, simDepth, simCount).then((result) => {
            callback(result);
        });
    }

    getBestMove(fen, callback, depth=10) {
        this.stockfish.getBestMove(fen, depth).then((result) => {
            let bestMove = chessMoveToIndices(result.bestMove);
            callback(bestMove);
        });
        
    }
}

// Eat queen easy (h6h8)
//   new MonteCarloAi().getBestMoveEm('k6q/8/7Q/8/8/8/8/7K w - - 0 1', probabilities, console.log);
// Promption simple
// new MonteCarloAi().getBestMoveEm('k7/7P/8/8/8/8/8/7K w - - 0 1', probabilities, console.log);