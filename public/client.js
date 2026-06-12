/* ============================================================
     ファイル: public/client.js
     バージョン: v27.3
     変更点: 
       1) バージョン v27.3 へ更新
       2) プレイヤー選択ボタンクリックで音声を自動有効化
     ※ server.js v27.3 / public/index.html v27.3 とセットで使用
     ============================================================ */
const socket = io();
let audioContext = null;

function ensureAudio() {
    if(!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if(audioContext.state === 'suspended') audioContext.resume();
}

function playSound() {
    ensureAudio();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.frequency.value = 600;
    osc.start(); osc.stop(audioContext.currentTime + 0.1);
}

socket.on('updateState', (state) => {
    document.getElementById('loading-overlay').classList.add('hidden');
    document.getElementById('currentTurn').textContent = state.turnLabel;
    document.getElementById('btnStart').disabled = state.started;
    document.getElementById('btnPass').disabled = !state.started || state.currentTurn !== mySeat;
    
    const grid = document.getElementById('boardGrid');
    if(grid.children.length === 0) initBoard();
    updateBoard(state.boardData);
    if(state.handsData && mySeat > 0) updateHand(state.handsData[mySeat-1]);
    if(state.announcement && state.announcement.kind === 'play') playSound();
});

socket.on('gameReset', () => { location.reload(); });

function initBoard() {
    const grid = document.getElementById('boardGrid');
    grid.innerHTML = '';
    const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
    const SUITS = ["S", "H", "D", "C"];
    grid.appendChild(document.createElement('div'));
    RANKS.forEach(r => { const c = document.createElement('div'); c.className = 'board-cell header'; c.textContent = r; grid.appendChild(c); });
    SUITS.forEach(s => {
        const h = document.createElement('div'); h.className = 'board-cell header'; h.textContent = s; grid.appendChild(h);
        for(let r=1; r<=13; r++) { const c = document.createElement('div'); c.className = 'board-cell'; c.dataset.suit = s; c.dataset.rank = r; grid.appendChild(c); }
    });
}

function updateBoard(boardData) {
    Object.keys(boardData).forEach(s => {
        boardData[s].forEach(r => {
            const cell = document.querySelector(`.board-cell[data-suit="${s}"][data-rank="${r}"]`);
            if(cell) cell.innerHTML = `<img src="https://deckofcardsapi.com/static/img/${r===10?'0':['A','2','3','4','5','6','7','8','9','10','J','Q','K'][r-1]}${s}.png">`;
        });
    });
}

function updateHand(handData) {
    const container = document.getElementById('handCards');
    container.innerHTML = '';
    handData.cards.forEach(c => {
        const div = document.createElement('div'); div.className = 'hand-card';
        div.innerHTML = `<img src="https://deckofcardsapi.com/static/img/${c.rank===10?'0':['A','2','3','4','5','6','7','8','9','10','J','Q','K'][c.rank-1]}${c.suit}.png">`;
        div.onclick = () => { playSound(); socket.emit('playCard', { seatNum: mySeat, suit: c.suit, rank: c.rank }); };
        container.appendChild(div);
    });
}

let mySeat = 0;
document.getElementById('seatSelector').onclick = e => {
    if(!e.target.classList.contains('seat-btn')) return;
    ensureAudio(); // ここで音声を有効化
    mySeat = parseInt(e.target.dataset.seat);
    document.querySelectorAll('.seat-btn').forEach(b => b.classList.remove('selected'));
    e.target.classList.add('selected');
    document.getElementById('yourSeat').textContent = `P${mySeat}`;
    socket.emit('joinSeat', mySeat);
};
document.getElementById('btnStart').onclick = () => socket.emit('startGame');
document.getElementById('btnReset').onclick = () => socket.emit('resetGame');
initBoard();