
const pieces = {
    'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
    'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
    'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
    'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
    'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
    'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg'
};

let currentFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
//currentFEN = "k7/7P/8/8/8/8/8/7K w - - 0 1" // Promo white
// currentFEN = "k7/8/8/8/8/8/7p/K7 b - - 0 1" // Promo black
// let currentFEN = "r3kb1r/ppp1ppp1/7p/8/4pn2/8/PPPP1P1q/RNB1K1R1 b Qkq - 0 15"
//let currentFEN = "k7/8/K7/8/8/8/8/8 w - - 0 1";
//let currentFEN = "r3q1k1/2b2p1p/pp3npQ/2p2N2/3pP3/3P1NP1/PP3P2/R1B2RK1 w - - 1 19"

let lastClickedSquare = null;

function createChessboard() {
    const chessboard = document.getElementById('chessboard');
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.className = 'square';
            square.dataset.row = row;
            square.dataset.col = col;
            if ((row + col) % 2 === 0) {
                square.classList.add('white');
            } else {
                square.classList.add('black');
            }

            const prob = document.createElement('div');
            prob.className = 'probability';
            prob.textContent = (probabilities.probabilities[row][col] * 100).toFixed(0) + '%';
            square.appendChild(prob);
            chessboard.appendChild(square);

            if (col == 0) {
                const rowLabel = document.createElement('div');
                rowLabel.className = 'row-label';
                rowLabel.textContent = 8 - row;
                square.appendChild(rowLabel);
            }
            if (row == 0) {
                const colLabel = document.createElement('div');
                colLabel.className = 'col-label';
                colLabel.textContent = String.fromCharCode(97 + col);
                square.appendChild(colLabel);
            }
        }
    }

    updateBoardFromFEN(currentFEN);
    addDragAndDropListeners();
    addClickListeners();
}

function addDragAndDropListeners() {
    const squares = document.querySelectorAll('.square');
    squares.forEach(square => {
        square.addEventListener('dragover', handleDragOver);
        square.addEventListener('drop', handleDrop);
    });

    const pieces = document.querySelectorAll('.piece');
    pieces.forEach(piece => {
        piece.addEventListener('dragstart', handleDragStart);
    });
}

function handleDragStart(event) {
    event.dataTransfer.setData('text/plain', event.target.dataset.piece);
    event.dataTransfer.setData('startRow', event.target.dataset.startRow);
    event.dataTransfer.setData('startCol', event.target.dataset.startCol);
}

function handleDragOver(event) {
    event.preventDefault();
}

function handleDrop(event) {
    console.log('handleDrop');
    event.preventDefault();
    const piece = event.dataTransfer.getData('text/plain');
    const startRow = event.dataTransfer.getData('startRow');
    const startCol = event.dataTransfer.getData('startCol');
    const endRow = event.target.closest('.square').dataset.row;
    const endCol = event.target.closest('.square').dataset.col;

    const pieceImg = document.querySelector(`img[data-piece='${piece}'][data-start-row='${startRow}'][data-start-col='${startCol}']`);
    const targetSquare = document.querySelector(`.square[data-row='${endRow}'][data-col='${endCol}']`);

    // Remove any existing piece in the target square
    const existingPiece = targetSquare.querySelector('.piece');
    if (existingPiece) {
        existingPiece.remove();
    }

    targetSquare.appendChild(pieceImg);

    pieceImg.dataset.startRow = endRow;
    pieceImg.dataset.startCol = endCol;

    sendMoveToServer(startRow, startCol, endRow, endCol, currentFEN);
}

function addClickListeners() {
    const pieces = document.querySelectorAll('.piece');
    pieces.forEach(piece => {
        piece.addEventListener('click', handlePieceClick);
    });

    const squares = document.querySelectorAll('.square');
    squares.forEach(square => {
        square.addEventListener('click', handleSquareClick);
    });
}

function handlePieceClick(event) {
    //handleSquareClick(event);
}

function handleSquareClick(event) {
    let clickedSquare = event.target.closest('.square');
    let clickedPiece = clickedSquare.querySelector('.piece');

    if (lastClickedSquare == null) {
        turn = currentFEN.split(' ')[1];
        if (turn === 'w' && clickedPiece.dataset.piece === clickedPiece.dataset.piece.toLowerCase()
            || turn === 'b' && clickedPiece.dataset.piece === clickedPiece.dataset.piece.toUpperCase()) {
            console.log('Not your turn to play.');
            document.getElementById('status').textContent = 'Not your turn to play.';
            return;
        }

        lastClickedSquare = clickedSquare;
        if (!clickedPiece) {
            console.log('No piece in the selected square. Ignoring move.');
            lastClickedSquare = null;
            return;
        }
        clickedPiece.classList.add('piece-selected');
    } else if (lastClickedSquare == clickedSquare) {
        console.log('Deselecting previously selected piece');
        let lastClickedPiece = lastClickedSquare.querySelector('.piece');
        lastClickedPiece.classList.remove('piece-selected');
        lastClickedSquare = null;
    } else {
        const startRow = lastClickedSquare.dataset.row;
        const startCol = lastClickedSquare.dataset.col;
        const endRow = clickedSquare.dataset.row;
        const endCol = clickedSquare.dataset.col;

        //const targetSquare = document.querySelector(`.square[data-row='${endRow}'][data-col='${endCol}']`);

        // Remove any existing piece in the target square
        const existingPiece = clickedSquare.querySelector('.piece');
        if (existingPiece) {
            existingPiece.remove();
        }
        lastClickedPiece = lastClickedSquare.querySelector('.piece');
        clickedSquare.appendChild(lastClickedPiece);

        lastClickedPiece.dataset.startRow = endRow;
        lastClickedPiece.dataset.startCol = endCol;

        // clicked_square.classList.add('square-selected');
        lastClickedSquare = null;
        let score = null;
        if (event.score) {
            score = event.score;
        }
        sendMoveToServer(startRow, startCol, endRow, endCol, currentFEN, score);
        
    }
}

function updateBoardFromFEN(fen) {
            
    const chessboard = document.getElementById('chessboard');
    const squares = chessboard.querySelectorAll('.square');
    const board = new Chess(fen);
    
    const rows = ['8', '7', '6', '5', '4', '3', '2', '1'];
    const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    squares.forEach(square => {
        square.classList.remove('square-selected');
        const row = square.dataset.row;
        const col = square.dataset.col;
        // Convert from our row col to chess.js row col.
        const squareName = cols[col] + rows[row];
        // The format of desired piece is {type: 'r', color: 'b'}
        let desiredPiece = board.get(squareName);
        const existingPiece = square.querySelector('.piece');
        // Remove piece-selected class from all pieces
        if (existingPiece) {
            existingPiece.classList.remove('piece-selected');
        }
        if (desiredPiece == null) {
            // Remove any existing piece in the square
            if (existingPiece) {
                existingPiece.remove();
            }
        } else {
            side = desiredPiece.color
            desiredPiece = desiredPiece.type
            if (side === 'w') {
                desiredPiece = desiredPiece.toUpperCase();
            }

            if (existingPiece) {
                if (existingPiece.dataset.piece !== desiredPiece) {
                    // Replace the existing piece with the desired piece
                    existingPiece.src = pieces[desiredPiece];
                    existingPiece.dataset.piece = desiredPiece;
                }
            } else {
                // Add the desired piece to the square
                const pieceImg = document.createElement('img');
                pieceImg.src = pieces[desiredPiece];
                pieceImg.className = 'piece';
                pieceImg.draggable = true;
                pieceImg.dataset.piece = desiredPiece;
                pieceImg.dataset.startRow = row;
                pieceImg.dataset.startCol = col;
                square.appendChild(pieceImg);
            }
        }                
    });

    highlightPiecesToPlay(board.turn() === 'b');
    addDragAndDropListeners();
    addClickListeners();
}

function highlightPiecesToPlay(black_turn) {
    const pieces = document.querySelectorAll('.piece');
    pieces.forEach(piece => {
        if (black_turn) {
            if (piece.dataset.piece === piece.dataset.piece.toLowerCase()) {
                piece.classList.add('piece-turn-to-play');
            } else {
                piece.classList.remove('piece-turn-to-play');
            }
        } else {
            if (piece.dataset.piece === piece.dataset.piece.toUpperCase()) {
                piece.classList.add('piece-turn-to-play');
            } else {
                piece.classList.remove('piece-turn-to-play');
            }
        }
    });
}