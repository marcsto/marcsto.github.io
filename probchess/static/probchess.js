
function probMove(data) {
    var fen = data.fen;
    var startRow = data.startRow;
    var startCol = data.startCol;
    var endRow = data.endRow;
    var endCol = data.endCol;
    var probabilities = data.probabilities;

    var board = new Chess(fen);

    // Convert the move to UCI format
    var move = convertToMove(startRow, startCol, endRow, endCol);
    var moveHuman = board.move(move);

    var statusText = "";
    var isIllegal = false;
    var played = 0;
    var newFen = fen;
    var nextTurn = board.turn();
    if (moveHuman) {
        // Get the probability of the destination square
        var destProb = probabilities[endRow][endCol];

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
        'turn': nextTurn
    };
}

function convertToMove(startRow, startCol, endRow, endCol) {
    console.log('Converting ' + startRow + ':' + startCol + '  ' + endRow + ':' + endCol);
    startRow = 7 - startRow;
    endRow = 7 - endRow;

    var startSquare = String.fromCharCode(97 + startCol) + (startRow + 1);
    var endSquare = String.fromCharCode(97 + endCol) + (endRow + 1);
    console.log('Converted to ' + startSquare + '  ' + endSquare);

    return { from: startSquare, to: endSquare };
}

function removeEnPassant(fen) {
    let fenParts = fen.split(' ');
    fenParts[3] = '-';
    return fenParts.join(' ');
}