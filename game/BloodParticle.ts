
import { Actor, Engine, Color, vec, Vector } from "excalibur";

export class BloodParticle extends Actor {
    private velocity: Vector;
    private zVelocity: number; // Simulated depth velocity
    private currentZ: number = 0; 
    private targetZ: number; // Distance to wall (positive) or screen (negative)
    
    private gravity: number = 800; // Slightly lower gravity for better arcs
    private floorY: number;
    private landed: boolean = false;
    private toCamera: boolean = false;

    constructor(x: number, y: number, direction: number, toCamera: boolean = false) {
        super({
            pos: vec(x, y),
            width: 3,
            height: 3,
            color: Color.fromHex('#b91c1c'), // Fresh red
            z: 20 // Start in front of players
        });

        this.toCamera = toCamera;

        // 1. Initial Velocity
        if (this.toCamera) {
            // Explosive scatter for screen hits
            // Widen spread to cover more screen area
            const vx = (Math.random() * 1000 - 500); 
            
            // Adjusted to allow particles to go down (positive Y) as well as up
            // Range is -500 to +300
            const vy = (Math.random() * 800 - 500);
            
            this.velocity = vec(vx, vy);
            
            // Move TOWARDS camera (Negative Z)
            this.zVelocity = -(Math.random() * 600 + 400); 
            this.targetZ = -200; // Arbitrary "Screen" plane
            this.gravity = 200; // Low gravity for flying at screen
        } else {
            // Standard sideways splatter
            const vx = (Math.random() * 300 + 50) * direction; 
            const vy = -(Math.random() * 400 + 100); 
            this.velocity = vec(vx, vy);
            
            // Move AWAY from camera (Positive Z)
            this.zVelocity = Math.random() * 450 + 50; 
            this.targetZ = 150; // Wall plane
        }

        // 3. Floor Setup
        this.floorY = 360 + (Math.random() * 20 - 10);
    }

    onPreUpdate(engine: Engine, delta: number) {
        if (this.landed) {
            // If stuck to camera, fade out over time
            if (this.toCamera) {
                (this as any).graphics.opacity -= (delta / 1000) * 0.8; 
                if ((this as any).graphics.opacity <= 0) {
                    (this as any).kill();
                }
            }
            return;
        }

        const dt = delta / 1000;

        // Physics Update
        this.velocity.y += this.gravity * dt;
        
        // Move in 2D
        (this as any).pos.x += this.velocity.x * dt;
        (this as any).pos.y += this.velocity.y * dt;
        
        // Move in Depth
        this.currentZ += this.zVelocity * dt;

        if (this.toCamera) {
            // SCREEN HIT LOGIC
            
            // Perspective Scaling (Growing larger as it gets closer/more negative)
            // Map 0 to targetZ -> Scale 0.5 to 1.0 (Reduced size for smaller particles)
            const progress = Math.min(Math.abs(this.currentZ) / Math.abs(this.targetZ), 1);
            const scale = 0.5 + (progress * 0.5);
            (this as any).scale = vec(scale, scale);

            // Check collision with screen plane
            if (this.currentZ <= this.targetZ) {
                this.stickToSurface();
            }
        } else {
            // WALL/FLOOR LOGIC

            // Check collision with back wall
            if (this.currentZ >= this.targetZ) {
                this.stickToSurface();
                return;
            }

            // Check floor collision
            if ((this as any).pos.y >= this.floorY) {
                (this as any).pos.y = this.floorY;
                
                // Floor behavior (bounce/slide)
                if (this.velocity.y > 50) {
                    this.velocity.x = (Math.random() * 300 - 150); 
                    this.velocity.y *= -0.4; // Bounce
                } else {
                    this.velocity.y = 0;
                    this.velocity.x *= 0.8; 
                }

                if (Math.abs(this.velocity.y) < 10 && Math.abs(this.velocity.x) < 10) {
                    this.stickToSurface();
                }
            }
        }
    }

    private stickToSurface() {
        this.landed = true;
        this.velocity = vec(0, 0);
        this.zVelocity = 0;
        
        // Visuals for dried/stuck blood
        (this as any).color = Color.fromHex('#7f1d1d'); // Darker dried blood color

        if (this.toCamera) {
            (this as any).z = 9999; // Topmost UI layer
            // Splash on the lens
            // Much smaller size: 0.5 to 1.2 scale
            const finalScale = 0.5 + Math.random() * 0.7;
            (this as any).scale = vec(finalScale, finalScale);
        } else {
            (this as any).z = -1; // Move behind players for wall blood
            
            // Perspective scaling for back wall:
            const depthRatio = Math.min(Math.max(this.currentZ / this.targetZ, 0), 1);
            const perspectiveScale = 1.0 - (depthRatio * 0.6);
            (this as any).scale = vec(perspectiveScale, perspectiveScale);
        }
    }
}
