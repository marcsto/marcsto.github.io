// Copyright Marc Stogaitis 2024. All Rights Reserved.

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
        this.lastGetBestMoveParams = {'fen':null, 'depth':-1, 'evalDepth':-1 };
        this.lastGetBestMoveReturnValue = null;
        // Debug chess lines (moves and score). It contains the moves and scores, and recursively the moves and scores below it.
        // Ex: [['e2e4',0.5,
        //         [['e7e5',0.6],['d7d5',0.4]]],
        //     ['d2d4',0.5,
        //         [['e7e5',0.6],['d7d5',0.4]]]]
    }

    async alphaBeta(board, depth, alpha, beta, isNoMoveBranch, probabilities, isMaximizingPlayer) {
        // Evaluate
        if (depth === 0) {
            let score = await this.evaluateBoard(board, probabilities);
            if (!isMaximizingPlayer) {
                return { score: -score, bestMove: null };
            }
            return { score: score, bestMove: null };
        }

        let fen = board.fen();

        // Game over.
        let winner = getWinnerFen(fen);
        if (winner !== null) {
            let side = turnFen(fen);
            let score = null;
            if (winner === side) {
                score = WIN_SCORE;
            } else {
                score = -WIN_SCORE;
            }
            if (!isMaximizingPlayer) {
                return { score: -score, bestMove: null };
            }
            return { score: score, bestMove: null };
        }
    
        let moves = get_all_moves(fen);
    
        // Score if the move fails to play due to probabilities
        let failBoard = new Chess(changeTurnFen(fen));
        let failResult = await this.alphaBeta(failBoard, depth - 1, alpha, beta, true, probabilities, !isMaximizingPlayer);
        let failScore = failResult.score;

        if (depth == this.initialDepth) {
            console.log("Fail score: ", failScore);
        }

        
        let bestEval = isMaximizingPlayer ? -Infinity : Infinity;
        let bestMove = null;
        let movesWithScores = [];
        if (moves.length == 0) {
            throw "No moves available " + fen;
        }
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
            let result = await this.processMove(board, move, depth, alpha, beta, isNoMoveBranch, probabilities, failScore, isMaximizingPlayer);
            let score = result.score;
            
            if (depth == this.initialDepth) {
                // console.log("  ** Score:", score, "Move:", toAlgebraic(move));
                movesWithScores.push({move: toAlgebraic(move), score: score});
            }
            
            if (isMaximizingPlayer) {
                if (score > bestEval) {
                    bestEval = score;
                    bestMove = move;
                }
                alpha = Math.max(alpha, score);
            } else {
                if (score < bestEval) {
                    bestEval = score;
                    bestMove = move;
                }
                beta = Math.min(beta, score);
            }
            
            if (beta <= alpha) {
                break; // Alpha-beta cut-off
            }
            
        }

        if (movesWithScores.length > 0) {
            movesWithScores.sort((a, b) => b.score - a.score);
        }

        if (this.debug && movesWithScores.length > 0) {
            // Sort moves by score
            for (let moveWithScore of movesWithScores) {
                console.log("  ** Score: ", moveWithScore.score, "Move: ", moveWithScore.move); 
            }
            
        }
        if (this.debug && depth == this.initialDepth) {
            // Sort all the lines in debugLines
            this.sortDebugLine(this.debugLines);
            console.log("Lines format: [Move, ExpectedScore, [Children], Fail score, SuccessScore, Prob]")
            console.log("Debug lines: ", this.debugLines);
            
        }

        if (movesWithScores.length > 0) {
            // See if there are several top moves with the same score.
            let topScore = movesWithScores[0].score;
            let topMoves = [];
            for (let moveWithScore of movesWithScores) {
                if (moveWithScore.score == topScore) {
                    topMoves.push(moveWithScore.move);
                } else {
                    break;
                }
            }
            if (topMoves.length > 1) {
                // Use stockfish to pick the best move.
                let result = await this.stockfish.getBestMove(board.fen(), 8, 1, board, probabilities);
                let moves = result.moves;
                for (let move of moves) {
                    move = toAlgebraic(move);
                    if (topMoves.includes(move)) {
                        console.log("Many equal moves. Used stockfish to pick: ", move);
                        bestMove = move;
                        break;
                    }
                }
            }
        }

        return { score: bestEval, bestMove: bestMove };
        
    }

    sortDebugLine(currentLine) {
        currentLine.sort((a, b) => b[1] - a[1]);
        for (let line of currentLine) {
            if (line[2].length > 0) {
                this.sortDebugLine(line[2]);
            }
        }
    }

    async processMove(board, move, depth, alpha, beta, isNoMoveBranch, probabilities, failScore, isMaximizingPlayer) {
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
        successScore = await this.alphaBeta(board, depth - 1, alpha, beta, isNoMoveBranch, probabilities, !isMaximizingPlayer);
        successScore = successScore.score;
        //successScore = -successScore;
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
        let result = await this.stockfish.getBestMove(board.fen(), this.evalDepth, 1, board, probabilities);
        return result.scores[0]; 
    }

    getBestMove(fen, callback, config) {
        // Config: probabilities, depth, evalDepth
        console.log("getBestMove", fen, config);
        if (this.lastGetBestMoveParams.fen == fen && this.lastGetBestMoveParams.depth == config.depth && this.lastGetBestMoveParams.evalDepth == config.evalDepth) {
            console.log("Returning cached value");
            callback(this.lastGetBestMoveReturnValue);
            return;
        }
        
        this.debugLines = [];
        this.initialDepth = config.depth
        this.evalDepth = config.evalDepth;
        let board = new Chess(fen);
        this.alphaBeta(board, config.depth, -Infinity, Infinity, false, config.probabilities, true).then((result) => {
            console.log("Best move: ", result.bestMove, " with score: ", result.score);
            let returnValue = {"move":chessMoveToIndices(result.bestMove), "score":result.score};
            this.lastGetBestMoveParams = {'fen':fen, 'depth':config.depth, 'evalDepth':config.evalDepth };
            this.lastGetBestMoveReturnValue = returnValue;
            callback(returnValue);
        });
    }
    // ~50 sec for 3 depth starting pos, 3 eval depth (minmax)
    // ~14 sec for 3 depth starting pos, 3 eval depth (alpha-beta) [might have had bugs]
    // ~20 sec for 3 depth starting pos, 3 eval depth (alpha-beta)
    // ~10 sec for 4 depth starting pos, 2 eval depth (alpha-beta)
}