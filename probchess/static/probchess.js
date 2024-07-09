// Copyright Marc Stogaitis 2024. All Rights Reserved.

/**
 * Probabilistic chess.
 * https://marc.ai/probchess
 */

/**
 * Play a probabilistic move.
 * 
 */
function probMove(data) {
    var fen = data.fen;
    var startRow = data.startRow;
    var startCol = data.startCol;
    var endRow = data.endRow;
    var endCol = data.endCol;
    var probabilities = data.probabilities;
    if (get_winner(fen)) {
        return {
            'fen': fen,
            'probabilities': probabilities,
            'played': 0,
            'status': 'Game is over. No moves can be made.',
            'move': null,
            'is_illegal': true,
            'turn': null,
            'winner': get_winner(fen)
        };
    }
    var board = new Chess(fen);

    // Convert the move to UCI format
    var move = convertToChessJsMove(startRow, startCol, endRow, endCol, board);
    var moveObj = board.move(move, {'legal':false, verbose: true});

    var statusText = "";
    var isIllegal = false;
    var played = 0;
    var newFen = fen;
    var nextTurn = board.turn();
    if (moveObj) {
        // Get the probability of the destination square
        var destProb = probabilities.getProb(moveObj) //probabilities[endRow][endCol];
        console.log('Destination probability: ' + destProb);

        // Play the move if a random number is less than the destination square's probability
        if (Math.random() < destProb) {
            statusText = 'Move ' + moveObj.san + ' succeeded! :)';
            played = 1;
            newFen = board.fen();
        } else {
            statusText = 'Unlucky. Move ' + moveObj.san + ' failed. Skipping turn.';
            board.undo();
            newFen = board.fen();
            newFen = changeTurnFen(fen);
        }
    } else {
        statusText = 'Move is illegal! Try again.';
        isIllegal = true;
        console.log(statusText);
    }

    return {
        'fen': newFen,
        'probabilities': probabilities,
        'played': played,
        'status': statusText,
        'move': moveObj ? moveObj.san : null,
        'is_illegal': isIllegal,
        'turn': nextTurn,
        'winner': get_winner(newFen)
    };
}

function get_winner(fen) {
    /* A game is over when there are no kings on the board.

         Returns: 
            null: No winner
            'w': White wins
            'b': Black wins
    */
    // See if there's a king on the fen
    fen = fen.split(' ')[0];
    if (fen.indexOf('K') === -1) {
        return 'b';
    } else if (fen.indexOf('k') === -1) {
        return 'w';
    }
    return null;

}

function get_turn_from_fen(fen) {
    /* Get the current turn from the FEN string 
    */
    var fenParts = fen.split(' ');
    return fenParts[1];
}

function generateFensForAllMoves(fen) {
    /* Generates a list of FEN notation for all moves
    */

    let all_moves = get_all_moves(fen);
    var fens = [];
    for (var i = 0; i < all_moves.length; i++) {
        var board = new Chess(fen);
        result = board.move(all_moves[i], {'legal':false});
        if (!result) {
            throw 'Move failed: ' + all_moves[i];
        }
        fens.push(board.fen());
    }
    // Also include the current fen but the the turns reversed.
    // This is for the case where a move failed due to probabilities.
    var board = new Chess(fen);
    const currentTurn = board.turn();
    if (currentTurn === 'w') {
        fen = fen.replace(' w ', ' b ');
    } else {
        fen = fen.replace(' b ', ' w ');
    }
    fens.push(fen);
    return [fens, all_moves];
}

function convertToChessJsMove(startRow, startCol, endRow, endCol, board) {
    /* Converts from board click indices to start square, end square 
    
       ex: 6 4 5 4 -> { from: 'e2', to: 'e3'}
    */
    console.log('Converting ' + startRow + ':' + startCol + '  ' + endRow + ':' + endCol);
    startRow = 7 - startRow;
    endRow = 7 - endRow;

    var startSquare = String.fromCharCode(97 + startCol) + (startRow + 1);
    var endSquare = String.fromCharCode(97 + endCol) + (endRow + 1);
    
    result = { from: startSquare, to: endSquare };
    // Handle promotion by adding promotion: 'q' if the move is a promotion
    // TODO: Handle promotions to other pieces.
    if (board.get(startSquare).type === 'p' && (endRow === 0 || endRow === 7)) {
        result['promotion'] = 'q';
    }

    console.log('Converted to ' + result);
    return result;
}

function is_pseudo_legal(move, board) {
    /* Check if a move is pseudo-legal (i.e. correct move ignoring checks) */
    all_moves = board.moves({'legal':false, verbose: true})

    for (var i = 0; i < all_moves.length; i++) {
        if (all_moves[i].from === move.from && all_moves[i].to === move.to) {
            return true;
        }
    }
    return false;
}

function get_all_moves(fen, verbose=true) {
    /* Get all moves for the current player (including moves that would put your king in check as those are allowed in this game) */
    if (get_winner(fen)) {
        return [];
    }
    var board = new Chess(fen);
    if (verbose) {
        return board.moves({'legal':false, 'verbose': true});
    } else {
        return board.moves({'legal':false});
    }
}

function removeEnPassant(fen) {
    /* Removes the en-passant square from the FEN string */
    let fenParts = fen.split(' ');
    fenParts[3] = '-';
    return fenParts.join(' ');
}

/**
 * A class that represents a probability board. This is a board where each square has a probability of being moved to.
 * 
 * @param {Array} probabilities A 2D array of probabilities. The first index is the row and the 
 * second index is the column. If null, the probabilities are randomly initialized.
 * @param {Number} kingMoveProb The probability of moving the king. If null, the king's probability is randomly initialized.
 * Allows for a variant of prob chess where king moves always succeed.
 */
class Probabilities {
    constructor(probabilities = null, kingMoveProb = null) {
        if (probabilities == null) {
            this.initializeProbabilities();
        } else {
            this.probabilities = probabilities;
        }
        this.kingMoveProb = kingMoveProb;
        this.doubleKingMoveProb = false;
    }

    initializeProbabilities() {
        this.probabilities = Array.from({ length: 8 }, () => 
            Array.from({ length: 8 }, () => Math.min(Math.max(Math.random(), 0.25), 0.99))
        );
        // Make sure the king's starting squares have at least a 10% probbility
        this.probabilities[0][4] = Math.max(this.probabilities[0][4], 0.2);
        this.probabilities[7][4] = Math.max(this.probabilities[7][4], 0.2);
    }

    /**
     * Sets the king's move probability. Allows for a variant of prob chess where king moves always succeed.
     * When set, we use this probability when a king moves and ignore the board's probabilities.
     * 
     * @param {number} newProb the king's move probability, or null if you want to use the board's probabilities.
     */
    setKingMoveProb(newProb) { 
        this.kingMoveProb = newProb;
    }

    setKingMoveProbDoubles(enable) {
        this.doubleKingMoveProb = enable;
        if (enable) {
            this.setKingMoveProb(null);
        }
    }

    /**
     * Get the probability of successfully moving to the destination square.
     * 
     * @param {Object} move The move to get the probability of. The format is a verbose move from chess.js i.e. {from: 'e2', to: 'e4', piece: 'p' ...}
     * @returns The probability of successfully moving to to the desination square in the move
     */
    getProb(move) {
        if (this.kingMoveProb != null && (move.piece === 'k')) {
            return this.kingMoveProb;
        }
        const moveIndices = chessMoveToIndices(move);
        let prob = this.probabilities[moveIndices.endRow][moveIndices.endCol];
        if (this.doubleKingMoveProb && move.piece === 'k') {
            prob = Math.min(prob * 2, 1);
        }
        return prob;
    }

    getProbFromStrMove(move, board) {
        let moveObj = stockfishMoveToJsChessMove(move);
        moveObj['piece'] = board.get(moveObj.from).type;
        return this.getProb(moveObj);
    }

}

// Test Positions
// Initial: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
// Two Kings: k7/8/K7/8/8/8/8/8 w - - 0 1
// Castle: k7/8/8/8/8/8/8/4K2R w K - 0 1
// Promotion: k7/7P/8/8/8/8/8/7K w - - 0 1
// Checkmate: r3q1k1/2b2pQp/pp3np1/2p2N2/3pP3/3P1NP1/PP3P2/R1B2RK1 b - - 2 19
// Pre-Checkmate: r3q1k1/2b2p1p/pp3npQ/2p2N2/3pP3/3P1NP1/PP3P2/R1B2RK1 w - - 1 19
// Eat queen easy: k6q/8/7Q/8/8/8/8/7K w - - 0 1
// Test: r3k1nr/p1p1Rpp1/7p/3P4/8/3b4/PPP2PPP/R1B3K1 b kq - 0 15
// Promotion: '3qkb1r/1QP1nppp/2p1p3/6N1/N2PP3/3B4/1P3PPP/2B2RK1 w k - 0 11'
// Checkmate in 1 (5 options): k7/6QR/8/8/8/8/8/7K w - - 0 1
// Promotion simple: k7/7P/8/8/8/8/8/7K w - - 0 1