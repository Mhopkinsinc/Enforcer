
import { Actor, Color, Rectangle, Sprite, SpriteSheet, vec, Vector } from "excalibur";
import { HockeyGame } from "./HockeyGame";
import { BloodParticle } from "./BloodParticle";
import { Gloves } from "./Gloves";
import { GameSnapshot, EntitySnapshot } from "../types";
import { SCALE, GLOVES_WIDTH, GLOVES_HEIGHT } from "../constants";

export class ReplayManager {
    private game: HockeyGame;

    // Replay State
    public isReplaying: boolean = false;
    public replayBuffer: GameSnapshot[] = [];
    public replayIndex: number = 0;
    public playbackSpeed: number = 1;
    public currentFrameSounds: ('high' | 'low')[] = [];

    // Replay Rendering
    private replayPool: Actor[] = [];
    private bloodRect: Rectangle;
    private gloveSpriteP1!: Sprite;
    private gloveSpriteP2!: Sprite;

    constructor(game: HockeyGame) {
        this.game = game;
        this.bloodRect = new Rectangle({ width: 3, height: 3, color: Color.White });
    }

    public init() {
        const gloveSheet = SpriteSheet.fromImageSource({
            image: this.game.resources.GlovesSheet,
            grid: { rows: 1, columns: 2, spriteWidth: GLOVES_WIDTH, spriteHeight: GLOVES_HEIGHT }
        });
        this.gloveSpriteP1 = gloveSheet.getSprite(0, 0);
        this.gloveSpriteP1.scale = vec(SCALE, SCALE);
        this.gloveSpriteP2 = gloveSheet.getSprite(1, 0);
        this.gloveSpriteP2.scale = vec(SCALE, SCALE);
    }

    public reset() {
        this.isReplaying = false;
        this.replayBuffer = [];
        this.replayIndex = 0;
        this.playbackSpeed = 1;
        this.replayPool = [];
        this.currentFrameSounds = [];
    }

    public toggleReplay(enable: boolean) {
        this.isReplaying = enable;
        if (enable) {
            this.replayIndex = 0;
            this.playbackSpeed = 1;
            
            (this.game as any).currentScene.actors.forEach((actor: any) => {
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

    public recordFrame() {
        if (this.game.isGameOver && this.game.koTimer > 5000) return;
        if (!this.game.player1 || !this.game.player2) return;

        const entities: EntitySnapshot[] = [];
        
        (this.game as any).currentScene.actors.forEach((actor: any) => {
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
            p1: this.game.player1.getSnapshot(),
            p2: this.game.player2.getSnapshot(),
            cameraPos: { x: (this.game as any).currentScene.camera.pos.x, y: (this.game as any).currentScene.camera.pos.y },
            cameraZoom: (this.game as any).currentScene.camera.zoom,
            entities: entities,
            sounds: [...this.currentFrameSounds]
        });
        this.currentFrameSounds = [];
    }

    public recordSound(type: 'high' | 'low') {
        if (!this.isReplaying) {
            this.currentFrameSounds.push(type);
        }
    }

    public update() {
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
                    const vol = this.game.sfxVolume;
                    f.sounds.forEach(s => {
                        if (s === 'high') this.game.resources.PunchHiSound.play(vol);
                        else if (s === 'low') this.game.resources.PunchLowSound.play(vol);
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
        if (!this.game.player1 || !this.game.player2) return;

        this.game.player1.setFromSnapshot(frame.p1);
        this.game.player2.setFromSnapshot(frame.p2);
        (this.game as any).currentScene.camera.pos = new Vector(frame.cameraPos.x, frame.cameraPos.y);
        (this.game as any).currentScene.camera.zoom = frame.cameraZoom;

        let poolIndex = 0;

        for (const ent of frame.entities) {
            let actor: Actor;

            if (poolIndex >= this.replayPool.length) {
                actor = new Actor({ anchor: vec(0.5, 0.5) }); 
                (this.game as any).currentScene.add(actor);
                this.replayPool.push(actor);
            } else {
                actor = this.replayPool[poolIndex];
            }

            actor.pos.x = ent.x;
            actor.pos.y = ent.y;
            actor.z = ent.zIndex;
            actor.scale = vec(ent.scale, ent.scale);
            actor.graphics.visible = true;

            if (ent.type === 'blood') {
                actor.graphics.use(this.bloodRect);
                actor.color = Color.fromHex(ent.color!); 
            } else if (ent.type === 'glove') {
                actor.graphics.use(ent.isPlayer1 ? this.gloveSpriteP1 : this.gloveSpriteP2);
                actor.color = Color.White;
            }

            poolIndex++;
        }

        for (let i = poolIndex; i < this.replayPool.length; i++) {
            this.replayPool[i].graphics.visible = false;
        }
    }
}
