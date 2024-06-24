function showWinner(result) {
    const resultAnimation = document.getElementById('resultAnimation');
    const resultMessage = document.getElementById('resultMessage');
    const status = document.getElementById('winner');

    resultAnimation.classList.remove('hidden', 'white-wins', 'black-wins', 'draw');

    switch(result) {
        case 'w':
            resultMessage.textContent = 'White Wins!';
            resultAnimation.classList.add('white-wins');
            status.textContent = 'White wins!';
            status.style.color = 'green';

            break;
        case 'b':
            resultMessage.textContent = 'Black Wins!';
            resultAnimation.classList.add('black-wins');
            status.textContent = 'Black wins!';
            status.style.color = 'green';
            break;
        case 'draw':
            resultMessage.textContent = 'Draw!';
            resultAnimation.classList.add('draw');
            status.textContent = 'Draw!';
            status.style.color = 'green';
            break;
    }

    setTimeout(() => {
        resultAnimation.classList.add('hidden');
    }, 3000);  // Hide the animation after 3 seconds
}