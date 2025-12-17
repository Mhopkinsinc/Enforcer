
import { ScreenElement, vec, Color, GraphicsGroup, Rectangle, Engine, ImageFiltering } from "excalibur";
import { Player } from "./Player";
import { SCALE } from "../constants";

export class HealthBar extends ScreenElement {
    private player: Player;
    private segments: Rectangle[] = [];
    private segmentGraphics: GraphicsGroup;
    private lastHealth: number = -1;

    constructor(x: number, y: number, player: Player) {
        super({
            pos: vec(x, y),
            anchor: vec(0.5, 0.5),
            z: 10
        });
        this.player = player;
        
        // Create the 5 segments - reduced from 6x8 to 4x5
        const segmentWidth = 4 * SCALE;
        const segmentHeight = 5 * SCALE;
        const spacing = 2 * SCALE;
        
        const members = [];
        for (let i = 0; i < 5; i++) {
            const rect = new Rectangle({
                width: segmentWidth,
                height: segmentHeight,
                color: Color.fromHex('#1a1a1a'),
                strokeColor: Color.White,
                lineWidth: 1,
                filtering: ImageFiltering.Pixel
            });
            
            // Positioning centered in the group
            const xPos = (i - 2) * (segmentWidth + spacing);
            members.push({
                graphic: rect,
                offset: vec(xPos, 0)
            });
            this.segments.push(rect);
        }

        this.segmentGraphics = new GraphicsGroup({ members });
        this.graphics.use(this.segmentGraphics);
    }

    onPreUpdate(engine: Engine) {
        if (this.player.health !== this.lastHealth) {
            this.updateSegments();
            this.lastHealth = this.player.health;
        }
    }

    private updateSegments() {
        const activeColor = Color.fromHex('#22c55e');
        const inactiveColor = Color.fromHex('#ef4444');

        this.segments.forEach((rect, i) => {
            if (i < this.player.health) {
                rect.color = activeColor;
            } else {
                rect.color = inactiveColor;
            }
        });
    }
}
