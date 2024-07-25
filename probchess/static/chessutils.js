// Copyright Marc Stogaitis 2024. All Rights Reserved.

const WIN_SCORE = 10000;
const MATE_SCORE = 9000; // Not as good since you still need to capture the king.

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

/**
 * Converts a chess.js move object to UI board move indices.
 * 
 * @param {*} move  The move to convert. The format is either 'e2e4' or an object {from: 'e2', to: 'e4'}
 * @returns Indices suitable to play on a UI board e.g. { startRow: 6, startCol: 4, endRow: 4, endCol: 4 } 
 */
function chessMoveToIndices(move) {
    // e.g. e2e4 -> { startRow: 6, startCol: 4, endRow: 4, endCol: 4 } 

    if (typeof move !== 'string') {
        // If the move was passed as an object, convert it.
        let movestr = move.from + move.to;
        if (move.promotion) {
            movestr += move.promotion;
        }
        move = movestr;
    }

    const startPos = move.slice(0, 2);
    const endPos = move.slice(2, 4);

    const start = _chessNotationToIndex(startPos);
    const end = _chessNotationToIndex(endPos);

    // Handle promption
    if (move.length === 5) {
        return { startRow: start.row, startCol: start.column, endRow: end.row, endCol: end.column, promotion: move[4] };
    }

    return { startRow: start.row, startCol: start.column, endRow: end.row, endCol: end.column };
}

/**
 * Convert chess indices (used on the board UI) to a move string in long algebraic notation (e.g. e2e4) used in chess programs.
 * 
 * @param {} move Dictiary with the form {startRow: 6, startCol: 4, endRow: 4, endCol: 4}, or a string in the form 'e2e4', or a chess.js move object.
 * @returns string move in the form 'e2e4'
 */
function toAlgebraic(move) {
    if (!move) {
        return null;
    }
    // For when it's already in the format 'e2e4'
    if (typeof move === 'string') {
        return move;
    }
    // For the chess.js format of 'from: 'h1', to: 'h8'...)
    if ('from' in move) {
        if (move.promotion) {
            return move.from + move.to + move.promotion;
        }
        return move.from + move.to;
    }

    // For the format {startRow: 6, startCol: 4, endRow: 4, endCol: 4}
    const start = String.fromCharCode('a'.charCodeAt(0) + move.startCol) + (8 - move.startRow);
    const end = String.fromCharCode('a'.charCodeAt(0) + move.endCol) + (8 - move.endRow);
    // Handle promotion
    if (move.promotion) {
        return start + end + move.promotion;
    }

    return start + end;
}

function swapColor(c) {
    return c === 'w' ? 'b' : 'w'
}

function kingCaptureMoves(board) {
    // TODO: Maybe see if there's a king on the board.
    try {
        let moves = board.moves({'legal':false, 'verbose': true});
        let kingCaptureMoves = [];
        for (let i = 0; i < moves.length; i++) {
            let move = moves[i];
            if (move.captured === 'k' || move.captured === 'K') {
                kingCaptureMoves.push(move);
            }
        }
        return kingCaptureMoves;
    } catch (e) {
        console.log("Error getting king capture moves: ", e);
        console.log("Board: ", board.fen());
        throw e;
    }
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

function deepEqual(obj1, obj2) {
    // Check if both objects are the same reference
    if (obj1 === obj2) return true;

    // Check if both are not objects or either one is null
    if (typeof obj1 !== 'object' || obj1 === null ||
        typeof obj2 !== 'object' || obj2 === null) {
        return false;
    }

    // Get the keys of both objects
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    // Check if they have the same number of keys
    if (keys1.length !== keys2.length) return false;

    // Check if all keys and values are equal
    for (let key of keys1) {
        if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
            return false;
        }
    }

    return true;
}

function inCheck(board, turn) {
    return board.king_attacked(turn)
}