import React from 'react';

interface Icon8IllustrationProps {
  type: 'success' | 'error' | 'info' | 'warning' | 'empty-state' | 'loading';
  size?: 'small' | 'medium' | 'large'; // 48px, 72px, 120px
  primaryColor?: string;
  secondaryColor?: string;
  className?: string;
}

const sizeMap = {
  small: '48px',
  medium: '72px',
  large: '120px',
};

const iconFileMap: Record<Icon8IllustrationProps['type'], string> = {
  success: 'success-celebration.svg',
  error: 'error-alert.svg',
  info: 'share-network.svg',
  warning: 'x.svg',
  'empty-state': 'icons8-trophy.gif',
  loading: 'spinner.gif',
};

const Icon8Illustration: React.FC<Icon8IllustrationProps> = ({
  type,
  size = 'medium',
  primaryColor = '#c8860a',
  secondaryColor = '#0f6b5e',
  className = '',
}) => {
  const pixelSize = sizeMap[size];
  const iconFile = iconFileMap[type] ?? 'x.svg';
  const assetPath = new URL(`../../assets/icons8/${iconFile}`, import.meta.url).href;
  const fallbackPath = new URL('../../assets/icons8/x.svg', import.meta.url).href;
  const wrapperStyle = {
    '--icon8-primary': primaryColor,
    '--icon8-secondary': secondaryColor,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: pixelSize,
    height: pixelSize,
  } as React.CSSProperties;

  return (
    <div
      className={`icon8-illustration ${className}`}
      style={wrapperStyle}
    >
      <img
        src={assetPath}
        alt={type}
        onError={(event) => {
          const target = event.currentTarget;
          if (target.src !== fallbackPath) {
            target.src = fallbackPath;
          }
        }}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          filter: `hue-rotate(var(--hue-${type}, 0deg)) saturate(1.04)`,
        }}
      />
    </div>
  );
};

export default Icon8Illustration;
