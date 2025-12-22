import React from 'react';
import { SMALLFONT_SHEET_B64 } from '../game/sprites/smallfontsheet';
import { ALPHABET } from '../appConstants';

export const PixelText: React.FC<{ text: string; scale?: number }> = ({ text, scale = 3 }) => {
  return (
    <div className="flex flex-row gap-0">
      {text.split('').map((char, i) => {
        const index = ALPHABET.indexOf(char);
        if (index === -1) return <div key={i} style={{ width: 8 * scale }} />;
        
        const col = index % 32;
        const row = Math.floor(index / 32);
        
        return (
          <div
            key={i}
            style={{
              width: 8 * scale,
              height: 8 * scale,
              backgroundImage: `url(${SMALLFONT_SHEET_B64})`,
              backgroundSize: `${32 * 8 * scale}px ${3 * 8 * scale + (8 * scale)}px`, 
              backgroundPosition: `-${col * 8 * scale}px -${(row + 1) * 8 * scale}px`,
              imageRendering: 'pixelated',
            }}
          />
        );
      })}
    </div>
  );
};