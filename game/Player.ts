
import { Actor, Engine, SpriteSheet, Animation, AnimationStrategy, Keys, vec, Vector, Color, GraphicsGroup, Frame } from "excalibur";
import { SCALE, SPRITE_WIDTH, SPRITE_HEIGHT, ANIMATIONS, MOVE_SPEED, FRICTION, HIT_RANGE, HITBOX_WIDTH, FRAMES, GLOVES_WIDTH, GLOVES_HEIGHT, KNOCKBACK_FORCE, STAR_WIDTH, STAR_HEIGHT, STANLEY_WIDTH, STANLEY_HEIGHT } from "../constants";
import { AnimationState, PlayerSnapshot, SyncPayload } from "../types";
import { HockeyGame } from "./HockeyGame";
import { BloodParticle } from "./BloodParticle";

export class Player extends Actor {
    public isPlayer1: boolean;
    public isLocal: boolean = true; // Default to true for single player
    public health: number = 5;
    public maxHealth: number = 5;
    public state: AnimationState = 'idle'; 
    public opponent: Player | null = null;
    
    private spriteSheet!: SpriteSheet;
    private animations: Map<AnimationState, Animation> = new Map();
    private animLocked: boolean = true;
    private hitDealt: boolean = false;
    private glovesDropped: boolean = false;
    public vx: number = 0; // Public so we can read for sync
    private facingRight: boolean;

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

        // Create SpriteSheet from loaded resource
        this.spriteSheet = SpriteSheet.fromImageSource({
            image: game.resources.SpriteSheet,
            grid: {
                rows: 17,
                columns: 1,
                spriteWidth: SPRITE_WIDTH,
                spriteHeight: SPRITE_HEIGHT
            }
        });

        // Initialize Animations
        Object.keys(ANIMATIONS).forEach((key) => {
            const state = key as AnimationState;
            const def = ANIMATIONS[state];
            
            let frames: Frame[];

            if (def.isStanley) {
                // Load from Stanley Sheet
                const stanleySheet = SpriteSheet.fromImageSource({
                    image: game.resources.StanleySheet,
                    grid: {
                        rows: 1,
                        columns: 8,
                        spriteWidth: STANLEY_WIDTH,
                        spriteHeight: STANLEY_HEIGHT
                    }
                });
                frames = def.frames.map((frameIndex, i) => {
                    const sprite = stanleySheet.getSprite(frameIndex, 0);
                    const group = new GraphicsGroup({
                        members: [
                            {
                                graphic: sprite,
                                offset: vec(0, -12) 
                            }
                        ]
                    });

                    return {
                        graphic: group, 
                        duration: def.durations[i] || 300
                    } as Frame;
                });
            } else {
                frames = def.frames.map((frameIndex, i) => {
                    return {
                        graphic: this.spriteSheet.getSprite(0, frameIndex),
                        duration: def.durations[i] || 100
                    } as Frame;
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
            grid: {
                rows: 1,
                columns: 2,
                spriteWidth: STAR_WIDTH,
                spriteHeight: STAR_HEIGHT
            }
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

        // If local, handle input. If network, input is handled via syncFromNetwork
        if (this.isLocal) {
            this.handleInput(engine);
        }
        
        this.applyPhysics();
        this.checkCollisions();
        this.updateAnimationLogic();
        this.updateGraphics();
    }

    // --- NETWORK SYNC METHODS ---

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
        // Snap position (can add lerp later for smoothness)
        (this as any).pos.x = data.x;
        (this as any).pos.y = data.y;
        this.vx = data.vx;
        this.facingRight = data.facingRight;
        this.health = data.health;

        // Only switch state if it differs (to avoid resetting animations)
        if (this.state !== data.state) {
            this.setState(data.state);
        }
    }

    // ----------------------------

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
        }

        if (currentAnim) {
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
                // P1 starts at 3. P2 starts at 7. 
                // Since we disable flip for P2, we use normal frame order.
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

        // Controls Logic
        // If single player: P1 uses WASD, P2 uses Arrows
        // If multiplayer: Local player ALWAYS uses WASD (or arrows) mapped to their character

        let left = false;
        let right = false;
        let high = false;
        let low = false;
        let grab = false;

        if (!isMultiplayer) {
            // Local Multiplayer (Same keyboard)
            if (this.isPlayer1) {
                left = k.isHeld(Keys.A);
                right = k.isHeld(Keys.D);
                high = k.wasPressed(Keys.J);
                low = k.wasPressed(Keys.K);
                low = k.wasPressed(Keys.K);
                grab = k.wasPressed(Keys.L);
            } else {
                left = k.isHeld(Keys.Left);
                right = k.isHeld(Keys.Right);
                high = k.wasPressed(Keys.Num1) || k.wasPressed(Keys.Numpad1);
                low = k.wasPressed(Keys.Num2) || k.wasPressed(Keys.Numpad2);
                grab = k.wasPressed(Keys.Num3) || k.wasPressed(Keys.Numpad3);
            }
        } else {
            // Online Multiplayer
            // For better UX, allow the local user to use WASD/J-L regardless of which side they are on
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
        (this as any).transform.pos.x += this.vx;
        this.vx *= FRICTION;

        const margin = 100;
        if ((this as any).transform.pos.x < margin) (this as any).transform.pos.x = margin;
        if ((this as any).transform.pos.x > 800 - margin) (this as any).transform.pos.x = 800 - margin;
    }

    private checkCollisions() {
        if (!this.opponent || this.state === 'down' || this.state === 'falling') return;

        const minDist = HITBOX_WIDTH;
        // Check distance
        const dist = Math.abs((this as any).transform.pos.x - (this.opponent as any).transform.pos.x);

        if (dist < minDist) {
             if ((this as any).transform.pos.x < (this.opponent as any).transform.pos.x) {
                (this as any).transform.pos.x = (this.opponent as any).transform.pos.x - minDist;
            } else {
                (this as any).transform.pos.x = (this.opponent as any).transform.pos.x + minDist;
            }
            this.vx = 0;
        }

        // Face opponent
        this.facingRight = (this as any).transform.pos.x < (this.opponent as any).transform.pos.x;
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

        // Only the Local Player calculates hits. We trust the client for now.
        if (this.isLocal && def.hitFrame !== undefined && currentFrameIndex === def.hitFrame && !this.hitDealt && this.opponent) {
             this.checkHit(def.hitType!);
        }
    }

    private checkHit(hitType: 'high' | 'low' | 'grab') {
        if (!this.opponent) return;

        const dist = Math.abs((this as any).transform.pos.x - (this.opponent as any).transform.pos.x);
        
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
                    // Check if this is a finisher (opponent will die)
                    const isFinisher = this.opponent.health - 1 <= 0;
                    
                    this.opponent.takeDamage(hitType);
                    
                    const dir = (this as any).transform.pos.x < (this.opponent as any).transform.pos.x ? 1 : -1;
                    this.opponent.vx += dir * KNOCKBACK_FORCE;

                    if ((this as any).scene && (this as any).scene.engine) {
                        game.shake(200, 5); 
                        game.playHitSound(hitType);
                    }

                    if (hitType === 'high') {
                        const amount = 6 + Math.floor(Math.random() * 4); 
                        // Increase blood amount for finisher significantly
                        const finalAmount = isFinisher ? amount * 10 : amount;
                        
                        for (let i = 0; i < finalAmount; i++) {
                            const spawnX = (this.opponent as any).pos.x;
                            const spawnY = (this.opponent as any).pos.y - 70 + (Math.random() * 20 - 10);
                            
                            // If finisher, send ~60% of blood to camera
                            const toCamera = isFinisher && (Math.random() < 0.6); 
                            const blood = new BloodParticle(spawnX, spawnY, dir, toCamera);
                            (this as any).scene?.add(blood);
                        }
                    }
                    hitSuccessful = true;
                }
            }

            // If Multiplayer and we hit successfully, tell the other player they got hit
            if (isMultiplayer && hitSuccessful && hitType !== 'grab') { // Grab is anim state based, hits are damage based
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
        ((this as any).scene as any)?.emit('glovesDropped', { 
            x: (this as any).transform.pos.x + (this.isPlayer1 ? -20 : 20), 
            y: (this as any).transform.pos.y + 60,
            isPlayer1: this.isPlayer1 
        });
    }

    private updateGraphics() {
        const anim = this.animations.get(this.state);
        if (anim) {
             if (this.state === 'win' && !this.isPlayer1) {
                // Don't flip P2 for win, so rotation is consistent with frame order (Forward)
                anim.flipHorizontal = false;
            } else {
                anim.flipHorizontal = !this.facingRight;
            }
        }
    }
}
