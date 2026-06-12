/* ============================================================
     ファイル: public/client.js
     バージョン: v27.0
     変更点:
       1) 座席選択が勝手に解除される不具合を修正
       2) サーバーからの専用リセットイベント(gameReset)に対応
     ※ server.js v27.0 / public/index.html v27.0 とセットで使用
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
let boardState = {};
let initialSevens = new Set();
let lastAnnText = ""; 

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// --- 音声・演出系関数 ---
function playSound(type) {
    if(audioContext.state === 'suspended') audioContext.resume();
    if(type === 'play') {
        const duration = 0.15, sampleRate = audioContext.sampleRate, length = Math.floor(sampleRate * duration);
        const buffer = audioContext.createBuffer(1, length, sampleRate), data = buffer.getChannelData(0);
        for(let i = 0; i < length; i++) {
            const t = i / length, noise = (Math.random() * 2 - 1) * Math.pow(1 - t, 2);
            data[i] = noise * (0.3 + 0.7 * Math.pow(1 - t, 0.5));
        }
        const source = audioContext.createBufferSource(), highpass = audioContext.createBiquadFilter(), gain = audioContext.createGain();
        source.buffer = buffer; highpass.type = 'highpass'; highpass.frequency.value = 1800; gain.gain.value = 0.4;
        source.connect(highpass); highpass.connect(gain); gain.connect(audioContext.destination);
        const now = audioContext.currentTime; gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
        source.start(now); source.stop(now + duration);
    } else if(type === 'win') {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            const osc = audioContext.createOscillator(), gain = audioContext.createGain();
            osc.type = 'triangle'; osc.frequency.value = freq; osc.connect(gain); gain.connect(audioContext.destination);
            const t = audioContext.currentTime + i * 0.15; gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.3, t + 0.02); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
            osc.start(t); osc.stop(t + 0.3);
        });
    } else if(type === 'chime') {
        [523.25, 659.25, 783.99].forEach((freq, i) => {
            const osc = audioContext.createOscillator(), gain = audioContext.createGain();
            osc.type = 'sine'; osc.frequency.value = freq; osc.connect(gain); gain.connect(audioContext.destination);
            const t = audioContext.currentTime + i * 0.06; gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.3, t + 0.03); gain.gain.exponentialRampToValueAtTime(0.002, t + 0.18);
            osc.start(t); osc.stop(t + 0.2);
        });
    }
}

function speak(text) {
    try {
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = speechSynthesis.getVoices(), jaVoice = voices.find(v => v.lang.startsWith('ja'));
        if(jaVoice) utterance.voice = jaVoice;
        speechSynthesis.cancel(); speechSynthesis.speak(utterance);
    } catch(e) {}
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

// --- 盤面・UI描画系関数 ---
function initBoard() {
    const grid = document.getElementById('boardGrid');
    grid.innerHTML = '';
    const corner = document.createElement('div'); corner.className = 'board-cell header'; grid.appendChild(corner);
    RANKS.forEach(rank => {
        const cell = document.createElement('div'); cell.className = 'board-cell header'; cell.textContent = rank; grid.appendChild(cell);
    });
    SUITS.forEach(suit => {
        const suitCell = document.createElement('div'); suitCell.className = 'board-cell header'; suitCell.textContent = SUIT_SYMBOLS[suit]; suitCell.style.color = SUIT_COLORS[suit]; grid.appendChild(suitCell);
        for(let rank=1; rank<=13; rank++) {
            const cell = document.createElement('div'); cell.className = 'board-cell'; cell.dataset.suit = suit; cell.dataset.rank = rank;
            if(rank === 7) initialSevens.add(`${suit}-7`);
            grid.appendChild(cell);
        }
    });
}

function updateBoard(boardData) {
    if(!boardData) return;
    SUITS.forEach(suit => {
        for(let rank=1; rank<=13; rank++) {
            const cell = document.querySelector(`.board-cell[data-suit="${suit}"][data-rank="${rank}"]`);
            if(cell && boardData[suit] && boardData[suit].includes(rank)) { 
                cell.classList.add('card');
                if(initialSevens.has(`${suit}-7`)) cell.classList.add('initial');
                const img = document.createElement('img'); img.src = getCardImageUrl(suit, rank); img.alt = `${SUIT_SYMBOLS[suit]}${RANKS[rank-1]}`;
                cell.innerHTML = ''; cell.appendChild(img);
            } else if (cell) {
                cell.classList.remove('card', 'initial'); cell.innerHTML = ''; 
            }
        }
    });
}

function updateHand(handData) {
    if(!handData) return;
    myHand = handData.cards || [];
    const container = document.getElementById('handCards'), handDiv = document.getElementById('hand');
    
    if(myHand.length === 0) {
        container.innerHTML = '<div style="color: #999; font-size: 11px;">手札がありません</div>';
        handDiv.classList.remove('active'); return;
    }
    
    container.innerHTML = '';
    myHand.forEach(card => {
        const cardDiv = document.createElement('div'); cardDiv.className = 'hand-card';
        const img = document.createElement('img'); img.src = getCardImageUrl(card.suit, card.rank); img.alt = `${SUIT_SYMBOLS[card.suit]}${RANKS[card.rank-1]}`;
        cardDiv.appendChild(img);
        cardDiv.addEventListener('click', () => { playCard(card.suit, card.rank); });
        container.appendChild(cardDiv);
    });
    
    if(currentTurn === mySeat) handDiv.classList.add('active');
    else handDiv.classList.remove('active');
    document.getElementById('cardCount').textContent = myHand.length;
}

// --- Socket通信イベント ---

socket.on('updateState', (state) => {
    document.getElementById('loading-overlay').classList.add('hidden');
    
    gameStarted = state.started;
    currentTurn = state.currentTurn || 1;
    boardState = state.boardData || {};
    
    document.getElementById('currentTurn').textContent = state.turnLabel || '—';
    document.getElementById('btnPass').disabled = !gameStarted || currentTurn !== mySeat;
    document.getElementById('btnStart').disabled = gameStarted;
    
    updateBoard(state.boardData);
    
    if(mySeat > 0 && state.handsData && state.handsData[mySeat-1]) {
        updateHand(state.handsData[mySeat-1]);
    }
    
    if(state.finishOrder && state.finishOrder.length > 0) {
        const ranking = document.getElementById('ranking'), list = document.getElementById('rankingList');
        list.innerHTML = '';
        state.finishOrder.forEach(seat => {
            const li = document.createElement('li'); li.textContent = `プレイヤー${seat}`; list.appendChild(li);
        });
        ranking.style.display = 'block';
    } else {
        document.getElementById('ranking').style.display = 'none';
    }
    
    if(state.announcement && state.announcement.text !== lastAnnText) {
        lastAnnText = state.announcement.text;
        
        if(state.announcement.text) speak(state.announcement.text);
        if(state.announcement.kind === 'win') playSound('win');
        if(state.announcement.kind === 'play') playSound('play');
    }
});

// 新しく追加：サーバーからのリセット指示を確実に受け取る
socket.on('gameReset', () => {
    mySeat = 0; initialSevens.clear();
    document.querySelectorAll('.seat-btn').forEach(btn => btn.classList.remove('selected', 'locked'));
    document.getElementById('yourSeat').textContent = '未選択';
    document.getElementById('currentTurn').textContent = '—';
    document.getElementById('cardCount').textContent = '—';
    document.getElementById('handCards').innerHTML = '<div style="color: #999; font-size: 11px;">席を選択してゲーム開始</div>';
    document.getElementById('ranking').style.display = 'none';
    initBoard();
});


// --- ユーザー操作 ---

function playCard(suit, rank) {
    if(currentTurn !== mySeat) {
        showMessage('あなたの番ではありません', 'warning'); return;
    }
    playSound('play');
    socket.emit('playCard', { seatNum: mySeat, suit, rank });
}

document.getElementById('seatSelector').addEventListener('click', e => {
    if(!e.target.classList.contains('seat-btn')) return;
    if(gameStarted && mySeat > 0) { showMessage('ゲーム中はプレイヤーを変更できません', 'warning'); return; }
    
    const seat = parseInt(e.target.dataset.seat);
    playSound('chime');
    
    document.querySelectorAll('.seat-btn').forEach(btn => {
        btn.classList.remove('selected');
        if(gameStarted) btn.classList.add('locked');
    });
    e.target.classList.add('selected');
    mySeat = seat;
    document.getElementById('yourSeat').textContent = `P${seat}`;
    
    socket.emit('joinSeat', seat);
    showMessage(`プレイヤー${seat}として参加しました`, 'success');
});

document.getElementById('btnStart').addEventListener('click', () => {
    if(mySeat === 0) { showMessage('まず座席を選択してください', 'warning'); return; }
    speak('ゲームスタート！');
    socket.emit('startGame');
});

document.getElementById('btnPass').addEventListener('click', () => {
    socket.emit('passTurn', mySeat);
    showMessage('パスしました', 'info');
});

document.getElementById('btnReset').addEventListener('click', () => {
    if(!confirm('本当にリセットしますか?')) return;
    speak('ゲームをリセットしています');
    socket.emit('resetGame');
});

initBoard();