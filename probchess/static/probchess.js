
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
    var move = convertToMove(startRow, startCol, endRow, endCol);
    var moveHuman = board.move(move, {'legal':false, verbose: true});

    var statusText = "";
    var isIllegal = false;
    var played = 0;
    var newFen = fen;
    var nextTurn = board.turn();
    if (moveHuman) {
        // Get the probability of the destination square
        var destProb = probabilities[endRow][endCol];
        console.log('Destination probability: ' + destProb);

        // Play the move if a random number is less than the destination square's probability
        if (Math.random() < destProb) {
            statusText = 'Move ' + moveHuman.san + ' succeeded! :)';
            played = 1;
            newFen = board.fen();
        } else {
            statusText = 'Unlucky. Move ' + moveHuman.san + ' failed. Skipping turn.';
            board.undo();
            
            newFen = board.fen();
            const currentTurn = board.turn();
            if (currentTurn === 'w') {
                newFen = newFen.replace(' w ', ' b ');
            } else {
                newFen = newFen.replace(' b ', ' w ');
            }
            // Remove en-passant since the game engine won't think we have legal moves with it.
            newFen = removeEnPassant(newFen);
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
        'move': moveHuman ? moveHuman.san : null,
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

function convertToMove(startRow, startCol, endRow, endCol) {
    /* Converts from board click indices to start square, end square 
    
       ex: 6 4 5 4 -> { from: 'e2', to: 'e3'}
    */
    console.log('Converting ' + startRow + ':' + startCol + '  ' + endRow + ':' + endCol);
    startRow = 7 - startRow;
    endRow = 7 - endRow;

    var startSquare = String.fromCharCode(97 + startCol) + (startRow + 1);
    var endSquare = String.fromCharCode(97 + endCol) + (endRow + 1);
    console.log('Converted to ' + startSquare + '  ' + endSquare);

    return { from: startSquare, to: endSquare };
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

// Test Positions
// Initial: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
// Two Kings: k7/8/K7/8/8/8/8/8 w - - 0 1
// Castle: k7/8/8/8/8/8/8/4K2R w K - 0 1
// Promotion: k7/7P/8/8/8/8/8/7K w - - 0 1
// Checkmate: r3q1k1/2b2pQp/pp3np1/2p2N2/3pP3/3P1NP1/PP3P2/R1B2RK1 b - - 2 19
// Pre-Checkmate: r3q1k1/2b2p1p/pp3npQ/2p2N2/3pP3/3P1NP1/PP3P2/R1B2RK1 w - - 1 19
// Eat queen easy: k6q/8/7Q/8/8/8/8/K7 w - - 0 1
// Test: r3k1nr/p1p1Rpp1/7p/3P4/8/3b4/PPP2PPP/R1B3K1 b kq - 0 15