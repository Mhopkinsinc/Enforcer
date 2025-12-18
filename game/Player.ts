
import { Actor, Engine, SpriteSheet, Animation, AnimationStrategy, Keys, vec, Vector, Color, GraphicsGroup, Frame } from "excalibur";
import { SCALE, SPRITE_WIDTH, SPRITE_HEIGHT, ANIMATIONS, MOVE_SPEED, FRICTION, HIT_RANGE, HITBOX_WIDTH, FRAMES, GLOVES_WIDTH, GLOVES_HEIGHT, KNOCKBACK_FORCE, FINISHER_KNOCKBACK_FORCE, BOUNCE_FACTOR, STAR_WIDTH, STAR_HEIGHT, STANLEY_WIDTH, STANLEY_HEIGHT } from "../constants";
import { AnimationState, PlayerSnapshot, SyncPayload } from "../types";
import { HockeyGame } from "./HockeyGame";
import { BloodParticle } from "./BloodParticle";

export class Player extends Actor {
    public isPlayer1: boolean;
    public isLocal: boolean = true;
    public isCPU: boolean = false;
    public health: number = 5;
    public maxHealth: number = 5;
    public state: AnimationState = 'idle'; 
    public opponent: Player | null = null;
    
    private spriteSheet!: SpriteSheet;
    private animations: Map<AnimationState, Animation> = new Map();
    private animLocked: boolean = true;
    private hitDealt: boolean = false;
    private glovesDropped: boolean = false;
    public vx: number = 0; 
    private facingRight: boolean;

    // AI Properties
    private aiDecisionTimer: number = 0;
    private aiReactionDelay: number = 300; 
    private aiDifficulty: number = 0.7; // 0 to 1 scale

    constructor(x: number, y: number, isPlayer1: boolean) {
        super({
            pos: vec(x, y),
            width: SPRITE_WIDTH * SCALE,
            height: SPRITE_HEIGHT * SCALE,
            anchor: vec(0.5, 0.5),
        });
        this.isPlayer1 = isPlayer1;
        this.facingRight = isPlayer1;
    }

    onInitialize(engine: Engine) {
        const game = engine as unknown as HockeyGame;

        this.spriteSheet = SpriteSheet.fromImageSource({
            image: game.resources.SpriteSheet,
            grid: {
                rows: 17,
                columns: 1,
                spriteWidth: SPRITE_WIDTH,
                spriteHeight: SPRITE_HEIGHT
            }
        });

        Object.keys(ANIMATIONS).forEach((key) => {
            const state = key as AnimationState;
            const def = ANIMATIONS[state];
            let frames: Frame[];

            if (def.isStanley) {
                const stanleySheet = SpriteSheet.fromImageSource({
                    image: game.resources.StanleySheet,
                    grid: { rows: 1, columns: 8, spriteWidth: STANLEY_WIDTH, spriteHeight: STANLEY_HEIGHT }
                });
                frames = def.frames.map((frameIndex, i) => {
                    const sprite = stanleySheet.getSprite(frameIndex, 0);
                    const group = new GraphicsGroup({
                        members: [{ graphic: sprite, offset: vec(0, -12) }]
                    });
                    return { graphic: group, duration: def.durations[i] || 300 } as Frame;
                });
            } else {
                frames = def.frames.map((frameIndex, i) => {
                    return { graphic: this.spriteSheet.getSprite(0, frameIndex), duration: def.durations[i] || 100 } as Frame;
                });
            }

            const anim = new Animation({
                frames: frames,
                strategy: def.loop ? AnimationStrategy.Loop : AnimationStrategy.Freeze
            });
            anim.scale = vec(SCALE, SCALE);
            this.animations.set(state, anim);
        });

        this.setupStarIndicator(game);
        this.setState('throw_gloves');
    }

    private setupStarIndicator(game: HockeyGame) {
        const star = new Actor({
            pos: vec(0, (SPRITE_HEIGHT * SCALE) / 2 - 115), 
            width: STAR_WIDTH * SCALE,
            height: STAR_HEIGHT * SCALE,
            anchor: vec(0.5, 0.5),
            z: -1 
        });
        const starSheet = SpriteSheet.fromImageSource({
            image: game.resources.StarsSheet,
            grid: { rows: 1, columns: 2, spriteWidth: STAR_WIDTH, spriteHeight: STAR_HEIGHT }
        });
        const sprite = starSheet.getSprite(this.isPlayer1 ? 0 : 1, 0);
        if (sprite) {
            sprite.scale = vec(SCALE, SCALE);
            star.graphics.use(sprite);
        }
        this.addChild(star);
    }

    onPreUpdate(engine: Engine, delta: number) {
        const game = engine as unknown as HockeyGame;
        if (game.isReplaying) return; 

        if (this.isLocal) {
            if (this.isCPU) {
                this.handleAIInput(delta);
            } else {
                this.handleInput(engine);
            }
            this.applyPhysics();
            this.checkCollisions();
        }
        
        this.updateAnimationLogic();
        this.updateGraphics();
    }

    private handleAIInput(delta: number) {
        if (this.state === 'held' || this.state === 'falling' || this.state === 'down' || this.state === 'win' || !this.opponent) return;

        const dist = Math.abs(this.pos.x - this.opponent.pos.x);
        const opponentIsAttacking = this.opponent.state.includes('punch') || this.opponent.state === 'grab';
        
        this.aiDecisionTimer += delta;

        // --- DEFENSIVE LOGIC (Anti-Spam) ---
        // If player is attacking and CPU is close, CPU should try to dodge (move away)
        if (opponentIsAttacking && dist < HIT_RANGE + 20 && !this.animLocked) {
            if (Math.random() < this.aiDifficulty) {
                const dirAway = this.pos.x < this.opponent.pos.x ? -1 : 1;
                this.vx += dirAway * (MOVE_SPEED * 1.5); // Fast retreat
                return; // Prioritize safety over attacking
            }
        }

        // --- MOVEMENT LOGIC ---
        if (!this.animLocked) {
            // Baiting range: AI tries to stay at the edge of the hit range
            const idealDist = HIT_RANGE - 5;
            if (dist > idealDist + 10) {
                const dir = this.pos.x < this.opponent.pos.x ? 1 : -1;
                this.vx += dir * MOVE_SPEED;
            } else if (dist < idealDist - 10) {
                const dir = this.pos.x < this.opponent.pos.x ? -0.5 : 0.5;
                this.vx += dir * MOVE_SPEED;
            }
        }

        // --- ATTACK LOGIC ---
        if (this.aiDecisionTimer > this.aiReactionDelay && !this.animLocked) {
            this.aiDecisionTimer = 0;

            // Punish Whiffs: If player just finished an attack, high chance to strike
            const opponentRecovering = this.opponent.state === 'ready' && !this.opponent.animLocked;
            
            if (dist <= HIT_RANGE + 5) {
                const rand = Math.random();
                // Difficulty affects aggressive choice
                if (rand < 0.45) {
                    this.setState('high_punch');
                } else if (rand < 0.85) {
                    this.setState('low_punch');
                } else {
                    this.setState('grab');
                }
                
                // Vary reaction time so it's not robotic
                this.aiReactionDelay = 200 + Math.random() * 400;
            }
        }
    }

    public getSyncState(): SyncPayload {
        return {
            x: this.pos.x,
            y: this.pos.y,
            vx: this.vx,
            state: this.state,
            facingRight: this.facingRight,
            health: this.health
        };
    }

    public syncFromNetwork(data: SyncPayload) {
        this.pos.x = data.x;
        this.pos.y = data.y;
        this.vx = data.vx;
        this.facingRight = data.facingRight;
        this.health = data.health;
        if (this.state !== data.state) {
            this.setState(data.state);
        }
    }

    public getSnapshot(): PlayerSnapshot {
        const currentAnim = this.graphics.current as Animation;
        const idx = currentAnim ? currentAnim.currentFrameIndex : 0;
        return {
            x: this.pos.x,
            y: this.pos.y,
            state: this.state,
            frameIndex: idx,
            facingRight: this.facingRight,
            health: this.health,
            visible: this.graphics.visible
        };
    }

    public setFromSnapshot(snap: PlayerSnapshot) {
        this.pos.x = snap.x;
        this.pos.y = snap.y;
        this.facingRight = snap.facingRight;
        this.health = snap.health;
        this.graphics.visible = snap.visible;

        if (this.state !== snap.state) {
            this.state = snap.state;
            const anim = this.animations.get(this.state);
            if (anim) {
                this.graphics.use(anim);
            }
        }

        const currentAnim = this.graphics.current as Animation;
        if (currentAnim) {
            if (currentAnim.currentFrameIndex !== snap.frameIndex) {
                currentAnim.goToFrame(snap.frameIndex);
            }
            currentAnim.pause();
            currentAnim.flipHorizontal = !this.facingRight;
        }
    }

    setState(newState: AnimationState) {
        if (this.state === 'down') return; 
        if (this.state === newState) return; 

        this.state = newState;
        this.hitDealt = false;
        this.glovesDropped = false;
        
        if (newState === 'win') {
            this.vx = 0; 
        }

        const animDef = ANIMATIONS[newState];
        this.animLocked = !animDef.loop;

        const anim = this.animations.get(newState);
        if (anim) {
            anim.reset();
            if (newState === 'win') {
                const startFrame = this.isPlayer1 ? 3 : 7;
                anim.goToFrame(startFrame);
            }
            anim.play(); 
            this.graphics.use(anim);
        }
    }

    private handleInput(engine: Engine) {
        if (this.animLocked || this.state === 'held' || this.state === 'falling' || this.state === 'down' || this.state === 'win') return;

        const k = engine.input.keyboard;
        const game = engine as unknown as HockeyGame;
        const isMultiplayer = game.networkManager !== null;
        const isCPUGame = game.isCPUGame;

        let left = false;
        let right = false;
        let high = false;
        let low = false;
        let grab = false;

        if (!isMultiplayer) {
            if (this.isPlayer1) {
                if (isCPUGame) {
                    left = k.isHeld(Keys.A) || k.isHeld(Keys.Left);
                    right = k.isHeld(Keys.D) || k.isHeld(Keys.Right);
                    high = k.wasPressed(Keys.J) || k.wasPressed(Keys.Num1) || k.wasPressed(Keys.Numpad1);
                    low = k.wasPressed(Keys.K) || k.wasPressed(Keys.Num2) || k.wasPressed(Keys.Numpad2);
                    grab = k.wasPressed(Keys.L) || k.wasPressed(Keys.Num3) || k.wasPressed(Keys.Numpad3);
                } else {
                    left = k.isHeld(Keys.A);
                    right = k.isHeld(Keys.D);
                    high = k.wasPressed(Keys.J);
                    low = k.wasPressed(Keys.K);
                    grab = k.wasPressed(Keys.L);
                }
            } else {
                left = k.isHeld(Keys.Left);
                right = k.isHeld(Keys.Right);
                high = k.wasPressed(Keys.Num1) || k.wasPressed(Keys.Numpad1);
                low = k.wasPressed(Keys.Num2) || k.wasPressed(Keys.Numpad2);
                grab = k.wasPressed(Keys.Num3) || k.wasPressed(Keys.Numpad3);
            }
        } else {
            if (k.isHeld(Keys.A) || k.isHeld(Keys.Left)) left = true;
            if (k.isHeld(Keys.D) || k.isHeld(Keys.Right)) right = true;
            if (k.wasPressed(Keys.J) || k.wasPressed(Keys.Num1) || k.wasPressed(Keys.Numpad1)) high = true;
            if (k.wasPressed(Keys.K) || k.wasPressed(Keys.Num2) || k.wasPressed(Keys.Numpad2)) low = true;
            if (k.wasPressed(Keys.L) || k.wasPressed(Keys.Num3) || k.wasPressed(Keys.Numpad3)) grab = true;
        }

        if (left) this.vx -= MOVE_SPEED;
        if (right) this.vx += MOVE_SPEED;
        if (high) this.setState('high_punch');
        if (low) this.setState('low_punch');
        if (grab) this.setState('grab');
    }

    private applyPhysics() {
        this.pos.x += this.vx;
        this.vx *= FRICTION;

        const margin = 100;
        const leftLimit = margin;
        const rightLimit = 800 - margin;

        if (this.pos.x < leftLimit) {
            this.pos.x = leftLimit;
            if (this.vx < 0) this.vx = -this.vx * BOUNCE_FACTOR;
        }
        if (this.pos.x > rightLimit) {
            this.pos.x = rightLimit;
            if (this.vx > 0) this.vx = -this.vx * BOUNCE_FACTOR;
        }
    }

    private checkCollisions() {
        if (!this.opponent || this.state === 'down' || this.state === 'falling') return;
        const minDist = HITBOX_WIDTH;
        const dist = Math.abs(this.pos.x - this.opponent.pos.x);
        if (dist < minDist) {
             if (this.pos.x < this.opponent.pos.x) {
                this.pos.x = this.opponent.pos.x - minDist;
            } else {
                this.pos.x = this.opponent.pos.x + minDist;
            }
            this.vx = 0;
        }
        this.facingRight = this.pos.x < this.opponent.pos.x;
    }

    private updateAnimationLogic() {
        const currentAnim = this.animations.get(this.state);
        if (!currentAnim) return;
        const def = ANIMATIONS[this.state];
        const currentFrameIndex = currentAnim.currentFrameIndex;

        if (currentAnim.done && !def.loop) {
            if (def.next) {
                this.setState(def.next);
                this.animLocked = false;
            }
        }
        if (def.dropFrame !== undefined && currentFrameIndex === def.dropFrame && !this.glovesDropped) {
             this.dropGloves();
             this.glovesDropped = true;
        }
        if (this.isLocal && def.hitFrame !== undefined && currentFrameIndex === def.hitFrame && !this.hitDealt && this.opponent) {
             this.checkHit(def.hitType!);
        }
    }

    private checkHit(hitType: 'high' | 'low' | 'grab') {
        if (!this.opponent) return;
        const dist = Math.abs(this.pos.x - this.opponent.pos.x);
        if (dist <= HIT_RANGE) {
            this.hitDealt = true;
            const game = this.scene?.engine as unknown as HockeyGame;
            const isMultiplayer = game?.networkManager;
            let hitSuccessful = false;

            if (hitType === 'grab') {
                if (this.opponent.canBeGrabbed()) {
                    this.opponent.setState('held');
                    hitSuccessful = true;
                }
            } else {
                if (this.opponent.canBeHit()) {
                    const isFinisher = this.opponent.health - 1 <= 0;
                    this.opponent.takeDamage(hitType);
                    const dir = this.pos.x < this.opponent.pos.x ? 1 : -1;
                    const force = isFinisher ? FINISHER_KNOCKBACK_FORCE : KNOCKBACK_FORCE;
                    this.opponent.vx += dir * force;
                    if (this.scene && this.scene.engine) {
                        game.shake(200, 5); 
                        game.playHitSound(hitType);
                    }
                    if (hitType === 'high') {
                        const amount = 6 + Math.floor(Math.random() * 4); 
                        const finalAmount = isFinisher ? amount * 10 : amount;
                        for (let i = 0; i < finalAmount; i++) {
                            const spawnX = this.opponent.pos.x;
                            const spawnY = this.opponent.pos.y - 70 + (Math.random() * 20 - 10);
                            const toCamera = isFinisher && (Math.random() < 0.6); 
                            const blood = new BloodParticle(spawnX, spawnY, dir, toCamera);
                            this.scene?.add(blood);
                        }
                    }
                    hitSuccessful = true;
                }
            }
            if (isMultiplayer && hitSuccessful && hitType !== 'grab') {
                game.sendHit(hitType as 'high' | 'low', !this.isPlayer1);
            }
        }
    }

    public canBeGrabbed(): boolean {
        return !this.animLocked || this.state === 'ready';
    }

    public canBeHit(): boolean {
        const vulnerableStates: AnimationState[] = ['idle', 'ready', 'held', 'high_punch', 'low_punch', 'grab'];
        return vulnerableStates.includes(this.state);
    }

    public takeDamage(type: 'high' | 'low') {
        this.health--;
        if (this.health <= 0) {
            this.setState('falling');
        } else {
            this.setState(type === 'high' ? 'hit_high' : 'hit_low');
        }
    }

    private dropGloves() {
        (this.scene as any)?.emit('glovesDropped', { 
            x: this.pos.x + (this.isPlayer1 ? -20 : 20), 
            y: this.pos.y + 60,
            isPlayer1: this.isPlayer1 
        });
    }

    private updateGraphics() {
        const anim = this.animations.get(this.state);
        if (anim) {
             if (this.state === 'win' && !this.isPlayer1) {
                anim.flipHorizontal = false;
            } else {
                anim.flipHorizontal = !this.facingRight;
            }
        }
    }
}
