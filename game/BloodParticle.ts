
import { Actor, Engine, Color, vec, Vector } from "excalibur";

export class BloodParticle extends Actor {
    private velocity: Vector;
    private zVelocity: number; // Simulated depth velocity
    private currentZ: number = 0; 
    private wallZ: number; // Distance to the back wall (glass/boards)
    
    private gravity: number = 800; // Slightly lower gravity for better arcs
    private floorY: number;
    private landed: boolean = false;

    constructor(x: number, y: number, direction: number) {
        super({
            pos: vec(x, y),
            width: 3,
            height: 3,
            color: Color.fromHex('#b91c1c'), // Fresh red
            z: 20 // Start in front of players
        });

        // 1. Initial Velocity
        // X: Direction of punch + scatter. Increased range for "beside" coverage.
        const vx = (Math.random() * 300 + 50) * direction; 
        
        // Y: Upwards (negative). Random arc.
        const vy = -(Math.random() * 400 + 100); 
        
        this.velocity = vec(vx, vy);

        // 2. Depth Physics (Z)
        // Simulate blood moving away from camera towards the boards/glass.
        // Fast Z = hits wall (high up stains). Slow Z = hits floor.
        this.zVelocity = Math.random() * 450 + 50; 
        this.wallZ = 150; // Arbitrary depth unit where the wall exists

        // 3. Floor Setup
        this.floorY = 360 + (Math.random() * 20 - 10);
    }

    onPreUpdate(engine: Engine, delta: number) {
        if (this.landed) return;

        const dt = delta / 1000;

        // Physics Update
        this.velocity.y += this.gravity * dt;
        
        // Move in 2D
        (this as any).pos.x += this.velocity.x * dt;
        (this as any).pos.y += this.velocity.y * dt;
        
        // Move in Depth
        this.currentZ += this.zVelocity * dt;

        // CHECK 1: Wall/Glass Collision (Background)
        // If we reach the wall depth, we stick there regardless of height (Y)
        if (this.currentZ >= this.wallZ) {
            this.stickToSurface();
            return;
        }

        // CHECK 2: Floor Collision
        if ((this as any).pos.y >= this.floorY) {
            (this as any).pos.y = this.floorY;
            
            // Floor behavior (bounce/slide)
            if (this.velocity.y > 50) {
                // Splash scatter on floor
                this.velocity.x = (Math.random() * 300 - 150); 
                this.velocity.y *= -0.4; // Bounce
            } else {
                // Friction when sliding
                this.velocity.y = 0;
                this.velocity.x *= 0.8; 
            }

            // Stop if slow enough
            if (Math.abs(this.velocity.y) < 10 && Math.abs(this.velocity.x) < 10) {
                this.stickToSurface();
            }
        }
    }

    private stickToSurface() {
        this.landed = true;
        this.velocity = vec(0, 0);
        this.zVelocity = 0;
        
        // Visuals for dried/stuck blood
        (this as any).color = Color.fromHex('#7f1d1d'); // Darker dried blood color
        (this as any).z = -1; // Move behind players

        // Perspective scaling:
        // Calculate how "deep" the particle is (0 to 1 ratio relative to wall distance)
        // Particles further away (higher Z) should appear smaller.
        const depthRatio = Math.min(Math.max(this.currentZ / this.wallZ, 0), 1);
        
        // Scale down from 1.0 (at front) to 0.4 (at back wall)
        const perspectiveScale = 1.0 - (depthRatio * 0.6);
        (this as any).scale = vec(perspectiveScale, perspectiveScale);
    }
}
