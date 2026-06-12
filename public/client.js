/* ============================================================
     ファイル: public/client.js
     バージョン: v27.1
     変更点:
       1) バージョン番号をv27.1へ更新
       2) 他プレイヤーの操作音同期に対応
       3) リセットイベントの確実な同期
     ※ server.js v27.1 / public/index.html v27.1 とセットで使用
   ============================================================ */

const socket = io();

const SUITS = ["S", "H", "D", "C"];
const SUIT_SYMBOLS = {S:"♠", H:"♥", D:"♦", C:"♣"};
const SUIT_COLORS = {S:"#000", H:"#e53935", D:"#e53935", C:"#000"};
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const CARD_IMG_BASE = "https://deckofcardsapi.com/static/img/";

let mySeat = 0;
let gameStarted = false;
let currentTurn = 1;
let myHand = [];
let initialSevens = new Set();
let lastAnnText = ""; 

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if(audioContext.state === 'suspended') audioContext.resume();
    const duration = 0.15, sampleRate = audioContext.sampleRate, length = Math.floor(sampleRate * duration);
    const buffer = audioContext.createBuffer(1, length, sampleRate), data = buffer.getChannelData(0);
    for(let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    }
    const source = audioContext.createBufferSource(), gain = audioContext.createGain();
    source.buffer = buffer; gain.gain.value = 0.2;
    source.connect(gain); gain.connect(audioContext.destination);
    source.start();
}

function speak(text) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    speechSynthesis.cancel(); speechSynthesis.speak(u);
}

function showMessage(text, type = 'info') {
    const msg = document.getElementById('message');
    msg.textContent = text; msg.className = `message ${type} show`;
    setTimeout(() => { msg.classList.remove('show'); }, 3000);
}

function getCardImageUrl(suit, rank) {
    const r = (rank === 10) ? "0" : RANKS[rank-1];
    return `${CARD_IMG_BASE}${r}${suit}.png`;
}

function initBoard() {
    const grid = document.getElementById('boardGrid');
    grid.innerHTML = '';
    const corner = document.createElement('div'); corner.className = 'board-cell header'; grid.appendChild(corner);
    RANKS.forEach(r => { const c = document.createElement('div'); c.className = 'board-cell header'; c.textContent = r; grid.appendChild(c); });
    SUITS.forEach(s => {
        const h = document.createElement('div'); h.className = 'board-cell header'; h.textContent = SUIT_SYMBOLS[s]; h.style.color = SUIT_COLORS[s]; grid.appendChild(h);
        for(let r=1; r<=13; r++) {
            const c = document.createElement('div'); c.className = 'board-cell'; c.dataset.suit = s; c.dataset.rank = r;
            if(r === 7) initialSevens.add(`${s}-7`);
            grid.appendChild(c);
        }
    });
}

function updateBoard(boardData) {
    if(!boardData) return;
    SUITS.forEach(s => {
        for(let r=1; r<=13; r++) {
            const cell = document.querySelector(`.board-cell[data-suit="${s}"][data-rank="${r}"]`);
            if(cell && boardData[s] && boardData[s].includes(r)) { 
                cell.classList.add('card');
                if(initialSevens.has(`${s}-7`)) cell.classList.add('initial');
                const img = document.createElement('img'); img.src = getCardImageUrl(s, r);
                cell.innerHTML = ''; cell.appendChild(img);
            } else if (cell) { cell.classList.remove('card', 'initial'); cell.innerHTML = ''; }
        }
    });
}

function updateHand(handData) {
    if(!handData) return;
    myHand = handData.cards || [];
    const container = document.getElementById('handCards');
    container.innerHTML = myHand.length === 0 ? '<div style="color: #999; font-size: 11px;">手札がありません</div>' : '';
    myHand.forEach(c => {
        const div = document.createElement('div'); div.className = 'hand-card';
        const img = document.createElement('img'); img.src = getCardImageUrl(c.suit, c.rank);
        div.appendChild(img);
        div.onclick = () => playCard(c.suit, c.rank);
        container.appendChild(div);
    });
    document.getElementById('hand').classList.toggle('active', currentTurn === mySeat);
    document.getElementById('cardCount').textContent = myHand.length;
}

socket.on('updateState', (state) => {
    document.getElementById('loading-overlay').classList.add('hidden');
    gameStarted = state.started; currentTurn = state.currentTurn;
    document.getElementById('currentTurn').textContent = state.turnLabel;
    document.getElementById('btnPass').disabled = !gameStarted || currentTurn !== mySeat;
    document.getElementById('btnStart').disabled = gameStarted;
    updateBoard(state.boardData);
    if(mySeat > 0 && state.handsData) updateHand(state.handsData[mySeat-1]);
    
    if(state.announcement && state.announcement.text !== lastAnnText) {
        lastAnnText = state.announcement.text;
        if(state.announcement.text) speak(state.announcement.text);
        if(state.announcement.kind === 'play' || state.announcement.kind === 'win') playSound('play');
    }
});

socket.on('gameReset', () => {
    mySeat = 0;
    document.querySelectorAll('.seat-btn').forEach(b => b.classList.remove('selected', 'locked'));
    document.getElementById('yourSeat').textContent = '未選択';
    initBoard();
});

function playCard(suit, rank) {
    if(currentTurn !== mySeat) return showMessage('あなたの番ではありません', 'warning');
    socket.emit('playCard', { seatNum: mySeat, suit, rank });
}

document.getElementById('seatSelector').onclick = e => {
    if(!e.target.classList.contains('seat-btn')) return;
    const seat = parseInt(e.target.dataset.seat);
    document.querySelectorAll('.seat-btn').forEach(b => b.classList.remove('selected'));
    e.target.classList.add('selected');
    mySeat = seat;
    document.getElementById('yourSeat').textContent = `P${seat}`;
    socket.emit('joinSeat', seat);
};

document.getElementById('btnStart').onclick = () => socket.emit('startGame');
document.getElementById('btnPass').onclick = () => socket.emit('passTurn', mySeat);
document.getElementById('btnReset').onclick = () => { if(confirm('リセットしますか?')) socket.emit('resetGame'); };

initBoard();