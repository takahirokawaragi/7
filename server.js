/* ============================================================
     ファイル: server.js
     バージョン: v27.1
     変更点:
       1) バージョン番号をv27.1へ更新
       2) ゲーム終了判定を5人全員が上がるまで継続するように修正
       3) リセットイベントの確実な同期
     ※ public/index.html v27.1 / public/client.js v27.1 とセットで使用
     ============================================================ */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.get('/health', (req, res) => res.status(200).send('OK'));

let gameState = {
    started: false, currentTurn: 1,
    board: { S: [], H: [], D: [], C: [] },
    seats: { 1:{type:'AI', hand:[], finished:false}, 2:{type:'AI', hand:[], finished:false}, 3:{type:'AI', hand:[], finished:false}, 4:{type:'AI', hand:[], finished:false}, 5:{type:'AI', hand:[], finished:false} },
    finishOrder: [], message: ""
};

function canPlace(s, r) {
    if (r === 7) return false;
    const b = gameState.board[s];
    return (r > 1 && b.includes(r - 1)) || (r < 13 && b.includes(r + 1));
}

function nextTurn() {
    let count = 0;
    do { gameState.currentTurn = (gameState.currentTurn % 5) + 1; count++; } 
    while (gameState.seats[gameState.currentTurn].finished && count < 5);
    io.emit('updateState', getPublicState());
    if (gameState.started && gameState.seats[gameState.currentTurn].type === 'AI') triggerAi(gameState.currentTurn);
}

function triggerAi(sNum) {
    setTimeout(() => {
        if (!gameState.started || gameState.currentTurn !== sNum) return;
        const seat = gameState.seats[sNum];
        const playable = seat.hand.filter(c => canPlace(c.suit, c.rank));
        if (playable.length > 0) {
            playable.sort((a, b) => Math.abs(a.rank - 7) - Math.abs(b.rank - 7));
            playCardLogic(sNum, playable[0].suit, playable[0].rank);
        } else {
            gameState.announcement = { kind: 'pass' };
            nextTurn();
        }
    }, 1000);
}

function playCardLogic(sNum, s, r) {
    const seat = gameState.seats[sNum];
    seat.hand = seat.hand.filter(c => !(c.suit === s && c.rank === r));
    gameState.board[s].push(r);
    gameState.board[s].sort((a, b) => a - b);
    gameState.announcement = { kind: 'play' };
    if (seat.hand.length === 0) {
        seat.finished = true;
        gameState.finishOrder.push(sNum);
        gameState.announcement = { kind: 'win' };
    }
    if (gameState.finishOrder.length >= 5) gameState.started = false; // 5人全員が上がるまで継続
    nextTurn();
}

function startGame() {
    gameState.started = true; gameState.finishOrder = []; gameState.board = {S:[7], H:[7], D:[7], C:[7]};
    let deck = [];
    ['S','H','D','C'].forEach(s => { for(let n=1;n<=13;n++) if(n!==7) deck.push({suit:s, rank:n}); });
    deck.sort(() => Math.random()-0.5);
    for(let i=1;i<=5;i++) { gameState.seats[i].hand = []; gameState.seats[i].finished = false; }
    for(let i=0;i<48;i++) gameState.seats[(i%5)+1].hand.push(deck[i]);
    io.emit('updateState', getPublicState());
}

function getPublicState() {
    return { started:gameState.started, currentTurn:gameState.currentTurn, turnLabel:`P${gameState.currentTurn}`, boardData:gameState.board, handsData:Object.values(gameState.seats).map(s=>({cards:s.hand})), finishOrder:gameState.finishOrder, announcement:gameState.announcement };
}

io.on('connection', (socket) => {
    socket.emit('updateState', getPublicState());
    socket.on('joinSeat', (s) => { gameState.seats[s].type = 'HUMAN'; io.emit('updateState', getPublicState()); });
    socket.on('startGame', startGame);
    socket.on('playCard', (d) => playCardLogic(d.seatNum, d.suit, d.rank));
    socket.on('resetGame', () => {
        gameState = { started:false, currentTurn:1, board:{S:[], H:[], D:[], C:[]}, seats:{1:{type:'AI',hand:[],finished:false},2:{type:'AI',hand:[],finished:false},3:{type:'AI',hand:[],finished:false},4:{type:'AI',hand:[],finished:false},5:{type:'AI',hand:[],finished:false}}, finishOrder:[] };
        io.emit('gameReset');
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));