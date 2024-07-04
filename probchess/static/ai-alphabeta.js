
/**
 * A chess AI that runs a probability-aware alpha beta search to determine the best move.
 * It uses expected value maximization to determine the best move.
 * It uses the Stockfish engine to evaluate the board state.
 */
class AlphaBetaEmAi {

    constructor() {
        this.stockfish = new SynchronousStockfish();
        this.initialDepth = null;
        this.debug = true;

        // Debug chess lines (moves and score). It contains the moves and scores, and recursively the moves and scores below it.
        // Ex: [['e2e4',0.5,
        //         [['e7e5',0.6],['d7d5',0.4]]],
        //     ['d2d4',0.5,
        //         [['e7e5',0.6],['d7d5',0.4]]]]
        this.debugLines = [];
    }

    async alphaBeta(board, depth, alpha, beta, isNoMoveBranch, probabilities) {
        // Evaluate
        if (depth === 0) {
            let score = await this.evaluateBoard(board, probabilities);
            // if (this.debug) {
            //     console.log("Score: ", score, "Depth: ", depth, "FEN: ", board.fen());
            // }
            
            return { score: score, bestMove: null };
        }

        let fen = board.fen();

        // Game over.
        let winner = getWinnerFen(fen);
        if (winner !== null) {
            let side = turnFen(fen);
            if (winner === side) {
                return { score: WIN_SCORE, bestMove: null };
            } else {
                return { score: -WIN_SCORE, bestMove: null };
            }
        }
    
        let moves = get_all_moves(fen);
    
        // Score if the move fails to play due to probabilities
        let failBoard = new Chess(changeTurnFen(fen));
        
        //let failResult = { score: 0};
        let failResult = await this.alphaBeta(failBoard, depth - 1, alpha, beta, true, probabilities); // TODO: Don't do -1 depth?
         let failScore = -failResult.score;

        // let failResult = await this.evaluateBoard(failBoard, probabilities);
        // let failScore = -failResult;

        if (depth == this.initialDepth) {
            console.log("Fail score: ", failScore);
        }

        let maxScore = -Infinity;
        let bestMove = null;
        let movesWithScores = [];
        for (let move of moves) {
            // if (toAlgebraic(move) === 'h6h5' && depth == this.initialDepth) {
            //     this.debug = true;
            // }
            let moveUnderTest = null;//'h1g1';//'a6a8';//'h6h5';//'h6h5';//'h6e3';//'h6e3'
            if (moveUnderTest != null && depth == this.initialDepth && toAlgebraic(move) != moveUnderTest) {
                continue;
            }
            if (this.debug && !isNoMoveBranch) {
                // Add to debugLines in the correct array, taking into account depth.
                let currentLine = this.debugLines;
                for (let i = 0; i < this.initialDepth - depth; i++) {
                    currentLine = currentLine[currentLine.length - 1][2];
                }
                currentLine.push([toAlgebraic(move), null, [], failScore, null, null]);
            }
            let result = await this.processMove(board, move, depth, alpha, beta, isNoMoveBranch, probabilities, failScore);
            let score = result.score;
            
            if (depth == this.initialDepth) {
                // console.log("  ** Score:", score, "Move:", toAlgebraic(move));
                movesWithScores.push({move: toAlgebraic(move), score: score});
            }
            if (score > maxScore) {
                maxScore = score;
                bestMove = move;
            }
            /*if (score >= beta) {
                return { score: beta, bestMove: null }; // fail hard beta-cutoff
            }
            if (score > alpha) {
                alpha = score;
                bestMove = move;
            }*/
            
        }
        if (this.debug && movesWithScores.length > 0) {
            // Sort moves by score
            movesWithScores.sort((a, b) => b.score - a.score);
            for (let moveWithScore of movesWithScores) {
                console.log("  ** Score: ", moveWithScore.score, "Move: ", moveWithScore.move); 
            }
            
        }
        if (this.debug && depth == this.initialDepth) {
            // Sort all the lines in debugLines
            this.sortDebugLine(this.debugLines);
            console.log("Debug lines: ", this.debugLines);
            
        }
        return { score: maxScore, bestMove: bestMove };
        
    }

    sortDebugLine(currentLine) {
        currentLine.sort((a, b) => b[1] - a[1]);
        for (let line of currentLine) {
            if (line[2].length > 0) {
                this.sortDebugLine(line[2]);
            }
        }
    }

    async processMove(board, move, depth, alpha, beta, isNoMoveBranch, probabilities, failScore) {
        if (this.debug) {
            let indent = "  ".repeat(this.initialDepth - depth);
            // console.log(indent, depth, "  ** startProcessMove: ", toAlgebraic(move));
        }
        let successScore = null;
        let supportedMove = board.move(move, {'legal':false});
        if (!supportedMove) {
            console.log("Illegal move: ", bestMove);
            throw "Illegal move: " + bestMove;
        }
        successScore = await this.alphaBeta(board, depth - 1, -beta, -alpha, isNoMoveBranch, probabilities);
        successScore = successScore.score;
        successScore = -successScore;
        board.undo(move);
        
        let successProbability = probabilities.getProb(move);
        let expectedScore = successProbability * successScore + (1 - successProbability) * failScore;
        if (this.debug) {
            let indent = "  ".repeat(this.initialDepth - depth);
            // console.log(indent, depth, "      ** doneProcessMove: ", toAlgebraic(move), "expectedScore: ", expectedScore, "successScore", successScore, "failScore", failScore, "successProbability", successProbability);
        }
        if (this.debug && !isNoMoveBranch) {
            // Add score to debugLines
            let currentLine = this.debugLines;
            for (let i = 0; i < this.initialDepth - depth; i++) {
                currentLine = currentLine[currentLine.length - 1][2];
            }
            currentLine[currentLine.length - 1][1] = expectedScore;
            currentLine[currentLine.length - 1][4] = successScore;
            currentLine[currentLine.length - 1][5] = successProbability;
        }
        return { score: expectedScore, move: move };
    }

    async evaluateBoard(board, probabilities) {
        let result = await this.stockfish.getBestMove(board.fen(), 3, 1, board, probabilities);
        return result.scores[0]; 
    }

    getBestMove(fen, probabilities, callback, depth=3) {
        this.initialDepth = depth
        let board = new Chess(fen);
        this.alphaBeta(board, depth, -Infinity, Infinity, false, probabilities).then((result) => {
            console.log("Best move: ", result.bestMove, " with score: ", result.score);
            callback(chessMoveToIndices(result.bestMove));
        });
    }
}