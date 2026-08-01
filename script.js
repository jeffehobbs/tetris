const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextContext = nextCanvas.getContext('2d');

context.scale(20, 20);
nextContext.scale(20, 20);

const COLORS = [
    null,
    '#FF0D72', // T - Reddish
    '#0DC2FF', // I - Cyan
    '#0DFF72', // S - Green
    '#F538FF', // Z - Purple
    '#FF8E0D', // L - Orange
    '#FFE13E', // J - Yellow
    '#3877FF', // O - Blue
];

// --- Sound Manager using Web Audio API ---
const sound = {
    ctx: null,
    init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    },
    play(freq, type = 'sine', duration = 0.1, volume = 0.1, slide = 0) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slide !== 0) {
            osc.frequency.exponentialRampToValueAtTime(freq + slide, this.ctx.currentTime + duration);
        }

        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    move() { this.play(440, 'sine', 0.05, 0.05); },
    rotate() { this.play(660, 'sine', 0.08, 0.05, 110); },
    drop() { this.play(220, 'triangle', 0.05, 0.07); },
    clear(count) {
        const baseFreq = 440 * count;
        this.play(baseFreq, 'square', 0.2, 0.05);
        setTimeout(() => this.play(baseFreq * 1.25, 'square', 0.2, 0.05), 50);
    },
    gameOver() {
        this.play(330, 'sawtooth', 0.5, 0.05, -200);
    },
    start() {
        this.play(523.25, 'sine', 0.1, 0.1);
        setTimeout(() => this.play(659.25, 'sine', 0.1, 0.1), 100);
        setTimeout(() => this.play(783.99, 'sine', 0.2, 0.1), 200);
    }
};

function createPiece(type) {
    if (type === 'I') {
        return [
            [0, 1, 0, 0],
            [0, 1, 0, 0],
            [0, 1, 0, 0],
            [0, 1, 0, 0],
        ];
    } else if (type === 'L') {
        return [
            [0, 2, 0],
            [0, 2, 0],
            [0, 2, 2],
        ];
    } else if (type === 'J') {
        return [
            [0, 3, 0],
            [0, 3, 0],
            [3, 3, 0],
        ];
    } else if (type === 'O') {
        return [
            [4, 4],
            [4, 4],
        ];
    } else if (type === 'Z') {
        return [
            [5, 5, 0],
            [0, 5, 5],
            [0, 0, 0],
        ];
    } else if (type === 'S') {
        return [
            [0, 6, 6],
            [6, 6, 0],
            [0, 0, 0],
        ];
    } else if (type === 'T') {
        return [
            [0, 7, 0],
            [7, 7, 7],
            [0, 0, 0],
        ];
    }
}

function createMatrix(w, h) {
    const matrix = [];
    while (h--) {
        matrix.push(new Array(w).fill(0));
    }
    return matrix;
}

function draw() {
    context.fillStyle = '#0f3460';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // --- Draw Column Highlights ---
    if (player.matrix) {
        context.fillStyle = 'rgba(255, 255, 255, 0.03)';
        player.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    context.fillRect(player.pos.x + x, 0, 1, canvas.height / 20);
                }
            });
        });
    }

    drawMatrix(arena, {x: 0, y: 0}, context);
    drawMatrix(player.matrix, {x: player.pos.x, y: player.pos.y}, context);
}

function drawNext() {
    nextContext.fillStyle = '#0f3460';
    nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    drawMatrix(player.next, {x: 1, y: 1}, nextContext);
}

function drawMatrix(matrix, offset, ctx) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                const xPos = x + offset.x;
                const yPos = y + offset.y;

                // Base color
                ctx.fillStyle = COLORS[value];
                ctx.fillRect(xPos, yPos, 1, 1);

                // Glossy highlight (top and left edges)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.fillRect(xPos, yPos, 1, 0.1); // top line
                ctx.fillRect(xPos, yPos, 0.1, 1); // left line

                // Subtle shadow (bottom and right edges)
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.fillRect(xPos, yPos + 0.9, 1, 0.1); // bottom line
                ctx.fillRect(xPos + 0.9, yPos, 0.1, 1); // right line
            }
        });
    });
}

function merge(arena, player) {
    sound.drop();
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                arena[y + player.pos.y][x + player.pos.x] = value;
            }
        });
    });
}

function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
            [
                matrix[x][y],
                matrix[y][x],
            ] = [
                matrix[y][x],
                matrix[x][y],
            ];
        }
    }
    if (dir > 0) {
        matrix.forEach(row => row.reverse());
    } else {
        matrix.reverse();
    }
}

function collide(arena, player) {
    const [m, o] = [player.matrix, player.pos];
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 &&
               (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
                return true;
            }
        }
    }
    return false;
}

function arenaSweep() {
    let rowCount = 0;
    outer: for (let y = arena.length - 1; y > 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) {
            if (arena[y][x] === 0) {
                continue outer;
            }
        }
        const row = arena.splice(y, 1)[0].fill(0);
        arena.unshift(row);
        ++y;
        rowCount++;
    }
    if (rowCount > 0) {
        player.score += rowCount * 10 * (rowCount === 4 ? 2 : 1); // bonus for tetris
        player.lines += rowCount;
        sound.clear(rowCount);
    }
    updateScore();
}

function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        playerReset();
        arenaSweep();
        updateScore();
    }
    dropCounter = 0;
}

function playerHardDrop() {
    while (!collide(arena, player)) {
        player.pos.y++;
    }
    player.pos.y--;
    merge(arena, player);
    playerReset();
    arenaSweep();
    updateScore();
}

function playerMove(dir) {
    player.pos.x += dir;
    if (collide(arena, player)) {
        player.pos.x -= dir;
    } else {
        sound.move();
    }
}

function playerRotate(dir) {
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix, dir);
    while (collide(arena, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) {
            rotate(player.matrix, -dir);
            player.pos.x = pos;
            return;
        }
    }
    sound.rotate();
}

function playerReset() {
    const pieces = 'ILJOTSZ';
    if (player.next === null) {
        player.matrix = createPiece(pieces[pieces.length * Math.random() | 0]);
    } else {
        player.matrix = player.next;
    }
    player.next = createPiece(pieces[pieces.length * Math.random() | 0]);

    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) -
                   (player.matrix[0].length / 2 | 0);

    if (collide(arena, player)) {
        sound.gameOver();
        arena.forEach(row => row.fill(0));
        player.score = 0;
        player.lines = 0;
        updateScore();

        paused = true;
        player.matrix = null;
        document.getElementById('start-btn').innerText = 'Start Game';
    }
    drawNext();
}

function updateScore() {
    document.getElementById('score').innerText = player.score;
    document.getElementById('lines').innerText = player.lines;

    if (player.score > player.highScore) {
        player.highScore = player.score;
        localStorage.setItem('tetrisHighScore', player.highScore);
    }
    document.getElementById('high-score').innerText = player.highScore;
}

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let paused = false;

function update(time = 0) {
    const deltaTime = time - lastTime;
    lastTime = time;

    if (!paused) {
        dropCounter += deltaTime;
        if (dropCounter > dropInterval) {
            playerDrop();
        }
    }

    draw();
    requestAnimationFrame(update);
}

const arena = createMatrix(12, 20);

const player = {
    pos: {x: 0, y: 0},
    matrix: null,
    next: null,
    score: 0,
    lines: 0,
    highScore: parseInt(localStorage.getItem('tetrisHighScore')) || 0,
};

document.addEventListener('keydown', event => {
    if (event.keyCode === 37) {
        event.preventDefault();
        playerMove(-1);
    } else if (event.keyCode === 39) {
        event.preventDefault();
        playerMove(1);
    } else if (event.keyCode === 40) {
        event.preventDefault();
        playerDrop();
    } else if (event.keyCode === 38) {
        event.preventDefault();
        playerRotate(1);
    } else if (event.keyCode === 32) {
        event.preventDefault();
        playerHardDrop();
    }
});

document.getElementById('start-btn').addEventListener('click', () => {
    const btn = document.getElementById('start-btn');

    if (player.matrix === null) {
        // Initial Start
        sound.init();
        sound.start();
        playerReset();
        updateScore();
        update();
        btn.innerText = 'Pause';
    } else {
        // Toggle Pause/Resume
        paused = !paused;
        btn.innerText = paused ? 'Resume' : 'Pause';
    }
});

VANTA.NET({
    el: 'body',
    mouseControls: true,
    touchControls: true,
    gyroControls: false,
    minHeight: 200,
    minWidth: 200,
    scale: 1.0,
    scaleMobile: 1.0,
    color: 0x3f51b5,
    backgroundColor: 0x1a1a2e,
    points: 10.0,
    maxDistance: 20.0,
    distanceBetween: 100.0,
});

updateScore();
