/* ============================================================
     ファイル: server.js
     バージョン: v27.3
     変更点: 
       1) バージョン v27.3 へ更新
       2) 全コードを省略なしで記載
     ============================================================ */
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));
let gameState = {
    started: false, currentTurn: 1,
    board: { S: [], H: [], D: [], C: [] },
    seats: { 1:{hand:[]}, 2:{hand:[]}, 3:{hand:[]}, 4:{hand:[]}, 5:{hand:[]} },
    finishOrder: []
};

io.on('connection', (socket) => {
    socket.emit('updateState', getPublicState());
    socket.on('joinSeat', (s) => { gameState.seats[s].type = 'HUMAN'; io.emit('updateState', getPublicState()); });
    socket.on('startGame', () => {
        if(gameState.started) return;
        gameState.started = true;
        gameState.board = {S:[7], H:[7], D:[7], C:[7]};
        let deck = [];
        ['S','H','D','C'].forEach(s => { for(let n=1;n<=13;n++) if(n!==7) deck.push({suit:s, rank:n}); });
        deck.sort(() => Math.random()-0.5);
        for(let i=1;i<=5;i++) gameState.seats[i].hand = deck.splice(0, 9);
        io.emit('updateState', getPublicState());
    });
    socket.on('playCard', (d) => {
        if(gameState.currentTurn !== d.seatNum) return;
        gameState.seats[d.seatNum].hand = gameState.seats[d.seatNum].hand.filter(c => !(c.suit===d.suit && c.rank===d.rank));
        gameState.board[d.suit].push(d.rank);
        gameState.announcement = { kind: 'play' };
        gameState.currentTurn = (gameState.currentTurn % 5) + 1;
        io.emit('updateState', getPublicState());
    });
    socket.on('resetGame', () => {
        gameState = { started:false, currentTurn:1, board:{S:[], H:[], D:[], C:[]}, seats:{1:{hand:[]},2:{hand:[]},3:{hand:[]},4:{hand:[]},5:{hand:[]}}, finishOrder:[] };
        io.emit('gameReset');
    });
});

function getPublicState() {
    return { 
        started:gameState.started, currentTurn:gameState.currentTurn, turnLabel:`P${gameState.currentTurn}`, 
        boardData:gameState.board, handsData:Object.values(gameState.seats).map(s=>({cards:s.hand})), 
        announcement:gameState.announcement 
    };
}

http.listen(3000, () => console.log('Server running on port 3000'));