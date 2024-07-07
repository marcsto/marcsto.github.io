// Copyright Marc Stogaitis 2024. All Rights Reserved.

function showWinner(result) {
    const resultAnimation = document.getElementById('resultAnimation');
    const resultMessage = document.getElementById('resultMessage');
    const status = document.getElementById('winner');

    resultAnimation.classList.remove('hidden', 'white-wins', 'black-wins', 'draw');

    switch(result) {
        case 'w':
            resultMessage.textContent = 'White Wins!';
            resultAnimation.classList.add('white-wins');
            status.textContent = 'White Wins!';
            break;
        case 'b':
            resultMessage.textContent = 'Black Wins!';
            resultAnimation.classList.add('black-wins');
            status.textContent = 'Black Wins!';
            break;
        case 'draw':
            resultMessage.textContent = 'Draw!';
            resultAnimation.classList.add('draw');
            status.textContent = 'Draw!';
            break;
    }

    setTimeout(() => {
        resultAnimation.classList.add('hidden');
    }, 3000);  // Hide the animation after 3 seconds
}