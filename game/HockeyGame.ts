
import { Engine, Loader, Color, Scene, EngineOptions, ImageSource, Vector, PostUpdateEvent, Actor, Rectangle, vec, SpriteSheet, Sprite, Sound } from "excalibur";
import { getResources, SCALE, GLOVES_WIDTH, GLOVES_HEIGHT, KNOCKBACK_FORCE } from "../constants";
import { Player } from "./Player";
import { Gloves } from "./Gloves";
import { BloodParticle } from "./BloodParticle";
import { GameSnapshot, GameState, EntitySnapshot } from "../types";
import { NetworkManager } from "./NetworkManager";

export interface GameResources {
    SpriteSheet: ImageSource;
    GlovesSheet: ImageSource;
    StarsSheet: ImageSource;
    StanleySheet: ImageSource;
    PunchHiSound: Sound;
    PunchLowSound: Sound;
}

export class HockeyGame extends Engine {
    private player1!: Player;
    private player2!: Player;
    private uiCallback?: (state: GameState) => void;
    public isGameOver: boolean = false;
    private winner: 'PLAYER 1' | 'PLAYER 2' | null = null;
    public resources: GameResources;

    private shakeTimer: number = 0;
    private shakeStrength: number = 0;
    private koTimer: number = 0;
    private glovesLanded: boolean = false;
    private winTriggered: boolean = false;

    // Multiplayer
    public networkManager: NetworkManager | null = null;
    private isHost: boolean = false;
    public opponentDisconnected: boolean = false;

    // Replay System
    public isReplaying: boolean = false;
    private replayBuffer: GameSnapshot[] = [];
    private replayIndex: number = 0;
    private playbackSpeed: number = 1;
    private currentFrameSounds: ('high' | 'low')[] = [];
    
    // Replay Rendering
    private replayPool: Actor[] = [];
    private bloodRect!: Rectangle;
    private gloveSpriteP1!: Sprite;
    private gloveSpriteP2!: Sprite;

    private handlePostUpdate = (evt: PostUpdateEvent) => {
        if (this.isReplaying) {
            this.handleReplayLogic();
        } else {
            this.recordReplayFrame();
            this.checkGameOver();
            this.updateCamera(evt.elapsed);
            
            // Multiplayer Sync
            if (this.networkManager) {
                this.broadcastState();
            }
        }
        this.updateUI();
    };

    private onGlovesDropped = (evt: any) => {
        const gloves = new Gloves(evt.x, evt.y, evt.isPlayer1);
        ((this as any).currentScene as any).add(gloves);
    };

    private onGlovesLanded = () => {
        this.glovesLanded = true;
    };

    constructor(options: EngineOptions) {
        super(options);
        this.resources = getResources();
    }

    async start() {
        const loader = new Loader([
            this.resources.SpriteSheet, 
            this.resources.GlovesSheet,
            this.resources.StarsSheet,
            this.resources.StanleySheet,
            this.resources.PunchHiSound,
            this.resources.PunchLowSound
        ]);
        loader.suppressPlayButton = true;
        
        this.bloodRect = new Rectangle({ width: 3, height: 3, color: Color.White });
        
        return super.start(loader).then(() => {
            const gloveSheet = SpriteSheet.fromImageSource({
                image: this.resources.GlovesSheet,
                grid: { rows: 1, columns: 2, spriteWidth: GLOVES_WIDTH, spriteHeight: GLOVES_HEIGHT }
            });
            this.gloveSpriteP1 = gloveSheet.getSprite(0, 0);
            this.gloveSpriteP1.scale = vec(SCALE, SCALE);
            this.gloveSpriteP2 = gloveSheet.getSprite(1, 0);
            this.gloveSpriteP2.scale = vec(SCALE, SCALE);
        });
    }

    setupGame(uiCallback: (state: GameState) => void) {
        this.uiCallback = uiCallback;
        // Do not auto-reset here, wait for setupNetwork or manual reset call
    }

    public playHitSound(type: 'high' | 'low') {
        if (!this.isReplaying) {
            if (type === 'high') {
                this.resources.PunchHiSound.play(0.5);
            } else {
                this.resources.PunchLowSound.play(0.5);
            }
            this.currentFrameSounds.push(type);
        }
    }

    public setupNetwork(manager: NetworkManager, isHost: boolean) {
        this.networkManager = manager;
        this.isHost = isHost;
        this.opponentDisconnected = false;

        // Setup Listener
        this.networkManager.onMessage = (msg) => {
            if (msg.type === 'SYNC') {
                // Determine which player payload belongs to
                // If I am Host (P1), msg is from P2.
                // If I am Client (P2), msg is from P1.
                const targetPlayer = this.isHost ? this.player2 : this.player1;
                targetPlayer.syncFromNetwork(msg.payload);
            } else if (msg.type === 'HIT') {
                const targetP1 = msg.payload.targetP1;
                const damageType = msg.payload.damageType;
                
                const victim = targetP1 ? this.player1 : this.player2;
                const attacker = targetP1 ? this.player2 : this.player1;

                // Apply damage
                victim.takeDamage(damageType);
                
                // Knockback
                const dir = (attacker as any).pos.x < (victim as any).pos.x ? 1 : -1;
                victim.vx += dir * KNOCKBACK_FORCE;

                this.shake(200, 5);
                this.playHitSound(damageType);

                // Blood
                if (damageType === 'high') {
                    const amount = 6 + Math.floor(Math.random() * 4);
                    for (let i = 0; i < amount; i++) {
                        const spawnX = (victim as any).pos.x;
                        const spawnY = (victim as any).pos.y - 70 + (Math.random() * 20 - 10);
                        const blood = new BloodParticle(spawnX, spawnY, dir);
                        (this as any).currentScene.add(blood);
                    }
                }
            } else if (msg.type === 'RESTART') {
                this.reset();
            }
        };

        this.networkManager.onDisconnect = () => {
            console.log("Opponent disconnected");
            this.opponentDisconnected = true;
            this.isGameOver = true;
            this.updateUI();
        };

        this.reset();
    }

    public sendHit(type: 'high' | 'low', targetP1: boolean) {
        if (this.networkManager) {
            this.networkManager.send({
                type: 'HIT',
                payload: { damageType: type, targetP1 }
            });
        }
    }

    private broadcastState() {
        if (!this.player1 || !this.player2) return;

        // Send MY player's state
        const localPlayer = this.isHost ? this.player1 : this.player2;
        
        this.networkManager?.send({
            type: 'SYNC',
            payload: localPlayer.getSyncState()
        });
    }

    restartGame() {
        this.reset();
        
        if (this.networkManager) {
            this.networkManager.send({ type: 'RESTART', payload: {} });
        }
    }

    public shake(duration: number, strength: number) {
        this.shakeTimer = duration;
        this.shakeStrength = strength;
    }

    private reset() {
        ((this as any).currentScene as any).clear();

        this.isGameOver = false;
        this.winner = null;
        this.shakeTimer = 0;
        this.koTimer = 0;
        this.glovesLanded = false;
        this.winTriggered = false;
        
        // Don't reset opponentDisconnected here, as it's a persistent state until the session ends
        // But if we are manually restarting (via menu), we might want to. 
        // For now, assume restartGame is called when we want to play again, which implies connection is good.
        // However, if disconnect happened, we probably force a page reload via UI, so this reset logic is fine.
        
        this.isReplaying = false;
        this.replayBuffer = [];
        this.replayIndex = 0;
        this.playbackSpeed = 1;
        this.replayPool = []; 
        this.currentFrameSounds = [];

        (this as any).currentScene.camera.zoom = 1;
        (this as any).currentScene.camera.pos = new Vector(400, 200);

        const centerY = 400 / 2 + 50; 
        
        this.player1 = new Player(250, centerY, true);
        this.player2 = new Player(550, centerY, false);
        
        // Configure Local vs Network Control
        if (this.networkManager) {
            if (this.isHost) {
                this.player1.isLocal = true;
                this.player2.isLocal = false; // Controlled by network
            } else {
                this.player1.isLocal = false; // Controlled by network
                this.player2.isLocal = true;
            }
        } else {
            // Local Multiplayer (Hotseat)
            this.player1.isLocal = true;
            this.player2.isLocal = true;
        }

        this.player1.opponent = this.player2;
        this.player2.opponent = this.player1;

        ((this as any).currentScene as any).add(this.player1);
        ((this as any).currentScene as any).add(this.player2);

        // Remove old listeners to prevent duplicates
        ((this as any).currentScene as any).off('glovesDropped', this.onGlovesDropped);
        ((this as any).currentScene as any).off('glovesLanded', this.onGlovesLanded);

        // Add listeners
        ((this as any).currentScene as any).on('glovesDropped', this.onGlovesDropped);
        ((this as any).currentScene as any).on('glovesLanded', this.onGlovesLanded);

        (this as any).off('postupdate', this.handlePostUpdate);
        (this as any).on('postupdate', this.handlePostUpdate);
    }

    // --- REPLAY LOGIC ---

    public toggleReplay(enable: boolean) {
        this.isReplaying = enable;
        if (enable) {
            this.replayIndex = 0;
            this.playbackSpeed = 1;
            
            (this as any).currentScene.actors.forEach((actor: any) => {
                if (actor instanceof BloodParticle || actor instanceof Gloves) {
                    (actor as any).kill();
                }
            });
        } else {
            if (this.replayBuffer.length > 0) {
                this.applySnapshot(this.replayBuffer[this.replayBuffer.length - 1]);
            }
        }
    }

    public setPlaybackSpeed(speed: number) {
        this.playbackSpeed = speed;
    }

    public seekTo(percent: number) {
        if (!this.replayBuffer.length) return;
        this.replayIndex = Math.floor(Math.max(0, Math.min(1, percent)) * (this.replayBuffer.length - 1));
    }

    private recordReplayFrame() {
        if (this.isGameOver && this.koTimer > 5000) return;

        const entities: EntitySnapshot[] = [];
        
        (this as any).currentScene.actors.forEach((actor: any) => {
            if (actor instanceof BloodParticle) {
                 entities.push({
                     type: 'blood',
                     x: (actor as any).pos.x,
                     y: (actor as any).pos.y,
                     scale: (actor as any).scale.x,
                     color: (actor as any).color.toHex(),
                     zIndex: (actor as any).z
                 });
            } else if (actor instanceof Gloves) {
                 entities.push({
                     type: 'glove',
                     x: (actor as any).pos.x,
                     y: (actor as any).pos.y,
                     scale: (actor as any).scale.x,
                     zIndex: (actor as any).z,
                     isPlayer1: (actor as Gloves).isPlayer1
                 });
            }
        });

        if (this.player1 && this.player2) {
            this.replayBuffer.push({
                p1: this.player1.getSnapshot(),
                p2: this.player2.getSnapshot(),
                cameraPos: { x: (this as any).currentScene.camera.pos.x, y: (this as any).currentScene.camera.pos.y },
                cameraZoom: (this as any).currentScene.camera.zoom,
                entities: entities,
                sounds: [...this.currentFrameSounds]
            });
            this.currentFrameSounds = [];
        }
    }

    private handleReplayLogic() {
        if (this.replayBuffer.length === 0) return;

        const prevIndex = Math.floor(this.replayIndex);
        this.replayIndex += this.playbackSpeed;

        if (this.replayIndex >= this.replayBuffer.length - 1) {
            this.replayIndex = this.replayBuffer.length - 1;
            this.playbackSpeed = 0; 
        }
        if (this.replayIndex < 0) {
            this.replayIndex = 0;
            this.playbackSpeed = 0; 
        }

        const currentIndex = Math.floor(this.replayIndex);

        // Play sounds if we advanced forward
        if (this.playbackSpeed > 0 && currentIndex > prevIndex) {
            for (let i = prevIndex + 1; i <= currentIndex; i++) {
                const f = this.replayBuffer[i];
                if (f && f.sounds) {
                    f.sounds.forEach(s => {
                        if (s === 'high') this.resources.PunchHiSound.play(0.5);
                        else if (s === 'low') this.resources.PunchLowSound.play(0.5);
                    });
                }
            }
        }

        const frame = this.replayBuffer[currentIndex];
        if (frame) {
            this.applySnapshot(frame);
        }
    }

    private applySnapshot(frame: GameSnapshot) {
        this.player1.setFromSnapshot(frame.p1);
        this.player2.setFromSnapshot(frame.p2);
        (this as any).currentScene.camera.pos = new Vector(frame.cameraPos.x, frame.cameraPos.y);
        (this as any).currentScene.camera.zoom = frame.cameraZoom;

        let poolIndex = 0;

        for (const ent of frame.entities) {
            let actor: Actor;

            if (poolIndex >= this.replayPool.length) {
                actor = new Actor({ anchor: vec(0.5, 0.5) }); 
                (this as any).currentScene.add(actor);
                this.replayPool.push(actor);
            } else {
                actor = this.replayPool[poolIndex];
            }

            (actor as any).pos.x = ent.x;
            (actor as any).pos.y = ent.y;
            (actor as any).z = ent.zIndex;
            (actor as any).scale = vec(ent.scale, ent.scale);
            (actor as any).graphics.visible = true;

            if (ent.type === 'blood') {
                (actor as any).graphics.use(this.bloodRect);
                (actor as any).color = Color.fromHex(ent.color!); 
            } else if (ent.type === 'glove') {
                (actor as any).graphics.use(ent.isPlayer1 ? this.gloveSpriteP1 : this.gloveSpriteP2);
                (actor as any).color = Color.White;
            }

            poolIndex++;
        }

        for (let i = poolIndex; i < this.replayPool.length; i++) {
            (this.replayPool[i] as any).graphics.visible = false;
        }
    }

    // --------------------

    private updateCamera(delta: number) {
        if (!this.player1 || !this.player2) return;

        const SCREEN_WIDTH = 800;
        const SCREEN_HEIGHT = 400;
        
        let targetZoom = 1.0;
        let targetX = 400;
        let targetY = SCREEN_HEIGHT / 2;

        if (!this.glovesLanded) {
             targetZoom = 1.0;
             targetX = 400;
             targetY = 200;
        } else if (this.isGameOver && this.winner) {
            this.koTimer += delta;
            
            if (this.koTimer < 2000) {
                const loser = this.winner === 'PLAYER 2' ? this.player1 : this.player2;
                targetZoom = 3.5;
                
                const dir = ((loser as any).pos.x < ((loser.opponent as any)?.pos.x ?? 0)) ? 1 : -1;
                targetX = (loser as any).pos.x + (25 * dir);
                
                targetY = (loser as any).pos.y - 50;
            } else {
                targetZoom = 1.0;
                targetX = 400;
                targetY = 200;
            }
        } else {
            const p1 = (this.player1 as any).pos.x;
            const p2 = (this.player2 as any).pos.x;
            const midpoint = (p1 + p2) / 2;
            const distance = Math.abs(p1 - p2);

            const MIN_ZOOM = 1.0;
            const MAX_ZOOM = 1.4; 
            const PADDING = 250; 

            const requiredWidth = distance + PADDING;
            targetZoom = SCREEN_WIDTH / requiredWidth;
            
            targetZoom = Math.max(MIN_ZOOM, Math.min(targetZoom, MAX_ZOOM));
            
            targetX = midpoint;
            targetY = SCREEN_HEIGHT / 2;
        }

        const lerpFactor = 0.02; 
        const currentZoom = (this as any).currentScene.camera.zoom;
        const newZoom = currentZoom + (targetZoom - currentZoom) * lerpFactor;
        (this as any).currentScene.camera.zoom = newZoom;

        const viewWidth = SCREEN_WIDTH / newZoom;
        const viewHeight = SCREEN_HEIGHT / newZoom;
        
        const halfViewW = viewWidth / 2;
        const halfViewH = viewHeight / 2;
        
        const minX = halfViewW;
        const maxX = 800 - halfViewW;
        const minY = halfViewH;
        const maxY = 400 - halfViewH;

        targetX = Math.max(minX, Math.min(targetX, maxX));
        targetY = Math.max(minY, Math.min(targetY, maxY));

        const currentX = (this as any).currentScene.camera.pos.x;
        const currentY = (this as any).currentScene.camera.pos.y;
        
        const newX = currentX + (targetX - currentX) * lerpFactor;
        const newY = currentY + (targetY - currentY) * lerpFactor;

        let shakeX = 0;
        let shakeY = 0;
        if (this.shakeTimer > 0) {
            this.shakeTimer -= delta;
            if (this.shakeTimer < 0) this.shakeTimer = 0;
            shakeX = (Math.random() * this.shakeStrength * 2) - this.shakeStrength;
            shakeY = (Math.random() * this.shakeStrength * 2) - this.shakeStrength;
        }

        (this as any).currentScene.camera.pos = new Vector(newX + shakeX, newY + shakeY);
    }

    private checkGameOver() {
        if (!this.isGameOver) {
            if (this.player1.state === 'down' || this.player1.state === 'falling') {
                this.isGameOver = true;
                this.winner = 'PLAYER 2';
            } else if (this.player2.state === 'down' || this.player2.state === 'falling') {
                this.isGameOver = true;
                this.winner = 'PLAYER 1';
            }
        }

        if (this.isGameOver && !this.winTriggered && this.winner) {
            if (this.koTimer > 1000) {
                this.winTriggered = true;
                if (this.winner === 'PLAYER 1') {
                    this.player1.setState('win');
                } else {
                    this.player2.setState('win');
                }
            }
        }
    }

    private updateUI() {
        if (this.uiCallback) {
            const bufferLen = this.replayBuffer.length;
            const progress = bufferLen > 0 ? this.replayIndex / bufferLen : 0;

            this.uiCallback({
                p1Health: this.player1.health,
                p2Health: this.player2.health,
                p1State: this.player1.state.toUpperCase().replace('_', ' '),
                p2State: this.player2.state.toUpperCase().replace('_', ' '),
                gameOver: this.isGameOver,
                showGameOver: this.isGameOver && this.koTimer > 3000,
                winner: this.winner,
                isReplaying: this.isReplaying,
                replayProgress: progress,
                replaySpeed: this.playbackSpeed,
                isMultiplayer: !!this.networkManager,
                connectionStatus: this.networkManager ? 'connected' : 'disconnected',
                roomId: this.networkManager ? '...' : undefined,
                isHost: this.isHost,
                opponentDisconnected: this.opponentDisconnected
            });
        }
    }
}
