
import { Engine, Loader, Color, Scene, EngineOptions, ImageSource, Vector, PostUpdateEvent, Actor, Rectangle, vec, SpriteSheet, Sprite, Sound } from "excalibur";
import { getResources, SCALE, GLOVES_WIDTH, GLOVES_HEIGHT, KNOCKBACK_FORCE } from "../constants";
import { Player } from "./Player";
import { Gloves } from "./Gloves";
import { Net } from "./Net";
import { BloodParticle } from "./BloodParticle";
import { GameSnapshot, GameState, EntitySnapshot } from "../types";
import { NetworkManager } from "./NetworkManager";
import { CameraManager } from "./CameraManager";

export interface GameResources {
    SpriteSheet: ImageSource;
    GlovesSheet: ImageSource;
    StarsSheet: ImageSource;
    StanleySheet: ImageSource;
    GoalNetsSheet: ImageSource;
    PunchHiSound: Sound;
    PunchLowSound: Sound;
}

export class HockeyGame extends Engine {
    public player1?: Player;
    public player2?: Player;
    private uiCallback?: (state: GameState) => void;
    public isGameOver: boolean = false;
    public winner: 'PLAYER 1' | 'PLAYER 2' | null = null;
    public resources: GameResources;
    public cameraManager: CameraManager;

    public koTimer: number = 0;
    public glovesLanded: boolean = false;
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
    
    // Settings
    private sfxVolume: number = 0.15;

    private handlePostUpdate = (evt: PostUpdateEvent) => {
        if (this.isReplaying) {
            this.handleReplayLogic();
        } else {
            // Only update game logic if players are initialized
            if (this.player1 && this.player2) {
                this.recordReplayFrame();
                this.checkGameOver();
                
                if (this.isGameOver && this.winner) {
                    this.koTimer += evt.elapsed;
                }

                this.cameraManager.update(evt.elapsed);
                
                // Multiplayer Sync
                if (this.networkManager) {
                    this.broadcastState();
                }
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
        this.cameraManager = new CameraManager(this);
    }

    async start() {
        const loader = new Loader([
            this.resources.SpriteSheet, 
            this.resources.GlovesSheet,
            this.resources.StarsSheet,
            this.resources.StanleySheet,
            this.resources.GoalNetsSheet,
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
        this.updateUI();
    }
    
    public setSFXVolume(volume: number) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
        this.updateUI();
    }

    public playHitSound(type: 'high' | 'low') {
        if (!this.isReplaying) {
            const vol = this.sfxVolume;
            if (type === 'high') {
                this.resources.PunchHiSound.play(vol);
            } else {
                this.resources.PunchLowSound.play(vol);
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
            // Check players existence before sync/hit
            if (!this.player1 || !this.player2) return;

            if (msg.type === 'SYNC') {
                // Determine which player payload belongs to
                // If I am Host (P1), msg is from P2.
                // If I am Client (P2), msg is from P1.
                const targetPlayer = this.isHost ? this.player2 : this.player1;
                targetPlayer?.syncFromNetwork(msg.payload);
            } else if (msg.type === 'HIT') {
                const targetP1 = msg.payload.targetP1;
                const damageType = msg.payload.damageType;
                
                const victim = targetP1 ? this.player1 : this.player2;
                const attacker = targetP1 ? this.player2 : this.player1;

                if (!victim || !attacker) return;

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
        this.cameraManager.shake(duration, strength);
    }

    private reset() {
        ((this as any).currentScene as any).clear();

        // Add Net to background (center X, somewhat high Y to look like background)
        const net = new Net(400, 50);
        ((this as any).currentScene as any).add(net);

        this.isGameOver = false;
        this.winner = null;
        this.koTimer = 0;
        this.glovesLanded = false;
        this.winTriggered = false;
        
        this.isReplaying = false;
        this.replayBuffer = [];
        this.replayIndex = 0;
        this.playbackSpeed = 1;
        this.replayPool = []; 
        this.currentFrameSounds = [];

        this.cameraManager.reset();

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
        if (!this.player1 || !this.player2) return;

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
                    const vol = this.sfxVolume;
                    f.sounds.forEach(s => {
                        if (s === 'high') this.resources.PunchHiSound.play(vol);
                        else if (s === 'low') this.resources.PunchLowSound.play(vol);
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
        if (!this.player1 || !this.player2) return;

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

    private checkGameOver() {
        if (!this.player1 || !this.player2) return;

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
                p1Health: this.player1?.health ?? 5,
                p2Health: this.player2?.health ?? 5,
                p1State: this.player1?.state.toUpperCase().replace('_', ' ') ?? 'READY',
                p2State: this.player2?.state.toUpperCase().replace('_', ' ') ?? 'READY',
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
                opponentDisconnected: this.opponentDisconnected,
                sfxVolume: this.sfxVolume
            });
        }
    }
}
