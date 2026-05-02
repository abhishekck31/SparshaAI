import React, { useState, useRef, useCallback, useEffect } from 'react';

const MacOSDock = ({ 
  apps, 
  onAppClick, 
  openApps = [],
  className = ''
}) => {
  const [mouseX, setMouseX] = useState(null);
  const [currentScales, setCurrentScales] = useState(apps.map(() => 1));
  const [currentPositions, setCurrentPositions] = useState([]);
  const dockRef = useRef(null);
  const iconRefs = useRef([]);
  const animationFrameRef = useRef(undefined);
  const lastMouseMoveTime = useRef(0);

  const getResponsiveConfig = useCallback(() => {
    if (typeof window === 'undefined') {
      return { baseIconSize: 64, maxScale: 1.6, effectWidth: 240 };
    }
    const smallerDimension = Math.min(window.innerWidth, window.innerHeight);
    if (smallerDimension < 480) {
      return { baseIconSize: 44, maxScale: 1.4, effectWidth: 180 };
    } else if (smallerDimension < 1024) {
      return { baseIconSize: 56, maxScale: 1.6, effectWidth: 240 };
    } else {
      return { baseIconSize: 60, maxScale: 1.7, effectWidth: 300 };
    }
  }, []);

  const [config, setConfig] = useState(getResponsiveConfig);
  const { baseIconSize, maxScale, effectWidth } = config;
  const minScale = 1.0;
  const baseSpacing = 8;

  useEffect(() => {
    const handleResize = () => setConfig(getResponsiveConfig());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getResponsiveConfig]);

  const calculateTargetMagnification = useCallback((mousePosition) => {
    if (mousePosition === null) return apps.map(() => minScale);
    return apps.map((_, index) => {
      const normalIconCenter = (index * (baseIconSize + baseSpacing)) + (baseIconSize / 2);
      const minX = mousePosition - (effectWidth / 2);
      const maxX = mousePosition + (effectWidth / 2);
      if (normalIconCenter < minX || normalIconCenter > maxX) return minScale;
      const theta = ((normalIconCenter - minX) / effectWidth) * 2 * Math.PI;
      const scaleFactor = (1 - Math.cos(theta)) / 2;
      return minScale + (scaleFactor * (maxScale - minScale));
    });
  }, [apps, baseIconSize, baseSpacing, effectWidth, maxScale, minScale]);

  const calculatePositions = useCallback((scales) => {
    let currentX = 0;
    return scales.map((scale) => {
      const scaledWidth = baseIconSize * scale;
      const centerX = currentX + (scaledWidth / 2);
      currentX += scaledWidth + baseSpacing;
      return centerX;
    });
  }, [baseIconSize, baseSpacing]);

  useEffect(() => {
    const initialScales = apps.map(() => minScale);
    const initialPositions = calculatePositions(initialScales);
    setCurrentScales(initialScales);
    setCurrentPositions(initialPositions);
  }, [apps, calculatePositions, minScale, config]);

  const animateToTarget = useCallback(() => {
    const targetScales = calculateTargetMagnification(mouseX);
    const targetPositions = calculatePositions(targetScales);
    const lerpFactor = mouseX !== null ? 0.25 : 0.15;

    setCurrentScales(prev => prev.map((s, i) => s + (targetScales[i] - s) * lerpFactor));
    setCurrentPositions(prev => prev.map((p, i) => p + (targetPositions[i] - p) * lerpFactor));

    const needsUpdate = currentScales.some((s, i) => Math.abs(s - targetScales[i]) > 0.001) || mouseX !== null;
    if (needsUpdate) animationFrameRef.current = requestAnimationFrame(animateToTarget);
  }, [mouseX, calculateTargetMagnification, calculatePositions, currentScales]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(animateToTarget);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [animateToTarget]);

  const handleMouseMove = (e) => {
    if (dockRef.current) {
      const rect = dockRef.current.getBoundingClientRect();
      setMouseX(e.clientX - rect.left - 20);
    }
  };

  const contentWidth = currentPositions.length > 0 
    ? Math.max(...currentPositions.map((pos, index) => pos + (baseIconSize * currentScales[index]) / 2))
    : (apps.length * (baseIconSize + baseSpacing)) - baseSpacing;

  return (
    <div 
      ref={dockRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setMouseX(null)}
      style={{
        width: `${contentWidth + 40}px`,
        height: `${baseIconSize + 24}px`,
        background: 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(20px)',
        borderRadius: '24px',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'flex-end',
        position: 'relative',
        boxShadow: '0 20px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
        transition: 'width 0.2s ease-out'
      }}
    >
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {apps.map((app, index) => {
          const scale = currentScales[index];
          const position = currentPositions[index] || 0;
          const size = baseIconSize * scale;
          return (
            <div
              key={app.id}
              onClick={() => onAppClick(app.id)}
              style={{
                position: 'absolute',
                left: `${position - size / 2}px`,
                bottom: 0,
                width: `${size}px`,
                height: `${size}px`,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                zIndex: Math.round(scale * 10),
                transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
              }}
              title={app.name}
            >
              <img
                src={app.icon}
                alt={app.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  filter: `drop-shadow(0 ${scale * 2}px ${scale * 4}px rgba(0,0,0,0.2))`
                }}
              />
              {openApps.includes(app.id) && (
                <div style={{
                  position: 'absolute', bottom: '-8px', left: '50%', transform: 'translateX(-50%)',
                  width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#1a1a2e',
                  opacity: 0.6
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MacOSDock;
