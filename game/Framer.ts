
import { ScreenElement, Engine, vec, GraphicsGroup, Sprite, Vector } from "excalibur";
import { FRAMER_TILE_SIZE, SCALE } from "../constants";
import { HockeyGame } from "./HockeyGame";

export class Framer extends ScreenElement {
    private cols: number;
    private rows: number;

    constructor(x: number, y: number, cols: number, rows: number) {
        super({
            pos: vec(x, y),
            width: cols * FRAMER_TILE_SIZE * SCALE,
            height: rows * FRAMER_TILE_SIZE * SCALE,
            anchor: vec(0.5, 0.5),
            z: 5
        });
        this.cols = Math.max(2, cols);
        this.rows = Math.max(2, rows);
    }

    onInitialize(engine: Engine) {
        const game = engine as unknown as HockeyGame;
        const image = game.resources.FramerSheet;

        // Manual slicing of 16x16 source image
        // TL(0,0) TR(8,0)
        // BL(0,8) BR(8,8)
        
        // Corners (8x8)
        const tl = new Sprite({ image, sourceView: { x: 0, y: 0, width: 8, height: 8 } });
        const tr = new Sprite({ image, sourceView: { x: 8, y: 0, width: 8, height: 8 } });
        const bl = new Sprite({ image, sourceView: { x: 0, y: 8, width: 8, height: 8 } });
        const br = new Sprite({ image, sourceView: { x: 8, y: 8, width: 8, height: 8 } });

        // Edges (Sampled from seams and stretched)
        // Top Edge: Sample 1x8 slice from end of TL tile (col 7)
        const t = new Sprite({ image, sourceView: { x: 7, y: 0, width: 1, height: 8 } });
        // Bottom Edge: Sample 1x8 slice from end of BL tile (col 7)
        const b = new Sprite({ image, sourceView: { x: 7, y: 8, width: 1, height: 8 } });
        // Left Edge: Sample 8x1 slice from end of TL tile (row 7)
        const l = new Sprite({ image, sourceView: { x: 0, y: 7, width: 8, height: 1 } });
        // Right Edge: Sample 8x1 slice from end of TR tile (row 7)
        const r = new Sprite({ image, sourceView: { x: 8, y: 7, width: 8, height: 1 } });
        // Center: Sample 1x1 pixel from corner of TL tile (7,7)
        const c = new Sprite({ image, sourceView: { x: 7, y: 7, width: 1, height: 1 } });

        // Apply Scaling
        const baseScale = vec(SCALE, SCALE);
        tl.scale = baseScale;
        tr.scale = baseScale;
        bl.scale = baseScale;
        br.scale = baseScale;

        // Stretch edges to fill 8x8 tile size
        t.scale = vec(SCALE * 8, SCALE);
        b.scale = vec(SCALE * 8, SCALE);
        l.scale = vec(SCALE, SCALE * 8);
        r.scale = vec(SCALE, SCALE * 8);
        c.scale = vec(SCALE * 8, SCALE * 8);

        const members: {graphic: Sprite, offset: Vector}[] = [];
        const ts = FRAMER_TILE_SIZE * SCALE;

        // Center the graphics group on the actor
        const totalW = this.cols * ts;
        const totalH = this.rows * ts;
        const offsetX = -totalW / 2;
        const offsetY = -totalH / 2;

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                let s: Sprite;
                const isLeft = x === 0;
                const isRight = x === this.cols - 1;
                const isTop = y === 0;
                const isBottom = y === this.rows - 1;

                if (isLeft && isTop) s = tl;
                else if (isRight && isTop) s = tr;
                else if (isLeft && isBottom) s = bl;
                else if (isRight && isBottom) s = br;
                else if (isTop) s = t;
                else if (isBottom) s = b;
                else if (isLeft) s = l;
                else if (isRight) s = r;
                else s = c;

                members.push({
                    graphic: s,
                    offset: vec(offsetX + x * ts, offsetY + y * ts)
                });
            }
        }

        const group = new GraphicsGroup({ members });
        this.graphics.use(group);
    }
}
