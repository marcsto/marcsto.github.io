function showResult(result) {
    const resultAnimation = document.getElementById('resultAnimation');
    const resultMessage = document.getElementById('resultMessage');

    resultAnimation.classList.remove('hidden', 'white-wins', 'black-wins', 'draw');

    switch(result) {
        case 'white-wins':
            resultMessage.textContent = 'White Wins!';
            resultAnimation.classList.add('white-wins');
            break;
        case 'black-wins':
            resultMessage.textContent = 'Black Wins!';
            resultAnimation.classList.add('black-wins');
            break;
        case 'draw':
            resultMessage.textContent = 'Draw!';
            resultAnimation.classList.add('draw');
            break;
    }

    setTimeout(() => {
        resultAnimation.classList.add('hidden');
    }, 3000);  // Hide the animation after 3 seconds
}