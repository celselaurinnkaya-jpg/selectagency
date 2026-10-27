import React from "react";

interface LogoProps {
  className?: string;
  variant?: "onDark" | "onLight";
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
}

export function Logo({
  className = "",
  variant = "onDark",
  size = "md",
  showSubtitle = true,
}: LogoProps) {
  const isDark = variant === "onDark";
  
  // Sizing maps
  const heightMap = {
    sm: "h-7",
    md: "h-9",
    lg: "h-12",
  };

  const primaryColor = isDark ? "#F0FF0A" : "#023764";
  const subtitleColor = isDark ? "#F0FF0A" : "#023764";
  const underlineColor = isDark ? "#F0FF0A" : "#023764";

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <svg
        viewBox="0 0 280 85"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${heightMap[size]} w-auto drop-shadow-sm`}
        aria-label="SELECT Agency Logo"
      >
        {/* SELECT Custom Stylized Geometry */}
        <g fill={primaryColor}>
          {/* S */}
          <path
            d="M 12 18 C 12 12 18 8 26 8 L 44 8 C 50 8 54 12 54 18 L 54 22 C 54 26 50 30 45 30 L 28 30 C 22 30 18 34 18 40 L 18 48 C 18 54 22 58 28 58 L 46 58 C 52 58 56 54 56 48 L 56 42 C 56 39 58 37 61 37 C 64 37 66 39 66 42 L 66 48 C 66 59 58 68 46 68 L 28 68 C 16 68 8 60 8 48 L 8 40 C 8 30 15 22 24 20 L 42 20 C 44 20 45 19 45 17 L 45 15 C 45 13 43 12 41 12 L 26 12 C 20 12 17 14 17 18 C 17 21 15 23 12 23 C 9 23 12 18 12 18 Z"
            transform="scale(0.85) translate(4, 2)"
          />

          {/* Direct styled SVG path for SELECT */}
          <text
            x="4"
            y="46"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Arial Black', sans-serif"
            fontWeight="900"
            fontSize="44"
            letterSpacing="2.5"
            fill={primaryColor}
            style={{ fontStretch: "expanded" }}
          >
            SELECT
          </text>
        </g>

        {showSubtitle && (
          <g>
            {/* Agency subtitle right-aligned below SELECT */}
            <text
              x="146"
              y="68"
              fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
              fontWeight="700"
              fontSize="20"
              letterSpacing="1"
              fill={subtitleColor}
            >
              Agency
            </text>

            {/* Underline beneath Agency */}
            <line
              x1="148"
              y1="75"
              x2="228"
              y2="75"
              stroke={underlineColor}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
