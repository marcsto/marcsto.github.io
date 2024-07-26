// Copyright Marc Stogaitis 2024. All Rights Reserved.

const pieces = {
    'r': 'static/images/pieces/Chess_rdt45.svg',
    'n': 'static/images/pieces/Chess_ndt45.svg',
    'b': 'static/images/pieces/Chess_bdt45.svg',
    'q': 'static/images/pieces/Chess_qdt45.svg',
    'k': 'static/images/pieces/Chess_kdt45.svg',
    'p': 'static/images/pieces/Chess_pdt45.svg',
    'R': 'static/images/pieces/Chess_rlt45.svg',
    'N': 'static/images/pieces/Chess_nlt45.svg',
    'B': 'static/images/pieces/Chess_blt45.svg',
    'Q': 'static/images/pieces/Chess_qlt45.svg',
    'K': 'static/images/pieces/Chess_klt45.svg',
    'P': 'static/images/pieces/Chess_plt45.svg'
};

let currentFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
//currentFEN = "k7/7P/8/8/8/8/8/7K w - - 0 1" // Promo white
// currentFEN = "k7/8/8/8/8/8/7p/K7 b - - 0 1" // Promo black
// let currentFEN = "r3kb1r/ppp1ppp1/7p/8/4pn2/8/PPPP1P1q/RNB1K1R1 b Qkq - 0 15"
//let currentFEN = "k7/8/K7/8/8/8/8/8 w - - 0 1";
//let currentFEN = "r3q1k1/2b2p1p/pp3npQ/2p2N2/3pP3/3P1NP1/PP3P2/R1B2RK1 w - - 1 19"
// let currentFEN = "k6Q/8/K7/8/8/8/8/8 w - - 0 1"; // Capture king

let lastClickedSquare = null;

function createChessboard(boardId, small=false) {
    const chessboard = document.getElementById(boardId);
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
            if (small) {
                prob.className = 'probability probability-small';
            } else {
                prob.className = 'probability';
            }
            
            const originalProb = (probabilities.probabilities[row][col] * 100).toFixed(0);
            prob.textContent = originalProb + '%';
            prob.dataset.originalProb = originalProb; // Add this line
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

function updateBoardFromFEN(fen, boardId='chessboard') {
            
    const chessboard = document.getElementById(boardId);
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

function createDice(containerId, big=false) {
    const faces = [
        { class: 'happy', emoji: '😊' },
        { class: 'sad', emoji: '😢' },
    ];

    const container = document.getElementById(containerId);

    for (let i = 0; i < 6; i++) {
        const face = faces[i % faces.length];
        const div = document.createElement('div');
        if (big) {
            div.className = `face-big ${face.class}`;
        } else {
            div.className = `face ${face.class}`;
        }
        
        div.textContent = face.emoji;
        container.appendChild(div);
    }
}

function rollDice(finalFaceType, diceId) {
    const dice = document.getElementById(diceId);

    // Remove the existing rolling classes to reset the animation
    dice.classList.remove('rolling-happy', 'rolling-sad');

    // Force reflow to reset the animation
    void dice.offsetWidth;

    // Add the appropriate rolling class based on the finalFaceType parameter
    if (finalFaceType === 1) {
        dice.classList.add('rolling-happy');
    } else {
        dice.classList.add('rolling-sad');
    }
}

// For the pribabilistic chips variant.
let chipUsedThisTurn = false;
function createChips(containerId, isWhite) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const chips = probabilities.getProbabilityChips(isWhite);
    if (!chips) {
        return;
    }
    chips.forEach(chip => {
        if (chip.count === 0) {
            return;
        }
        
        const chipElement = createSingleChip(isWhite, chip.probability);

        chipElement.onclick = () => {
            if (chipUsedThisTurn) {
                console.log('You can only use one chip per turn.');
                document.getElementById('status').textContent = 'You can only use one chip per turn.';
                return;
            }
            const side = get_turn_from_fen(currentFEN);
            if (side === 'w' && !isWhite || side === 'b' && isWhite) {
                console.log('Not your turn to play.');
                document.getElementById('status').textContent = 'Not your turn to play.';
                return;
            }
            chipUsedThisTurn = true;    
            useProbabilityChipWithUi(isWhite, chip);
        };

        const chipCount = document.createElement('div');
        chipCount.className = 'chip-count';
        chipCount.textContent = chip.count;
        chipElement.appendChild(chipCount);
        container.appendChild(chipElement);
    });
}

function createSingleChip(isWhite, probability, small=false) {
    const chipElement = document.createElement('div');
    chipElement.className = `chip ${isWhite ? 'white-chip' : 'black-chip'}`;
    if (small) {
        chipElement.classList.add('chip-small');
    }
    const chipProb = document.createElement('div');
    chipProb.textContent = `+${probability}%`;
    chipElement.appendChild(chipProb);
    return chipElement;
}

function useProbabilityChipWithUi(isWhite, chip) {
    temporarilyIncreaseProbabilities(chip.probability);
    probabilities.useProbabilityChip(isWhite, chip.probability);
    let containerId = isWhite ? 'whiteChips' : 'blackChips';
    createChips(containerId, isWhite);
}

function temporarilyIncreaseProbabilities(increaseProbability) {
    const squares = document.querySelectorAll('.square');
    squares.forEach(square => {
        const prob = square.querySelector('.probability');
        const currentProb = parseFloat(prob.textContent);
        const newProb = Math.min(100, currentProb + increaseProbability);

        // Create and animate the increase text
        const increase = document.createElement('div');
        increase.className = 'probability-increase';
        increase.textContent = `+${increaseProbability}%`;
        square.appendChild(increase);

        // Animate the increase text
        setTimeout(() => {
            increase.style.opacity = '1';
            increase.style.transform = 'translateY(-20px)';
        }, 10);

        // Remove the increase text after animation
        setTimeout(() => {
            increase.remove();
        }, 1100);

        prob.classList.add('probability-modified');
        // const probIncreateAmountSmallText = document.createElement('div');
        // probIncreateAmountSmallText.className = 'probability-increase-small';
        // probIncreateAmountSmallText.textContent = `+${increaseProbability}%`;
        // square.appendChild(probIncreateAmountSmallText);

        prob.textContent = `${newProb.toFixed(0)}%`;
    });
}

function resetProbabilitiesOnBoard() {
    chipUsedThisTurn = false;
    const squares = document.querySelectorAll('.square');
    squares.forEach(square => {
        const prob = square.querySelector('.probability');
        prob.textContent = `${prob.dataset.originalProb}%`;
        prob.classList.remove('probability-modified');
        // const probIncreateAmountSmallText = square.querySelector('.probability-increase-small');
        // if (probIncreateAmountSmallText) {
        //     probIncreateAmountSmallText.remove();
        // }
    });
}

function saveGameStateToLocalStorage() {
    const gameState = {
        currentFEN: currentFEN,
        gameHistory: gameHistory,
        probabilities: probabilities.toJson(),
        
        checkboxes: {},
        dropdowns: {}

        // UI State
        // aiwEnabled: document.getElementById('aiw').checked,
        // aibEnabled: document.getElementById('aib').checked,
        // aiStrengthW: document.getElementById('ai-strength-w').value,
        // aiStrengthB: document.getElementById('ai-strength-b').value,
        // kingSuccessVariant: document.getElementById('king-success-variants').value,
        // probVariant: document.getElementById('prob-variants').value,
    };

    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        gameState.checkboxes[checkbox.id] = checkbox.checked;
    });
    
    const dropdowns = document.querySelectorAll('select');
    dropdowns.forEach(dropdown => {
        gameState.dropdowns[dropdown.id] = dropdown.value;
    });
    localStorage.setItem('gameState', JSON.stringify(gameState));
}

function loadGameStateFromLocalStorage() {
    const gameState = JSON.parse(localStorage.getItem('gameState'));
    if (gameState) {
        currentFEN = gameState.currentFEN;
        gameHistory = gameState.gameHistory;
        probabilities = Probabilities.fromJson(gameState.probabilities);
        // document.getElementById('aiw').checked = gameState.aiwEnabled;
        // document.getElementById('aib').checked = gameState.aibEnabled;
        // document.getElementById('ai-strength-w').value = gameState.aiStrengthW;
        // document.getElementById('ai-strength-b').value = gameState.aiStrengthB;
        // document.getElementById('king-success-variants').value = gameState.kingSuccessVariant;
        // document.getElementById('prob-variants').value = gameState.probVariant;

        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        const dropdowns = document.querySelectorAll('select');

        checkboxes.forEach(checkbox => {
            if (gameState.checkboxes.hasOwnProperty(checkbox.id)) {
                checkbox.checked = gameState.checkboxes[checkbox.id];
            }
        });

        dropdowns.forEach(dropdown => {
            if (gameState.dropdowns.hasOwnProperty(dropdown.id)) {
                dropdown.value = gameState.dropdowns[dropdown.id];
            }
        });
    }
}

function loadBoardProbabilities() {
    const squares = document.querySelectorAll('.square');
    squares.forEach(square => {
        const prob = probabilities.getProbability(square.dataset.row, square.dataset.col);
        //const prob = square.querySelector('.probability');
        prob.textContent = `${prob.dataset.originalProb}%`;
    });
}

function initializeUiChangeEventListeners() {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    const dropdowns = document.querySelectorAll('select');

    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', saveGameStateToLocalStorage);
    });

    dropdowns.forEach(dropdown => {
        dropdown.addEventListener('change', saveGameStateToLocalStorage);
    });
}

function loadGameFromHistory(gameHistory) {
    // Clear the move history
    document.getElementById('chessTable').getElementsByTagName('tbody')[0].innerHTML = '';

    for (let i = 0; i < gameHistory.length; i++) {
        const historyObj = gameHistory[i];
        let moveTurn =  swapColor(turnFen(historyObj.fenAfter));
        addMoveToSidePanel(historyObj.humanMove, moveTurn, !historyObj.played, historyObj.fenAfter, historyObj.score, i);
    }
    // TODO: Handle probability chips.
}