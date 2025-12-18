import { Engine, Loader, Color, Scene, EngineOptions, ImageSource, Vector, PostUpdateEvent, Actor, Rectangle, vec, SpriteSheet, Sprite, Sound, SpriteFont, Text, ScreenElement } from "excalibur";
import { getResources, SCALE, GLOVES_WIDTH, GLOVES_HEIGHT, KNOCKBACK_FORCE, FINISHER_KNOCKBACK_FORCE } from "../constants";
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
import { HealthBar } from "./HealthBar";

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
    SmallFontSheet: ImageSource;
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
    private p1StateDisplay?: Text;
    private p2StateDisplay?: Text;

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
        this.resources = getResources() as any;
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
            this.resources.RinkSheet,
            this.resources.SmallFontSheet
        ]);
        loader.suppressPlayButton = true;
        
        return super.start(loader).then(() => {
            this.replayManager.init();
        });
    }

    setupGame(uiCallback: (state: GameState) => void) {
        this.uiCallback = uiCallback;
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

        this.networkManager.onMessage = (msg) => {
            if (!this.player1 || !this.player2) return;

            // If we are currently replaying, ignore SYNC and HIT packets.
            // These would move the actors and fight with the replay manager.
            if (this.isReplaying && (msg.type === 'SYNC' || msg.type === 'HIT')) {
                return;
            }

            if (msg.type === 'SYNC') {
                const targetPlayer = this.isHost ? this.player2 : this.player1;
                targetPlayer?.syncFromNetwork(msg.payload);
            } else if (msg.type === 'HIT') {
                const targetP1 = msg.payload.targetP1;
                const damageType = msg.payload.damageType;
                
                const victim = targetP1 ? this.player1 : this.player2;
                const attacker = targetP1 ? this.player2 : this.player1;

                if (!victim || !attacker) return;

                const isFinisher = victim.health - 1 <= 0;
                victim.takeDamage(damageType);
                const dir = (attacker as any).pos.x < (victim as any).pos.x ? 1 : -1;
                const force = isFinisher ? FINISHER_KNOCKBACK_FORCE : KNOCKBACK_FORCE;
                victim.vx += dir * force;

                this.shake(200, 5);
                this.playHitSound(damageType);

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
                // Restarting is always allowed as it resets the state for both players
                this.reset();
            }
        };

        this.networkManager.onDisconnect = () => {
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
        const scene = this.currentScene as Scene;
        scene.clear();
        this.timescale = 1.0;

        const rink = new Rink(0, 0);
        scene.add(rink);

        const p1Hud = new Framer(130, 390, 5, 3);
        scene.add(p1Hud);

        const p2Hud = new Framer(790, 390, 5, 3);
        scene.add(p2Hud);

        // --- Custom SpriteFont Implementation ---
        const fontSheet = SpriteSheet.fromImageSource({
            image: this.resources.SmallFontSheet,
            grid: {
                rows: 3,
                columns: 32,
                spriteWidth: 8,
                spriteHeight: 8
            },
            spacing: {
                originOffset: { x: 0, y: 8 } // Skip row 1, start at row 2
            }
        });

        const alphabet =
                        " !\"#©%&'()✓+,-./0123456789:;<=>?" +
                        "@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_" +
                        "`abcdefghijklmnopqrstuvwxyz{|}~■";

        const smallSpriteFont = new SpriteFont({
            alphabet,
            caseInsensitive: false,
            spriteSheet: fontSheet
        });

        // Initialize state display text for Player 1
        this.p1StateDisplay = new Text({
            text: 'READY',
            font: smallSpriteFont
        });        

        const p1FontActor = new ScreenElement({
            pos: vec(70, 340), // Symmetrical offset relative to P1 Hud (130 + 60)
            anchor: vec(0.5, 0.5),
            z: 100
        });
        p1FontActor.graphics.use(this.p1StateDisplay);
        scene.add(p1FontActor);

        // Initialize state display text for Player 2
        this.p2StateDisplay = new Text({
            text: 'READY',
            font: smallSpriteFont
        });        

        // Use ScreenElement to make the text static and independent of camera zoom/pan
        const p2FontActor = new ScreenElement({
            pos: vec(730, 340), // Center of Player 2 HUD Framer (790 - 60)
            anchor: vec(0.5, 0.5),
            z: 100
        });                
        
        p2FontActor.graphics.use(this.p2StateDisplay);
        scene.add(p2FontActor);
        // ----------------------------------------

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
        
        if (this.networkManager) {
            if (this.isHost) {
                this.player1.isLocal = true;
                this.player2.isLocal = false;
            } else {
                this.player1.isLocal = false;
                this.player2.isLocal = true;
            }
        } else {
            this.player1.isLocal = true;
            this.player2.isLocal = true;
        }

        this.player1.opponent = this.player2;
        this.player2.opponent = this.player1;

        scene.add(this.player1);
        scene.add(this.player2);

        // Add Segmented Health Bars
        const hb1 = new HealthBar(105, 365, this.player1);
        scene.add(hb1);
        const hb2 = new HealthBar(765, 365, this.player2);
        scene.add(hb2);

        scene.off('glovesDropped', this.onGlovesDropped);
        scene.off('glovesLanded', this.onGlovesLanded);

        scene.on('glovesDropped', this.onGlovesDropped);
        scene.on('glovesLanded', this.onGlovesLanded);

        this.off('postupdate', this.handlePostUpdate);
        this.on('postupdate', this.handlePostUpdate);
    }

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

        if (this.isGameOver && this.timescale < 1.0) {
            const loser = this.winner === 'PLAYER 1' ? this.player2 : this.player1;
            if (loser && loser.state === 'down') {
                this.timescale = 1.0;
            }
        }

        if (this.isGameOver && !this.winTriggered && this.winner) {
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
        // Update in-game Player 1 state text display
        if (this.p1StateDisplay && this.player1) {
            this.p1StateDisplay.text = this.player1.state.toUpperCase().replace('_', ' ');
        }
        
        // Update in-game Player 2 state text display
        if (this.p2StateDisplay && this.player2) {
            this.p2StateDisplay.text = this.player2.state.toUpperCase().replace('_', ' ');
        }

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