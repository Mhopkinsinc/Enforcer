
import { Actor, vec, SpriteSheet, ImageSource, Engine } from "excalibur";
import { GLOVES_WIDTH, GLOVES_HEIGHT, SCALE } from "../constants";
import { HockeyGame } from "./HockeyGame";

export class Gloves extends Actor {
    public readonly isPlayer1: boolean;
    private targetY: number;
    private landed: boolean = false;

    constructor(x: number, y: number, isPlayer1: boolean) {
        super({
            pos: vec(x, y),
            width: GLOVES_WIDTH * SCALE,
            height: GLOVES_HEIGHT * SCALE,
            anchor: vec(0.5, 0.5)
        });
        this.isPlayer1 = isPlayer1;
        this.targetY = y + 20;
    }

    onInitialize(engine: Engine) {
        const game = engine as unknown as HockeyGame;

        const sheet = SpriteSheet.fromImageSource({
            image: game.resources.GlovesSheet,
            grid: {
                rows: 1,
                columns: 2,
                spriteWidth: GLOVES_WIDTH,
                spriteHeight: GLOVES_HEIGHT
            }
        });

        const sprite = sheet.getSprite(this.isPlayer1 ? 0 : 1, 0); // Left sprite for P1, Right for P2
        if (sprite) {
            sprite.scale = vec(SCALE, SCALE);
            (this as any).graphics.use(sprite);
        }
    }

    onPreUpdate(engine: Engine, delta: number) {
        // Slide down slowly
        if ((this as any).pos.y < this.targetY) {
            // Move at ~30 pixels per second
            (this as any).pos.y += 30 * (delta / 1000);
            
            // Clamp to target
            if ((this as any).pos.y >= this.targetY) {
                (this as any).pos.y = this.targetY;
                if (!this.landed) {
                    this.landed = true;
                    // Emit event so the camera knows gloves have settled
                    (this as any).scene?.emit('glovesLanded', {});
                }
            }
        }
    }
}
