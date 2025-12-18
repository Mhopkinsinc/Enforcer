
import { Actor, Engine, SpriteSheet, vec } from "excalibur";
import { NET_WIDTH, NET_HEIGHT, SCALE } from "../constants";
import { HockeyGame } from "./HockeyGame";

export class Net extends Actor {
    constructor(x: number, y: number) {
        super({
            pos: vec(x, y),
            width: NET_WIDTH * SCALE,
            height: NET_HEIGHT * SCALE,
            anchor: vec(0.5, 0.5),
            z: -10 // Render behind players (players usually z=0 or higher)
        });
    }

    onInitialize(engine: Engine) {
        const game = engine as unknown as HockeyGame;
        
        const sheet = SpriteSheet.fromImageSource({
            image: game.resources.GoalNetsSheet,
            grid: {
                rows: 1,
                columns: 2,
                spriteWidth: NET_WIDTH,
                spriteHeight: NET_HEIGHT
            }
        });

        // Use the first sprite (index 0) which corresponds to the "top" net
        const sprite = sheet.getSprite(0, 0);
        if (sprite) {
            sprite.scale = vec(SCALE, SCALE);
            (this as any).graphics.use(sprite);
        }
    }
}
