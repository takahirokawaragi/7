/* ============================================================
     ファイル: server.js
     バージョン: v27.0
     変更点:
       1) クライアントへのリセット通知(gameResetイベント)を追加
     ※ public/index.html v27.0 / public/client.js v27.0 とセットで使用
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

// --- ゲーム状態の管理 ---
const SUITS = ['S', 'H', 'D', 'C'];
let gameState = {
    started: false,
    currentTurn: 1,
    board: { S: [], H: [], D: [], C: [] },
    seats: {
        1: { type: 'AI', socketId: null, hand: [], finished: false },
        2: { type: 'AI', socketId: null, hand: [], finished: false },
        3: { type: 'AI', socketId: null, hand: [], finished: false },
        4: { type: 'AI', socketId: null, hand: [], finished: false },
        5: { type: 'AI', socketId: null, hand: [], finished: false }
    },
    finishOrder: [],
    message: "席を選択して参加してください",
    announcement: null
};

// --- ゲームロジック ---

// カードが置けるか判定
function canPlace(suit, rank) {
    if (rank === 7) return false;
    const b = gameState.board[suit];
    if (rank > 1 && b.includes(rank - 1)) return true;
    if (rank < 13 && b.includes(rank + 1)) return true;
    return false;
}

// 次のターンへ移行
function nextTurn() {
    let count = 0;
    do {
        gameState.currentTurn = (gameState.currentTurn % 5) + 1;
        count++;
    } while (gameState.seats[gameState.currentTurn].finished && count < 5);

    io.emit('updateState', getPublicState());

    // 次の手番がAIなら自動実行
    if (gameState.started && gameState.seats[gameState.currentTurn].type === 'AI') {
        triggerAi(gameState.currentTurn);
    }
}

// AIの自動実行ロジック
function triggerAi(seatNum) {
    setTimeout(() => {
        if (!gameState.started || gameState.currentTurn !== seatNum) return;

        const seat = gameState.seats[seatNum];
        let playableCards = [];

        seat.hand.forEach(card => {
            if (canPlace(card.suit, card.rank)) playableCards.push(card);
        });

        if (playableCards.length > 0) {
            playableCards.sort((a, b) => Math.abs(a.rank - 7) - Math.abs(b.rank - 7));
            const cardToPlay = playableCards[0];
            playCardLogic(seatNum, cardToPlay.suit, cardToPlay.rank);
        } else {
            passLogic(seatNum);
        }
    }, 1500); 
}

// カードを出す処理
function playCardLogic(seatNum, suit, rank) {
    const seat = gameState.seats[seatNum];
    
    seat.hand = seat.hand.filter(c => !(c.suit === suit && c.rank === rank));
    gameState.board[suit].push(rank);
    gameState.board[suit].sort((a, b) => a - b);
    
    gameState.announcement = { kind: 'play', text: "" };
    
    if (seat.hand.length === 0) {
        seat.finished = true;
        gameState.finishOrder.push(seatNum);
        gameState.announcement = { kind: 'win', text: `プレイヤー${seatNum}が上がりました！` };
    }

    if (gameState.finishOrder.length >= 4) {
        gameState.started = false;
        gameState.message = "ゲーム終了です！";
    }

    nextTurn();
}

// パス処理
function passLogic(seatNum) {
    gameState.announcement = { kind: 'pass', text: `プレイヤー${seatNum} パス` };
    nextTurn();
}

// 新規ゲーム配布
function startGame() {
    gameState.started = true;
    gameState.currentTurn = 1;
    gameState.board = { S: [7], H: [7], D: [7], C: [7] };
    gameState.finishOrder = [];
    
    let deck = [];
    SUITS.forEach(s => {
        for (let n = 1; n <= 13; n++) {
            if (n !== 7) deck.push({ suit: s, rank: n });
        }
    });

    deck.sort(() => Math.random() - 0.5);

    const suitOrder = { S: 0, H: 1, D: 2, C: 3 };
    for (let i = 1; i <= 5; i++) {
        gameState.seats[i].hand = [];
        gameState.seats[i].finished = false;
    }
    for (let i = 0; i < 48; i++) {
        gameState.seats[(i % 5) + 1].hand.push(deck[i]);
    }
    for (let i = 1; i <= 5; i++) {
        gameState.seats[i].hand.sort((a, b) => (a.rank - b.rank) || (suitOrder[a.suit] - suitOrder[b.suit]));
    }

    gameState.message = "ゲームが開始されました！";
    io.emit('updateState', getPublicState());

    if (gameState.seats[1].type === 'AI') triggerAi(1);
}

// クライアントへ送信するデータ
function getPublicState() {
    let handsData = [];
    for(let i=1; i<=5; i++) {
        handsData.push({ cards: gameState.seats[i].hand, count: gameState.seats[i].hand.length });
    }
    
    return {
        started: gameState.started,
        currentTurn: gameState.currentTurn,
        turnLabel: `プレイヤー${gameState.currentTurn}`,
        boardData: gameState.board,
        handsData: handsData,
        finishOrder: gameState.finishOrder,
        announcement: gameState.announcement,
        message: gameState.message
    };
}


// --- Socket.IO 通信処理 ---
io.on('connection', (socket) => {
    socket.emit('updateState', getPublicState());

    socket.on('joinSeat', (seatNum) => {
        if(gameState.seats[seatNum]) {
            gameState.seats[seatNum].type = 'HUMAN';
            gameState.seats[seatNum].socketId = socket.id;
            io.emit('updateState', getPublicState());
        }
    });

    socket.on('startGame', () => {
        if (!gameState.started) startGame();
    });

    socket.on('playCard', (data) => {
        const { seatNum, suit, rank } = data;
        if (!gameState.started || gameState.currentTurn !== seatNum) return;
        if (canPlace(suit, rank)) {
            playCardLogic(seatNum, suit, rank);
        }
    });

    socket.on('passTurn', (seatNum) => {
        if (!gameState.started || gameState.currentTurn !== seatNum) return;
        passLogic(seatNum);
    });

    socket.on('resetGame', () => {
        gameState.started = false;
        gameState.board = { S: [], H: [], D: [], C: [] };
        for (let i = 1; i <= 5; i++) {
            gameState.seats[i].type = 'AI';
            gameState.seats[i].hand = [];
            gameState.seats[i].socketId = null;
        }
        gameState.message = "リセットされました";
        io.emit('updateState', getPublicState());
        io.emit('gameReset'); // ここでクライアントにリセットを指示
    });

    socket.on('disconnect', () => {
        // 切断された時の処理をここに追加できます
    });
});

server.listen(PORT, () => {
    console.log(`サーバーがポート ${PORT} で起動しました`);
});