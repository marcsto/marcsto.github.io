// Copyright Marc Stogaitis 2024. All Rights Reserved.

function showWinner(result) {
    const resultAnimation = document.getElementById('resultAnimation');
    const resultMessage = document.getElementById('resultMessage');
    const status = document.getElementById('winner');

    resultAnimation.classList.remove('hidden', 'white-wins', 'black-wins', 'draw');
    let overlayTitle = '';
    switch(result) {
        case 'w':
            resultMessage.textContent = 'White Wins!';
            resultAnimation.classList.add('white-wins');
            status.textContent = 'White Wins!';
            overlayTitle = 'White Wins!';
            break;
        case 'b':
            resultMessage.textContent = 'Black Wins!';
            resultAnimation.classList.add('black-wins');
            status.textContent = 'Black Wins!';
            overlayTitle = 'Black Wins!';
            break;
        case 'draw':
            resultMessage.textContent = 'Draw!';
            resultAnimation.classList.add('draw');
            status.textContent = 'Draw!';
            overlayTitle = 'Draw!';
            break;
    }

    setTimeout(() => {
        resultAnimation.classList.add('hidden');
    }, 3000);  // Hide the animation after 3 seconds

    // Show the overlay
    let aiWhite = document.getElementById('aiw').checked;
    let aiBlack = document.getElementById('aib').checked;
    // If the player was palying against the AI, a custom message.
    
    if ((aiWhite || aiBlack) && !(aiWhite && aiBlack)) {
        const playerWon = (aiBlack && result === 'w') || (aiWhite && result === 'b');
        if (playerWon) {
            overlayTitle = 'Congratulations, You Beat Stockfish at Probabilistic Chess!';
        } else {
            overlayTitle = 'Stockfish Wins. Better luck next time!';
        }
        //showRewards(playerWon)
    }
    document.getElementById('replay-title').textContent = overlayTitle;
    let replaySequence = gameHistory.slice(-4);
    showReplay([replaySequence]);
    showFeedbackForm();

}