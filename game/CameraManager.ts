
import { Vector } from "excalibur";
import { HockeyGame } from "./HockeyGame";

export class CameraManager {
    private game: HockeyGame;
    private shakeTimer: number = 0;
    private shakeStrength: number = 0;

    constructor(game: HockeyGame) {
        this.game = game;
    }

    public shake(duration: number, strength: number) {
        this.shakeTimer = duration;
        this.shakeStrength = strength;
    }

    public reset() {
        this.shakeTimer = 0;
        this.shakeStrength = 0;
        const scene = (this.game as any).currentScene;
        scene.camera.zoom = 1;
        scene.camera.pos = new Vector(400, 200);
    }

    public update(delta: number) {
        const p1 = this.game.player1;
        const p2 = this.game.player2;

        if (!p1 || !p2) return;

        const SCREEN_WIDTH = 800;
        const SCREEN_HEIGHT = 400;
        
        let targetZoom = 1.0;
        let targetX = 400;
        let targetY = SCREEN_HEIGHT / 2;

        const loser = this.game.winner === 'PLAYER 2' ? p1 : p2;
        const isFalling = loser?.state === 'falling';

        if (!this.game.glovesLanded) {
             targetZoom = 1.0;
             targetX = 400;
             targetY = 200;
        } else if (this.game.isGameOver && this.game.winner && !isFalling) {
            // KO Zoom Phase
            const opponent = loser!.opponent;

            if (this.game.koTimer < 2000) {
                targetZoom = 3.5;
                
                const dir = ((loser as any).pos.x < ((opponent as any)?.pos.x ?? 0)) ? 1 : -1;
                targetX = (loser as any).pos.x + (-25 * dir);
                
                // Adjusted to focus lower (on the ground) for fallen player
                targetY = (loser as any).pos.y - 20;                
            } else {
                targetZoom = 1.0;
                targetX = 400;
                targetY = 200;
            }
        } else {
            // Standard Tracking Camera
            const pos1 = (p1 as any).pos.x;
            const pos2 = (p2 as any).pos.x;
            const midpoint = (pos1 + pos2) / 2;
            const distance = Math.abs(pos1 - pos2);

            const MIN_ZOOM = 1.0;
            const MAX_ZOOM = 1.4; 
            const PADDING = 250; 

            const requiredWidth = distance + PADDING;
            targetZoom = SCREEN_WIDTH / requiredWidth;
            
            targetZoom = Math.max(MIN_ZOOM, Math.min(targetZoom, MAX_ZOOM));
            
            targetX = midpoint;
            targetY = SCREEN_HEIGHT / 2;
        }

        const lerpFactor = 0.02; 
        const currentZoom = (this.game as any).currentScene.camera.zoom;
        const newZoom = currentZoom + (targetZoom - currentZoom) * lerpFactor;
        (this.game as any).currentScene.camera.zoom = newZoom;

        const viewWidth = SCREEN_WIDTH / newZoom;
        const viewHeight = SCREEN_HEIGHT / newZoom;
        
        const halfViewW = viewWidth / 2;
        const halfViewH = viewHeight / 2;
        
        const minX = halfViewW;
        const maxX = 800 - halfViewW;
        const minY = halfViewH;
        const maxY = 400 - halfViewH;

        targetX = Math.max(minX, Math.min(targetX, maxX));
        targetY = Math.max(minY, Math.min(targetY, maxY));

        const currentX = (this.game as any).currentScene.camera.pos.x;
        const currentY = (this.game as any).currentScene.camera.pos.y;
        
        const newX = currentX + (targetX - currentX) * lerpFactor;
        const newY = currentY + (targetY - currentY) * lerpFactor;

        let shakeX = 0;
        let shakeY = 0;
        if (this.shakeTimer > 0) {
            this.shakeTimer -= delta;
            if (this.shakeTimer < 0) this.shakeTimer = 0;
            shakeX = (Math.random() * this.shakeStrength * 2) - this.shakeStrength;
            shakeY = (Math.random() * this.shakeStrength * 2) - this.shakeStrength;
        }

        (this.game as any).currentScene.camera.pos = new Vector(newX + shakeX, newY + shakeY);
    }
}
