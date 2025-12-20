
import { Actor, Engine, SpriteSheet, Animation, AnimationStrategy, Keys, vec, Vector, Color, GraphicsGroup, Frame, Buttons, Axes } from "excalibur";
import { SCALE, SPRITE_WIDTH, SPRITE_HEIGHT, ANIMATIONS, MOVE_SPEED, FRICTION, HIT_RANGE, HITBOX_WIDTH, FRAMES, GLOVES_WIDTH, GLOVES_HEIGHT, KNOCKBACK_FORCE, FINISHER_KNOCKBACK_FORCE, BOUNCE_FACTOR, STAR_WIDTH, STAR_HEIGHT, STANLEY_WIDTH, STANLEY_HEIGHT } from "../constants";
import { AnimationState, PlayerSnapshot, SyncPayload, GamepadMapping } from "../types";
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
    private aiReactionDelay: number = 200; // Faster base reaction
    private aiDifficulty: number = 0.9; // Increased difficulty
    private aiComboing: boolean = false;

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
        (this as any).addChild(star);
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

        const dist = Math.abs((this as any).pos.x - (this.opponent as any).pos.x);
        const opponentIsAttacking = this.opponent.state.includes('punch') || this.opponent.state === 'grab';
        const opponentIsStunned = this.opponent.state.includes('hit') || this.opponent.state === 'held';
        
        this.aiDecisionTimer += delta;

        // --- ENHANCED DEFENSE (Prevent Spam) ---
        // If player is punching, CPU retreats aggressively
        if (opponentIsAttacking && dist < HIT_RANGE + 30 && !this.animLocked) {
            if (Math.random() < this.aiDifficulty) {
                const dirAway = (this as any).pos.x < (this.opponent as any).pos.x ? -1 : 1;
                this.vx += dirAway * (MOVE_SPEED * 2.5); // Very fast retreat to break combos
                return;
            }
        }

        // --- COMBO LOGIC ---
        // If CPU is ready and player is stunned, CPU goes for immediate follow-up
        if (opponentIsStunned && dist < HIT_RANGE + 10 && !this.animLocked && !this.aiComboing) {
            this.aiComboing = true;
            this.aiDecisionTimer = this.aiReactionDelay + 1; // Force action
        }

        // --- POSITIONING ---
        if (!this.animLocked) {
            // High level AI dances around the range to bait whiffs
            const idealDist = opponentIsStunned ? 20 : HIT_RANGE - 10;
            const dir = (this as any).pos.x < (this.opponent as any).pos.x ? 1 : -1;
            
            if (dist > idealDist + 5) {
                this.vx += dir * (MOVE_SPEED * 1.2);
            } else if (dist < idealDist - 5) {
                this.vx += -dir * (MOVE_SPEED * 1.2);
            }
        }

        // --- ATTACK DECISION ---
        if (this.aiDecisionTimer > this.aiReactionDelay && !this.animLocked) {
            this.aiDecisionTimer = 0;
            this.aiComboing = false;

            if (dist <= HIT_RANGE + 10) {
                const rand = Math.random();
                // Favor High Punches for damage
                if (rand < 0.5) {
                    this.setState('high_punch');
                } else if (rand < 0.8) {
                    this.setState('low_punch');
                } else {
                    this.setState('grab');
                }
                
                // Reaction speed based on difficulty
                this.aiReactionDelay = 100 + (Math.random() * (1.0 - this.aiDifficulty) * 1000);
            }
        }
    }

    public getSyncState(): SyncPayload {
        return {
            x: (this as any).pos.x,
            y: (this as any).pos.y,
            vx: this.vx,
            state: this.state,
            facingRight: this.facingRight,
            health: this.health
        };
    }

    public syncFromNetwork(data: SyncPayload) {
        (this as any).pos.x = data.x;
        (this as any).pos.y = data.y;
        this.vx = data.vx;
        this.facingRight = data.facingRight;
        this.health = data.health;
        if (this.state !== data.state) {
            this.setState(data.state);
        }
    }

    public getSnapshot(): PlayerSnapshot {
        const currentAnim = (this as any).graphics.current as Animation;
        const idx = currentAnim ? currentAnim.currentFrameIndex : 0;
        return {
            x: (this as any).pos.x,
            y: (this as any).pos.y,
            state: this.state,
            frameIndex: idx,
            facingRight: this.facingRight,
            health: this.health,
            visible: (this as any).graphics.visible
        };
    }

    public setFromSnapshot(snap: PlayerSnapshot) {
        (this as any).pos.x = snap.x;
        (this as any).pos.y = snap.y;
        this.facingRight = snap.facingRight;
        this.health = snap.health;
        (this as any).graphics.visible = snap.visible;

        if (this.state !== snap.state) {
            this.state = snap.state;
            const anim = this.animations.get(this.state);
            if (anim) {
                (this as any).graphics.use(anim);
            }
        }

        const currentAnim = (this as any).graphics.current as Animation;
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
            (this as any).graphics.use(anim);
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

        // --- Keyboard Controls ---
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

        // --- Gamepad Controls ---
        const gpSettings = game.gamepadSettings;
        const gpIndex = this.isPlayer1 ? gpSettings.p1Index : gpSettings.p2Index;
        const mapping = this.isPlayer1 ? gpSettings.p1Mapping : gpSettings.p2Mapping;

        if (gpIndex !== null) {
            const gamepad = engine.input.gamepads.at(gpIndex);
            
            // Movement: D-Pad or Left Stick
            if (gamepad.isButtonHeld(Buttons.DpadLeft) || gamepad.getAxes(Axes.LeftStickX) < -0.5) {
                left = true;
            }
            if (gamepad.isButtonHeld(Buttons.DpadRight) || gamepad.getAxes(Axes.LeftStickX) > 0.5) {
                right = true;
            }

            // Actions
            if (gamepad.wasButtonPressed(mapping.highPunch)) {
                high = true;
            }
            if (gamepad.wasButtonPressed(mapping.lowPunch)) {
                low = true;
            }
            if (gamepad.wasButtonPressed(mapping.grab)) {
                grab = true;
            }
        }

        // --- Execution ---
        if (left) this.vx -= MOVE_SPEED;
        if (right) this.vx += MOVE_SPEED;
        if (high) this.setState('high_punch');
        if (low) this.setState('low_punch');
        if (grab) this.setState('grab');
    }

    private applyPhysics() {
        (this as any).pos.x += this.vx;
        this.vx *= FRICTION;

        const margin = 100;
        const leftLimit = margin;
        const rightLimit = 800 - margin;

        if ((this as any).pos.x < leftLimit) {
            (this as any).pos.x = leftLimit;
            if (this.vx < 0) this.vx = -this.vx * BOUNCE_FACTOR;
        }
        if ((this as any).pos.x > rightLimit) {
            (this as any).pos.x = rightLimit;
            if (this.vx > 0) this.vx = -this.vx * BOUNCE_FACTOR;
        }
    }

    private checkCollisions() {
        if (!this.opponent || this.state === 'down' || this.state === 'falling') return;
        const minDist = HITBOX_WIDTH;
        const dist = Math.abs((this as any).pos.x - (this.opponent as any).pos.x);
        if (dist < minDist) {
             if ((this as any).pos.x < (this.opponent as any).pos.x) {
                (this as any).pos.x = (this.opponent as any).pos.x - minDist;
            } else {
                (this as any).pos.x = (this.opponent as any).pos.x + minDist;
            }
            this.vx = 0;
        }
        this.facingRight = (this as any).pos.x < (this.opponent as any).pos.x;
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
        const dist = Math.abs((this as any).pos.x - (this.opponent as any).pos.x);
        if (dist <= HIT_RANGE) {
            this.hitDealt = true;
            const game = (this as any).scene?.engine as unknown as HockeyGame;
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
                    const dir = (this as any).pos.x < (this.opponent as any).pos.x ? 1 : -1;
                    const force = isFinisher ? FINISHER_KNOCKBACK_FORCE : KNOCKBACK_FORCE;
                    this.opponent.vx += dir * force;
                    if ((this as any).scene && (this as any).scene.engine) {
                        game.shake(200, 5); 
                        game.playHitSound(hitType);
                    }
                    if (hitType === 'high') {
                        const amount = 6 + Math.floor(Math.random() * 4); 
                        const finalAmount = isFinisher ? amount * 10 : amount;
                        for (let i = 0; i < finalAmount; i++) {
                            const spawnX = (this.opponent as any).pos.x;
                            const spawnY = (this.opponent as any).pos.y - 70 + (Math.random() * 20 - 10);
                            const toCamera = isFinisher && (Math.random() < 0.6); 
                            const blood = new BloodParticle(spawnX, spawnY, dir, toCamera);
                            (this as any).scene?.add(blood);
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
            // BREAKAWAY LOGIC: If CPU is hit, boost velocity away to prevent stun lock
            if (this.isCPU) {
                const dirAway = (this.opponent && (this as any).pos.x < (this.opponent as any).pos.x) ? -1 : 1;
                this.vx += dirAway * (MOVE_SPEED * 5); 
            }
        }
    }

    private dropGloves() {
        ((this as any).scene as any)?.emit('glovesDropped', { 
            x: (this as any).pos.x + (this.isPlayer1 ? -20 : 20), 
            y: (this as any).pos.y + 60,
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
