const CANVAS = document.getElementById('game-canvas');
const CTX = CANVAS.getContext('2d');

// デスクトップ基準の解像度
const SCREEN_WIDTH = 1000; 
const SCREEN_HEIGHT = 750;
CANVAS.width = SCREEN_WIDTH;
CANVAS.height = SCREEN_HEIGHT;

const GRID_SIZE = 3;
// 【修正点】PLOT_SIZEは動的に設定するため、デフォルト値としてのみ定義
const PLOT_SIZE_DEFAULT = 160; 
const PLOT_PADDING = 30; // パディングは固定

const FPS = 30;
const GAME_TIME_LIMIT = 60;

// --- 1. 定数と初期設定 ---
const COLORS = {
    WHITE: "#FFFFFF",
    BLACK: "#000000",
    GREEN_DARK: "#228B22",
    BROWN: "#8B4513",
    BLUE_LIGHT: "#ADD8E6",
    YELLOW: "#FFFF00",
    ORANGE: "#FFA500",
    RED_COST: "#FF6464",
    GREEN_GAIN: "#64FF64",
};

const PARTICLE_COLORS = {
    "plant": COLORS.GREEN_DARK,
    "water": COLORS.BLUE_LIGHT,
    "harvest": COLORS.YELLOW
};

const CROP_TYPES = {
    "LETTUCE": {
        "name": "レタス", "color": COLORS.GREEN_DARK, "max_time": 3.0, "water_boost": 1.0, "cost": 1, "score": 5, "yield": 1
    },
    "CARROT": {
        "name": "ニンジン", "color": COLORS.ORANGE, "max_time": 5.0, "water_boost": 1.5, "cost": 2, "score": 15, "yield": 3
    },
    "PUMPKIN": {
        "name": "カボチャ", "color": COLORS.YELLOW, "max_time": 10.0, "water_boost": 3.0, "cost": 3, "score": 40, "yield": 5
    }
};
const CROP_KEYS = Object.keys(CROP_TYPES);

// --- 0. 補助クラス：Particle ---
class Particle {
    constructor(pos, color, size, velocity, life) {
        this.pos = { x: pos.x, y: pos.y };
        this.color = color;
        this.size = size;
        this.velocity = { x: velocity.x, y: velocity.y };
        this.life = life;
        this.max_life = life;
    }

    update(deltaTime) {
        this.pos.x += this.velocity.x * deltaTime * 60;
        this.pos.y += this.velocity.y * deltaTime * 60;
        
        this.velocity.y += 0.5 * deltaTime; 
        this.life -= deltaTime;
    }

    draw(ctx) {
        if (this.life > 0 && this.size > 0) {
            const currentSize = Math.max(1, Math.floor(this.size * (this.life / this.max_life)));
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.pos.x, this.pos.y, currentSize, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// --- 0. 補助クラス：LogManager ---
class LogManager {
    constructor(maxLogs = 5) {
        this.logs = [];
        this.maxLogs = maxLogs;
        this.logDuration = 3.0;
        this.logContainer = document.getElementById('log-container');
    }

    addLog(text, color = COLORS.WHITE) {
        if (this.logs.length >= this.maxLogs) {
            this.logs.shift();
            if (this.logContainer.children.length > 0) {
                 this.logContainer.children[0].remove();
            }
        }
        
        const logElement = document.createElement('div');
        logElement.classList.add('log-message');
        logElement.style.color = color;
        logElement.textContent = text;
        
        this.logs.push({ text: text, color: color, timer: this.logDuration, element: logElement });
        this.logContainer.appendChild(logElement);
    }

    update(deltaTime) {
        this.logs = this.logs.filter(log => {
            log.timer -= deltaTime;
            if (log.timer <= 0) {
                log.element.remove();
                return false;
            }
            const alpha = Math.max(0.2, log.timer / this.logDuration);
            log.element.style.opacity = alpha.toFixed(2);
            return true;
        });
    }
}

// --- 3. 畑のマス (Plot) クラス ---
class Plot {
    // 【修正点】plotSize を引数で受け取るように変更
    constructor(x, y, gridX, gridY, plotSize) {
        // グローバル定数ではなく、受け取った plotSize を使用
        this.rect = { x: x, y: y, width: plotSize, height: plotSize };
        this.gridX = gridX; 
        this.gridY = gridY; 
        this.state = "EMPTY"; // "EMPTY", "SEED", "GROWING", "READY"
        this.cropType = null;
        this.growthTimer = 0;
        this.maxGrowthTime = 0;
        this.watered = false;
    }

    plant(cropKey) {
        this.cropType = cropKey;
        this.state = "GROWING"; 
        const data = CROP_TYPES[cropKey];
        this.maxGrowthTime = data.max_time;
        this.growthTimer = data.max_time;
        this.watered = false;
    }

    update(deltaTime) {
        if (this.state === "SEED" || this.state === "GROWING") {
            this.growthTimer -= deltaTime;

            if (this.watered) {
                this.growthTimer -= deltaTime * 0.5;
            }

            if (this.growthTimer <= 0) {
                this.state = "READY";
                this.growthTimer = 0;
                this.watered = false;
            }
        }
    }
    
    // Canvas 描画メソッド
    draw(ctx) {
        // 【修正点】すべて this.rect の width/height を使用
        const { x, y, width, height } = this.rect;
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        
        // 畑の背景
        ctx.fillStyle = COLORS.BROWN;
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = COLORS.BLACK;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);

        if (this.state !== "EMPTY" && this.cropType) {
            const data = CROP_TYPES[this.cropType];
            
            // 成長中の描画 (SEEDとGROWINGをまとめて扱う)
            if (this.state === "SEED" || this.state === "GROWING") {
                const growthRatio = 1 - (this.growthTimer / this.maxGrowthTime);
                
                // 作物の描画
                const maxCropSize = width * 0.2; 
                const currentCropSize = maxCropSize * Math.max(0.1, growthRatio); 
                ctx.fillStyle = data.color;
                ctx.fillRect(centerX - currentCropSize / 2, centerY - currentCropSize * 0.75, currentCropSize, currentCropSize * 1.5); 

                // 成長ゲージ
                const gaugeWidth = width * 0.4;
                const gaugeHeight = 8;
                
                ctx.fillStyle = COLORS.BLACK;
                ctx.fillRect(centerX - gaugeWidth / 2, centerY + width * 0.2, gaugeWidth, gaugeHeight); 
                ctx.fillStyle = data.color;
                ctx.fillRect(centerX - gaugeWidth / 2, centerY + width * 0.2, gaugeWidth * growthRatio, gaugeHeight); 

                // 水やりテキスト
                if (!this.watered) {
                    ctx.fillStyle = COLORS.BLUE_LIGHT;
                    ctx.font = `${width * 0.1}px sans-serif`; 
                    ctx.textAlign = "center";
                    ctx.fillText("水やり", centerX, centerY - width * 0.3); 
                }
            } else if (this.state === "READY") {
                // 収穫可能
                const harvestSize = width * 0.3; 
                ctx.fillStyle = data.color;
                ctx.beginPath();
                ctx.arc(centerX, centerY, harvestSize, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = COLORS.YELLOW;
                ctx.font = `${width * 0.1}px sans-serif`;
                ctx.textAlign = "center";
                ctx.fillText("収穫可能!", centerX, centerY - width * 0.3);
            }
        }
    }
}

// --- 4. プレイヤークラス ---
class Player {
    constructor() {
        this.score = 0;
        this.coins = 10;
    }
}

// --- 5. ゲームクラス ---
class FarmGame {
    constructor() {
        this.plots = [];
        this.player = new Player();
        this.gameState = "TITLE"; 
        this.time_left = GAME_TIME_LIMIT;
        this.lastTime = performance.now() / 1000;
        this.selectedCrop = CROP_KEYS[0];
        this.particles = [];
        this.logManager = new LogManager();
        
        // 畑の描画開始座標を保持するプロパティ (デバッグ用)
        this.plotGridStartX = 0; 
        this.plotGridStartY = 0;
        this.plotSize = PLOT_SIZE_DEFAULT; // 【新規】動的なサイズを保持
        
        // DOM要素の参照
        this.overlay = document.getElementById('overlay');
        this.overlayTitle = document.getElementById('overlay-title');
        this.overlayMessage = document.getElementById('overlay-message');
        this.restartButton = document.getElementById('restart-button');

        this.initPlots();
        this.initCropSelectionButtons();
        this.initEventListeners();
        this.updateUI();
    }
    
    // 【修正箇所】畑の配置ロジックと動的サイズ計算
    initPlots() {
        this.plots = []; 
        
        let plotSize = PLOT_SIZE_DEFAULT; // デフォルトサイズ
        
        // デスクトップ基準のキャンバスサイズ
        const CANVAS_TOTAL_WIDTH = SCREEN_WIDTH;
        const CANVAS_TOTAL_HEIGHT = SCREEN_HEIGHT;
        const PANEL_WIDTH = 280;
        
        // --- モバイル最適化: 正方形を保ちつつ、縦画面の利用可能領域に合わせる ---
        if (window.innerWidth <= 768) {
            const UI_HEIGHT_ASSUMED = 50 + 70; // UIバー + 種選択パネルの高さ (120)
            const LOG_HEIGHT_ASSUMED = 70; // ログエリア 70px
            // キャンバス全体 (750px) から固定UI高さを引いた、畑に使える垂直方向の領域
            const USABLE_HEIGHT_ON_CANVAS = CANVAS_TOTAL_HEIGHT - UI_HEIGHT_ASSUMED - LOG_HEIGHT_ASSUMED; // 750 - 190 = 560px

            const FIXED_PADDING_WIDTH = (GRID_SIZE - 1) * PLOT_PADDING; // 60
            
            // 560px に収まる最大サイズ (166px) を計算
            const REMAINDER_SIZE = USABLE_HEIGHT_ON_CANVAS - FIXED_PADDING_WIDTH; // 500
            plotSize = Math.floor(REMAINDER_SIZE / GRID_SIZE); // 166
        }

        this.plotSize = plotSize; // 計算したサイズをクラスプロパティに保存
        
        const totalGridWidth = GRID_SIZE * plotSize + (GRID_SIZE - 1) * PLOT_PADDING; 
        const totalGridHeight = totalGridWidth; // 常に正方形のグリッド
        
        let startX; 
        let startY;
        
        if (window.innerWidth <= 768) {
            const UI_HEIGHT_ASSUMED = 50 + 70; // 120
            const LOG_HEIGHT_ASSUMED = 70; // 70
            const USABLE_HEIGHT = CANVAS_TOTAL_HEIGHT - UI_HEIGHT_ASSUMED - LOG_HEIGHT_ASSUMED; // 560
            
            // Mobile: 内部キャンバス幅 (1000px) の中央に配置
            // (1000 - 558) / 2 = 221
            startX = (CANVAS_TOTAL_WIDTH - totalGridWidth) / 2; 
            
            // Mobile: UIエリア直下から、残りの領域 (560px) の中央に配置
            // 120 + (560 - 558) / 2 = 121
            startY = UI_HEIGHT_ASSUMED + (USABLE_HEIGHT - totalGridHeight) / 2; 

        } else {
            // デスクトップレイアウト 
            const canvasAreaWidth = CANVAS_TOTAL_WIDTH - PANEL_WIDTH; 
            const horizontalMargin = (canvasAreaWidth - totalGridWidth) / 2; 
            startX = PANEL_WIDTH + horizontalMargin; 
            
            const verticalMargin = (CANVAS_TOTAL_HEIGHT - totalGridHeight) / 2;
            startY = verticalMargin; 
        }
        
        this.plotGridStartX = startX;
        this.plotGridStartY = startY;

        for (let row = 0; row < GRID_SIZE; row++) {
            for (let col = 0; col < GRID_SIZE; col++) {
                const x = startX + col * (plotSize + PLOT_PADDING);
                const y = startY + row * (plotSize + PLOT_PADDING);
                // 【修正点】計算した plotSize を Plot のコンストラクタに渡す
                this.plots.push(new Plot(x, y, col, row, plotSize)); 
            }
        }
    }

    initCropSelectionButtons() {
        const cropPanel = document.getElementById('crop-selection-panel');
        cropPanel.innerHTML = '<h3 class="panel-title">種選択</h3>';
        CROP_KEYS.forEach(key => {
            const data = CROP_TYPES[key];
            const button = document.createElement('button');
            button.className = 'crop-button';
            button.id = `crop-button-${key}`;
            button.innerHTML = `
                <span>${data.name}</span>
                <span style="font-size:0.8em;">費用:${data.cost}C / スコア:${data.score}P</span>
            `;
            button.addEventListener('click', () => this.selectCrop(key));
            cropPanel.appendChild(button);
        });
        this.selectCrop(this.selectedCrop);
    }

    // 【修正済み】クリックイベントリスナー
    initEventListeners() {
        CANVAS.addEventListener('click', (e) => {
            const rect = CANVAS.getBoundingClientRect();
            // クリック位置をデスクトップ座標に変換 (スケール補正)
            const scaleX = CANVAS.width / rect.width;
            const scaleY = CANVAS.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            
            this.handleClick({ x, y });
        });
        
        this.restartButton.addEventListener('click', () => this.handleRestartClick());
    }
    
    // --- イベントハンドラ ---
    selectCrop(key) {
        this.selectedCrop = key;
        document.querySelectorAll('.crop-button').forEach(btn => btn.classList.remove('selected'));
        document.getElementById(`crop-button-${key}`).classList.add('selected');
        this.logManager.addLog(`種を選択: ${CROP_TYPES[key].name}`, COLORS.WHITE);
    }

    // 【修正済み】クリック判定ロジック
    handleClick(pos) {
        if (this.gameState === "TITLE" || this.gameState === "GAMEOVER" || this.gameState !== "PLAYING") return;

        let clickedPlot = null;
        for (const plot of this.plots) {
            // Plot の rect には動的な plotSize が反映されているため、描画と判定が一致
            if (pos.x >= plot.rect.x && pos.x <= plot.rect.x + plot.rect.width &&
                pos.y >= plot.rect.y && pos.y <= plot.rect.y + plot.rect.height) {
                clickedPlot = plot;
                break;
            }
        }

        if (clickedPlot) {
            this.executePlotAction(clickedPlot);
        }
    }

    handleRestartClick() {
        if (this.gameState === "TITLE") {
            this.startGame();
        } else if (this.gameState === "GAMEOVER") {
            this.restartGame();
        }
    }
    
    // --- ゲーム状態管理 ---
    startGame() {
        this.gameState = "PLAYING";
        this.overlay.style.display = 'none';
    }
    
    // 【修正済み】リスタート時の初期化
    restartGame() {
        this.plots = [];
        this.player = new Player();
        this.time_left = GAME_TIME_LIMIT;
        this.lastTime = performance.now() / 1000;
        this.selectedCrop = CROP_KEYS[0];
        this.particles = [];
        this.logManager.logContainer.innerHTML = '';
        this.logManager.logs = []; 
        
        this.initPlots(); 
        this.selectCrop(this.selectedCrop); 
        this.startGame();
    }
    
    gameOver() {
        this.gameState = "GAMEOVER";
        this.overlay.style.display = 'flex';
        this.overlayTitle.textContent = "ゲーム終了！";
        this.overlayMessage.textContent = `最終スコア: ${this.player.score}\n\n`;
        this.restartButton.textContent = "もう一度プレイ";
    }

    // --- ロジック実行 ---
    executePlotAction(plot) {
        // plot.rect.width を使って動的にサイズを取得できる
        const plotSize = plot.rect.width; 
        const cropData = CROP_TYPES[this.selectedCrop];
        
        if (plot.state === "EMPTY") {
            if (this.player.coins >= cropData.cost) {
                plot.plant(this.selectedCrop);
                this.player.coins -= cropData.cost;
                this.createParticles({ x: plot.rect.x + plotSize/2, y: plot.rect.y + plotSize/2 }, PARTICLE_COLORS["plant"], 8, 3);
                this.logManager.addLog(`[${cropData.name}]を植えました (費用: -${cropData.cost}C)`, COLORS.RED_COST);
            } else {
                this.logManager.addLog("コインが足りません！", COLORS.RED_COST);
            }
        } else if (plot.state === "READY") {
            const data = CROP_TYPES[plot.cropType];
            plot.state = "EMPTY";
            plot.cropType = null;
            this.player.score += data.score;
            this.player.coins += data.yield;
            this.createParticles({ x: plot.rect.x + plotSize/2, y: plot.rect.y + plotSize/2 }, PARTICLE_COLORS["harvest"], 15, 7);
            this.logManager.addLog(`[${data.name}]を収穫！ (+${data.score}P, +${data.yield}C)`, COLORS.GREEN_GAIN);
        } else if (plot.state === "SEED" || plot.state === "GROWING") {
             if (!plot.watered) {
                plot.watered = true;
                const data = CROP_TYPES[plot.cropType];
                plot.growthTimer = Math.max(0, plot.growthTimer - data.water_boost); 
                this.createParticles({ x: plot.rect.x + plotSize/2, y: plot.rect.y + plotSize/2 }, PARTICLE_COLORS["water"], 12, 5);
                this.logManager.addLog(`[${data.name}]に水やり (成長加速)`, COLORS.BLUE_LIGHT);
            } else {
                this.logManager.addLog("すでに水が与えられています", COLORS.WHITE);
            }
        }
        this.updateUI();
    }

    createParticles(pos, baseColor, count, speed) {
        for (let i = 0; i < count; i++) {
            const vel = {
                x: (Math.random() * 2 - 1) * speed,
                y: (Math.random() * 2 - 1) * speed
            };
            const life = Math.random() * 0.5 + 0.5;
            const size = Math.floor(Math.random() * 4) + 3;
            this.particles.push(new Particle(pos, baseColor, size, vel, life));
        }
    }

    // --- UI更新 ---
    updateUI() {
        document.getElementById('score-display').textContent = `スコア: ${this.player.score}`;
        document.getElementById('coins-display').textContent = `コイン: ${this.player.coins}`;
        
        const timeDisplay = Math.max(0, Math.floor(this.time_left));
        const minutes = String(Math.floor(timeDisplay / 60)).padStart(2, '0');
        const seconds = String(timeDisplay % 60).padStart(2, '0');
        document.getElementById('timer-display').textContent = `残り時間: ${minutes}:${seconds}`;
    }

    // --- メインループ ---
    update() {
        const currentTime = performance.now() / 1000;
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        this.logManager.update(deltaTime);

        this.particles = this.particles.filter(p => {
            p.update(deltaTime);
            return p.life > 0;
        });

        if (this.gameState === "PLAYING") {
            this.time_left -= deltaTime;
            if (this.time_left <= 0) {
                this.time_left = 0;
                this.gameOver();
            }

            this.plots.forEach(plot => plot.update(deltaTime));
            
            this.updateUI();
        }
    }

    draw() {
        if (this.gameState === "TITLE") {
            this.drawTutorial(CTX);
            return;
        }
        
        // 背景
        CTX.fillStyle = COLORS.BLUE_LIGHT;
        CTX.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        
        // 畑のマス
        this.plots.forEach(plot => plot.draw(CTX));

        // パーティクル
        this.particles.forEach(p => p.draw(CTX));
    }

    drawTutorial(ctx) {
        this.overlay.style.backgroundColor = 'rgba(34, 139, 34, 0.9)';
        this.overlay.style.display = 'flex';
        this.overlayTitle.textContent = "ミニファーム・ダッシュ！";
        this.overlayMessage.textContent = 
            `【目標】 1分間で畑を育て、最高のスコアを目指しましょう。\n
            ▶️ 操作方法 (クリック/タップ)\n
            - 種選択パネル: 植えたい種を選択\n
            - 空の畑: 種をまく (コスト消費)\n
            - 成長中の作物: 水やり (成長を加速)\n
            - 収穫可能: 収穫 (スコアとコイン獲得)`;
        this.restartButton.textContent = "画面をクリックしてゲーム開始！";
    }
}

// メイン実行
const game = new FarmGame();
let animationFrameId;

function loop() {
    game.update();
    game.draw();
    
    animationFrameId = requestAnimationFrame(loop);
}

// ゲーム開始
loop();