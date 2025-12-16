
import { Actor, Engine, vec } from "excalibur";
import { RINK_WIDTH, RINK_HEIGHT, SCALE } from "../constants";
import { HockeyGame } from "./HockeyGame";

export class Rink extends Actor {
    constructor(x: number, y: number) {
        super({
            pos: vec(x, y),
            width: RINK_WIDTH * SCALE,
            height: RINK_HEIGHT * SCALE,
            anchor: vec(0, 0), // Top Left
            z: -20 
        });
    }

    onInitialize(engine: Engine) {
        const game = engine as unknown as HockeyGame;
        const sprite = game.resources.RinkSheet.toSprite();
        sprite.scale = vec(SCALE, SCALE);
        this.graphics.use(sprite);
    }
}
