


function showReplay(replaySequences) {
  console.log('showReplay', replaySequences);
  document.getElementById('overlay').classList.remove('hidden');
  
  createReplayBoards(replaySequences);
  playAllSequences(replaySequences);
}

function createReplayBoards(replaySequences) {
  const replayBoards = document.getElementById('replay-boards');
  

  replayBoards.innerHTML = '';
  replaySequences.forEach((_, index) => {
    const boardContainer = document.createElement('div');
    boardContainer.id = `replay-board-container-${index}`;
    boardContainer.className = 'replay-board-container';
    replayBoards.appendChild(boardContainer);

    const boardDiv = document.createElement('div');
    boardDiv.id = `replay-board-${index}`;
    boardDiv.className = 'replay-board';
    boardContainer.appendChild(boardDiv);
    createChessboard(`replay-board-${index}`, true);

    const botContainer = document.createElement('div');
    botContainer.id = `replay-bot-continer-${index}`;
    botContainer.className = 'replay-bot-container';
    boardContainer.appendChild(botContainer);
  });
}

function playAllSequences(replaySequences, makeGif = true) {
  console.log('playAllSequences');
  
  let gifGen = null; 
  if (makeGif) {
    document.getElementById('overlayMoveString').appendChild(gameHistoryToMoveSpan());
    gifGen = new GifGenerator('replay-share-content')
  }
  const playPromises = replaySequences.map((sequence, index) => 
      playMoves(sequence, index, gifGen));
  
  Promise.all(playPromises).then(() => {
    if (document.getElementById('overlay').classList.contains('hidden')) {
      // User closed the window.
      if (gifGen) {
        gifGen.cancel();
      }
      
      return;
    }
    
    if (gifGen) {
      gifGen.generateGif();
      gifGen.cancel();
    }

    // Call playAllSequences again after 2 seconds.
    setTimeout(() => {
      console.log('playAllSequences again');
      playAllSequences(replaySequences, false);
    }, 2000);
  });


}

/*
parameters:
    moves: array of moves. The format of a move is:
      "boardMove": {
                  "startRow": "6",
                  "startCol": "4",
                  "endRow": "4",
                  "endCol": "4"
              },
              "humanMove": "e4",
              "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
              "played": 1,
              "status": "Move e4 succeeded! :)",
              "score": null
*/
function playMoves(moves, boardIndex, gifGen) {
  return new Promise((resolve) => {
    let currentMoveIndex = 0;

    async function playNextMove(move, bringBack=false) {
      console.log('currentMoveIndex', currentMoveIndex);
      if (document.getElementById('overlay').classList.contains('hidden')) {
        // User closed the window.
        resolve();
        return;
      }
      if (bringBack) {
        // The move failed and we already showed the attempted move. Put it back to the original fen.
        updateBoardFromFEN(move.fenAfter, `replay-board-${boardIndex}`);
        if (gifGen) {
          await gifGen.captureFrame();
        }
        
        currentMoveIndex++;
        await new Promise(resolve => setTimeout(resolve, 2000));
        playNextMove(moves[currentMoveIndex], false);
        //setTimeout(playNextMove(moves[currentMoveIndex], false), 2000);
        return;
      }
      if (currentMoveIndex < moves.length) {
        let fen = move.fenAfter;
        if (!move.played) {
          // Show the board fen state for the attempted move before it was taken back.
          fen = changeTurnFen(fen);
          var board = new Chess(fen);
          let bm = move.boardMove;
          var moveJs = convertToChessJsMove(bm.startRow, bm.startCol, bm.endRow, bm.endCol, board);
          var moveObj = board.move(moveJs, {'legal':false, verbose: true});
          if (!moveObj) {
            throw "Illegal move: " + moveJs;
          }
          fen = board.fen();
        }
        updateBoardFromFEN(fen, `replay-board-${boardIndex}`);
        
        let happyFace = '😊'
        if (!move.played) {
          happyFace = '😢';
        }
        let moveStatus = move.status;
        if (!moveStatus) {
          moveStatus = move.humanMove;
        }
        if (moveStatus.endsWith(':)')) {
          moveStatus = moveStatus.substring(0, moveStatus.length - 3);
        }
        document.getElementById(`replay-bot-continer-${boardIndex}`).innerText = happyFace + ' ' + moveStatus;
        
        if (gifGen) {
          await gifGen.captureFrame();
        }

        if (!move.played) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          playNextMove(move, true);
          //setTimeout(playNextMove(move, true), 2000);
        } else {
          currentMoveIndex++;
          await new Promise(resolve => setTimeout(resolve, 2000));
          playNextMove(moves[currentMoveIndex], false)
          //setTimeout(playNextMove(moves[currentMoveIndex], false), 2000);
        }
        
      } else {
        console.log("resolve")
        resolve();
      }
    }

    let move = moves[currentMoveIndex];
    playNextMove(move, false);
  });
}

function animateDiceRoll(callback, gifGen) {
    // Call captureFrame every 50 ms for 1 second
    const interval = setInterval(() => {
        gifGen.captureFrame();
    }, 5);
    setTimeout(() => {
        clearInterval(interval);    
    }, 1000);

    rollDice(1, 'replay-dice-0');
    setTimeout(callback, 2000);
}



const replaySequences = [
  [
    {
        "boardMove": {
            "startRow": "6",
            "startCol": "4",
            "endRow": "4",
            "endCol": "4"
        },
        "humanMove": "e4",
        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        "played": 1,
        "status": "Move e4 succeeded! :)",
        "score": null
    },
    {
        "boardMove": {
            "startRow": "1",
            "startCol": "3",
            "endRow": "3",
            "endCol": "3"
        },
        "humanMove": "d5",
        "fen": "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2",
        "played": 1,
        "status": "Move d5 succeeded! :)",
        "score": -35
    },
    {
        "boardMove": {
            "startRow": "7",
            "startCol": "6",
            "endRow": "5",
            "endCol": "5"
        },
        "humanMove": "Nf3",
        "fen": "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2",
        "played": 0,
        "status": "Unlucky. Move Nf3 failed. Skipping turn.",
        "score": null
    },
    {
        "boardMove": {
            "startRow": "3",
            "startCol": "3",
            "endRow": "4",
            "endCol": "4"
        },
        "humanMove": "dxe4",
        "fen": "rnbqkbnr/ppp1pppp/8/8/4p3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3",
        "played": 1,
        "status": "Move dxe4 succeeded! :)",
        "score": 111
    },
    // {
    //     "boardMove": {
    //         "startRow": "7",
    //         "startCol": "3",
    //         "endRow": "6",
    //         "endCol": "4"
    //     },
    //     "humanMove": "Qe2",
    //     "fen": "rnbqkbnr/ppp1pppp/8/8/4p3/8/PPPPQPPP/RNB1KBNR b KQkq - 1 3",
    //     "played": 1,
    //     "status": "Move Qe2 succeeded! :)",
    //     "score": null
    // },
    // {
    //     "boardMove": {
    //         "startRow": "0",
    //         "startCol": "1",
    //         "endRow": "2",
    //         "endCol": "2"
    //     },
    //     "humanMove": "Nc6",
    //     "fen": "rnbqkbnr/ppp1pppp/8/8/4p3/8/PPPPQPPP/RNB1KBNR w KQkq - 1 3",
    //     "played": 0,
    //     "status": "Unlucky. Move Nc6 failed. Skipping turn.",
    //     "score": 169
    // },
    // {
    //     "boardMove": {
    //         "startRow": "6",
    //         "startCol": "4",
    //         "endRow": "4",
    //         "endCol": "4"
    //     },
    //     "humanMove": "Qxe4",
    //     "fen": "rnbqkbnr/ppp1pppp/8/8/4Q3/8/PPPP1PPP/RNB1KBNR b KQkq - 0 3",
    //     "played": 1,
    //     "status": "Move Qxe4 succeeded! :)",
    //     "score": null
    // },
    // {
    //     "boardMove": {
    //         "startRow": "0",
    //         "startCol": "6",
    //         "endRow": "2",
    //         "endCol": "5"
    //     },
    //     "humanMove": "Nf6",
    //     "fen": "rnbqkb1r/ppp1pppp/5n2/8/4Q3/8/PPPP1PPP/RNB1KBNR w KQkq - 1 4",
    //     "played": 1,
    //     "status": "Move Nf6 succeeded! :)",
    //     "score": 105
    // },
    // {
    //     "boardMove": {
    //         "startRow": "4",
    //         "startCol": "4",
    //         "endRow": "1",
    //         "endCol": "4"
    //     },
    //     "humanMove": "Qxe7+",
    //     "fen": "rnbqkb1r/ppp1Qppp/5n2/8/8/8/PPPP1PPP/RNB1KBNR b KQkq - 0 4",
    //     "played": 1,
    //     "status": "Move Qxe7+ succeeded! :)",
    //     "score": null
    // },
    // {
    //     "boardMove": {
    //         "startRow": "0",
    //         "startCol": "3",
    //         "endRow": "1",
    //         "endCol": "4"
    //     },
    //     "humanMove": "Qxe7+",
    //     "fen": "rnb1kb1r/ppp1qppp/5n2/8/8/8/PPPP1PPP/RNB1KBNR w KQkq - 0 5",
    //     "played": 1,
    //     "status": "Move Qxe7+ succeeded! :)",
    //     "score": 1100
    // }
  ],
]

// Run after a 500ms delay
//setTimeout(() => showReplay(replaySequences), 100);
