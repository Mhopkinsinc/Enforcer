import { useState, useEffect } from 'react';

export const useResponsiveScale = () => {
  const [scale, setScale] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Determine if we should be in mobile mode (hide TV shell)
      const mobileMode = windowWidth < 920 || windowHeight < 620;
      setIsMobile(mobileMode);

      // Dimensions of the content to scale
      const contentWidth = mobileMode ? 800 : 920; 
      const contentHeight = mobileMode ? 400 : 600;

      const scaleX = windowWidth / contentWidth;
      const scaleY = windowHeight / contentHeight;

      // Fit within screen, maintaining aspect ratio. 
      const newScale = Math.min(scaleX, scaleY) * 0.95;
      
      setScale(newScale);
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { scale, isMobile };
};