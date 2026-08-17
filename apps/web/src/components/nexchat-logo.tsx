interface NexChatLogoProps {
  size?: number;
  showText?: boolean;
  dark?: boolean;
}

export function NexChatLogo({ size = 42, showText = true, dark = true }: NexChatLogoProps) {
  const gradientId = `nexchat-gradient-${size}`;

  return (
    <div className={`nexchat-brand ${dark ? 'nexchat-brand-dark' : ''}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="NexChat logo"
        role="img"
        className="nexchat-logo-mark"
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="8"
            y1="8"
            x2="56"
            y2="58"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="45%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>

          <filter id={`nexchat-shadow-${size}`} x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="5" stdDeviation="5" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Main chat bubble */}
        <path
          d="M32 5C17.088 5 5 15.745 5 29C5 42.255 17.088 53 32 53C35.93 53 39.67 52.24 43.02 50.87L52.5 57L51.2 47.02C56.05 42.56 59 36.25 59 29C59 15.745 46.912 5 32 5Z"
          fill={`url(#${gradientId})`}
          filter={`url(#nexchat-shadow-${size})`}
        />

        {/* Inner highlight */}
        <path
          d="M16 22C18.5 14.5 26 11 34 11C42 11 49 14.5 52 20"
          stroke="white"
          strokeOpacity="0.2"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Letter N */}
        <path d="M20 39V20H24.5L39.5 32.5V20H44V39H39.7L24.5 26.35V39H20Z" fill="white" />

        {/* Small notification dot */}
        <circle cx="51" cy="13" r="5" fill="#22c55e" stroke="white" strokeWidth="2" />
      </svg>

      {showText && (
        <div className="nexchat-brand-text">
          <span className="nexchat-brand-name">
            Nex<span>Chat</span>
          </span>

          <span className="nexchat-brand-tagline">Simple · Fast · Real-time</span>
        </div>
      )}
    </div>
  );
}
