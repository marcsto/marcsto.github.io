
function stockfishMoveToJsChessMove(move) {
    // Convert a single position from stockfish notation to chess.js notation
    // e.g. e2e4 -> { from: 'e2', to: 'e4' } 
    // e.g. e7e8q -> { from: 'e7', to: 'e8', promotion: 'q' }

    // If it's not a string, just return it as it may be a move object.
    if (typeof move !== 'string') {
        if (!move.from) {
            throw 'Invalid move object: ' + move;
        }
        return move;
    }

    const startPos = move.slice(0, 2);
    let  endPos = move.slice(2);

    let promotion = null;
    if (endPos.length === 3) {
        promotion = endPos[2];
        endPos = endPos.slice(0, 2);
        return { from: startPos, to: endPos, promotion: promotion };
    }
    return { from: startPos, to: endPos };
}

function chessMoveToIndices(move) {
    // Convert a single position from chess notation to indices
    // e.g. e2e4 -> { startRow: 6, startCol: 4, endRow: 4, endCol: 4 } 

    if (typeof move !== 'string') {
        // If the move was passed as an object, convert it.
        move = move.from + move.to;
    }

    const startPos = move.slice(0, 2);
    const endPos = move.slice(2);

    const start = _chessNotationToIndex(startPos);
    const end = _chessNotationToIndex(endPos);

    return { startRow: start.row, startCol: start.column, endRow: end.row, endCol: end.column };
}

function swapColor(c) {
    return c === 'w' ? 'b' : 'w'
}

function kingCaptureMoves(board) {
    // TODO: Maybe see if there's a king on the board.
    let moves = board.moves({'legal':false, 'verbose': true});
    let kingCaptureMoves = [];
    for (let i = 0; i < moves.length; i++) {
        let move = moves[i];
        if (move.captured === 'k' || move.captured === 'K') {
            kingCaptureMoves.push(move);
        }
    }
    return kingCaptureMoves;
}

function getWinnerFen(fen) {
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

function changeTurnFen(fen) {
    const fenParts = fen.split(' ');
    const turn = fenParts[1];
    if (turn === 'w') {
        fenParts[1] = 'b';
    } else {
        fenParts[1] = 'w';
    }
    // Remove en-passant square
    fenParts[3] = '-';
    return fenParts.join(' ');
}

function turnFen(fen) {
    const fenParts = fen.split(' ');
    const turn = fenParts[1];
    return turn;
}

function _chessNotationToIndex(pos) {
    const column = pos.charCodeAt(0) - 'a'.charCodeAt(0);
    const row = 8 - parseInt(pos[1]);
    return { row: row, column: column };
}