
import { Engine, Loader, Color, Scene, EngineOptions, ImageSource, Vector, PostUpdateEvent, Actor, Rectangle, vec, SpriteSheet, Sprite, Sound } from "excalibur";
import { getResources, SCALE, GLOVES_WIDTH, GLOVES_HEIGHT, KNOCKBACK_FORCE } from "../constants";
import { Player } from "./Player";
import { Gloves } from "./Gloves";
import { Net } from "./Net";
import { BloodParticle } from "./BloodParticle";
import { GameSnapshot, GameState, EntitySnapshot } from "../types";
import { NetworkManager } from "./NetworkManager";
import { CameraManager } from "./CameraManager";
import { ReplayManager } from "./ReplayManager";
import { Framer } from "./Framer";
import { Rink } from "./Rink";

export interface GameResources {
    SpriteSheet: ImageSource;
    GlovesSheet: ImageSource;
    StarsSheet: ImageSource;
    StanleySheet: ImageSource;
    GoalNetsSheet: ImageSource;
    PunchHiSound: Sound;
    PunchLowSound: Sound;
    FramerSheet: ImageSource;
    RinkSheet: ImageSource;
}

export class HockeyGame extends Engine {
    public player1?: Player;
    public player2?: Player;
    private uiCallback?: (state: GameState) => void;
    public isGameOver: boolean = false;
    public winner: 'PLAYER 1' | 'PLAYER 2' | null = null;
    public resources: GameResources;
    public cameraManager: CameraManager;
    public replayManager: ReplayManager;

    public koTimer: number = 0;
    public glovesLanded: boolean = false;
    private winTriggered: boolean = false;

    // Multiplayer
    public networkManager: NetworkManager | null = null;
    private isHost: boolean = false;
    public opponentDisconnected: boolean = false;
    
    // Settings
    public sfxVolume: number = 0.15;

    public get isReplaying(): boolean {
        return this.replayManager.isReplaying;
    }

    private handlePostUpdate = (evt: PostUpdateEvent) => {
        if (this.replayManager.isReplaying) {
            this.replayManager.update();
        } else {
            // Only update game logic if players are initialized
            if (this.player1 && this.player2) {
                this.replayManager.recordFrame();
                this.checkGameOver();
                
                // Only increment KO timer if the loser has landed (slow motion is done)
                if (this.isGameOver && this.winner && this.timescale >= 1.0) {
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
        this.replayManager = new ReplayManager(this);
    }

    async start() {
        const loader = new Loader([
            this.resources.SpriteSheet, 
            this.resources.GlovesSheet,
            this.resources.StarsSheet,
            this.resources.StanleySheet,
            this.resources.GoalNetsSheet,
            this.resources.PunchHiSound,
            this.resources.PunchLowSound,
            this.resources.FramerSheet,
            this.resources.RinkSheet
        ]);
        loader.suppressPlayButton = true;
        
        return super.start(loader).then(() => {
            this.replayManager.init();
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
        if (!this.replayManager.isReplaying) {
            const vol = this.sfxVolume;
            if (type === 'high') {
                this.resources.PunchHiSound.play(vol);
            } else {
                this.resources.PunchLowSound.play(vol);
            }
            this.replayManager.recordSound(type);
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
        this.timescale = 1.0;

        // Add Rink background
        const rink = new Rink(0, 0);
        ((this as any).currentScene as any).add(rink);

        // Add Net to background (center X, somewhat high Y to look like background)
        //const net = new Net(400, 50);
        //((this as any).currentScene as any).add(net);

        // Add P1 HUD Framer (bottom left)
        const p1Hud = new Framer(110, 390, 4, 3);
        ((this as any).currentScene as any).add(p1Hud);

        // Add P2 HUD Framer (bottom right)
        const p2Hud = new Framer(790, 390, 5, 3);
        ((this as any).currentScene as any).add(p2Hud);

        this.isGameOver = false;
        this.winner = null;
        this.koTimer = 0;
        this.glovesLanded = false;
        this.winTriggered = false;
        
        this.replayManager.reset();
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
        this.replayManager.toggleReplay(enable);
    }

    public setPlaybackSpeed(speed: number) {
        this.replayManager.setPlaybackSpeed(speed);
    }

    public seekTo(percent: number) {
        this.replayManager.seekTo(percent);
    }

    private checkGameOver() {
        if (!this.player1 || !this.player2) return;

        if (!this.isGameOver) {
            // Start slow motion if someone is falling
            if (this.player1.state === 'falling' || this.player2.state === 'falling') {
                this.timescale = 0.25;
            }

            if (this.player1.state === 'down' || this.player1.state === 'falling') {
                this.isGameOver = true;
                this.winner = 'PLAYER 2';
            } else if (this.player2.state === 'down' || this.player2.state === 'falling') {
                this.isGameOver = true;
                this.winner = 'PLAYER 1';
            }
        }

        // Restore normal speed when the loser hits the ground (state 'down')
        if (this.isGameOver && this.timescale < 1.0) {
            const loser = this.winner === 'PLAYER 1' ? this.player2 : this.player1;
            if (loser && loser.state === 'down') {
                this.timescale = 1.0;
            }
        }

        if (this.isGameOver && !this.winTriggered && this.winner) {
            // Wait for fall (slow motion) + a moment on ground before showing win pose
            if (this.koTimer > 500) {
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
            const bufferLen = this.replayManager.replayBuffer.length;
            const progress = bufferLen > 0 ? this.replayManager.replayIndex / bufferLen : 0;

            this.uiCallback({
                p1Health: this.player1?.health ?? 5,
                p2Health: this.player2?.health ?? 5,
                p1State: this.player1?.state.toUpperCase().replace('_', ' ') ?? 'READY',
                p2State: this.player2?.state.toUpperCase().replace('_', ' ') ?? 'READY',
                gameOver: this.isGameOver,
                showGameOver: this.isGameOver && this.koTimer > 3000,
                winner: this.winner,
                isReplaying: this.replayManager.isReplaying,
                replayProgress: progress,
                replaySpeed: this.replayManager.playbackSpeed,
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
