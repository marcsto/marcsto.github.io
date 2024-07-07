// Copyright Marc Stogaitis 2024. All Rights Reserved.

let aiStockfish = null;
let aiMonteCarlo = null;
let aiAlphaBetaEm = null;

function playAiMove(difficulty, fen, probabilities, onAiMove) {
    if (difficulty === "moderate") {
        if (aiStockfish === null) {
            aiStockfish = new StockfishAi();
        }
        aiStockfish.getBestMove(fen, onAiMove);
    } else if (difficulty === "hard") {
        if (aiMonteCarlo === null) {
            aiMonteCarlo = new MonteCarloAi();
        }
        aiMonteCarlo.getBestMove(fen, probabilities, onAiMove, depth=10);
    } else if (difficulty === "veryhard" || difficulty === "expert") {
        if (aiAlphaBetaEm === null) {
            aiAlphaBetaEm = new AlphaBetaEmAi();
        }
        let depth = 2;
        let evalDepth = 3;
        if (difficulty === "expert") {
            depth = 4;
            evalDepth = 2;
        }
        aiAlphaBetaEm.getBestMove(fen, probabilities, onAiMove, depth=depth, evalDepth=evalDepth);    
    
    } else {
        console.error('Unknown difficulty:', difficulty);
        throw new Error('Unknown difficulty');
    }
}