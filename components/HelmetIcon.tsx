import React from "react";
import Svg, { Path, G, Defs, LinearGradient, Stop } from "react-native-svg";

interface HelmetIconProps {
  size?: number;
  color?: string;
  active?: boolean;
}

export default function HelmetIcon({ size = 48, color = "#FF6600", active = false }: HelmetIconProps) {
  const opacity = active ? 1 : 0.85;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Defs>
        <LinearGradient id="helmetGrad" x1="20" y1="10" x2="80" y2="90" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.5" stopColor={color} stopOpacity={opacity * 0.9} />
          <Stop offset="1" stopColor="#CC5200" stopOpacity={opacity} />
        </LinearGradient>
        <LinearGradient id="visorGrad" x1="30" y1="45" x2="75" y2="60" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#1a1a1a" stopOpacity="0.95" />
          <Stop offset="0.5" stopColor="#333333" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#1a1a1a" stopOpacity="0.95" />
        </LinearGradient>
      </Defs>
      <G>
        <Path
          d="M50 8 C28 8 14 22 12 42 C10 58 12 65 18 72 C20 75 22 78 24 82 L76 82 C78 78 80 75 82 72 C88 65 90 58 88 42 C86 22 72 8 50 8 Z"
          fill="url(#helmetGrad)"
          stroke="#CC5200"
          strokeWidth="1.5"
        />
        <Path
          d="M20 48 C22 42 28 38 40 36 L72 36 C80 38 84 42 86 48 L84 56 C80 60 70 62 55 62 L35 62 C25 60 20 56 18 52 Z"
          fill="url(#visorGrad)"
          stroke="#444"
          strokeWidth="1"
        />
        <Path
          d="M18 52 L15 58 C14 62 16 66 20 68 L30 70 L35 62 C25 60 20 56 18 52 Z"
          fill="#222"
          stroke="#444"
          strokeWidth="0.5"
        />
        <Path
          d="M24 82 L22 86 C20 90 22 92 26 92 L74 92 C78 92 80 90 78 86 L76 82 Z"
          fill="#333"
          stroke="#444"
          strokeWidth="0.5"
        />
        <Path
          d="M40 36 L42 30 C44 26 48 24 50 24 C52 24 56 26 58 30 L60 34"
          fill="none"
          stroke="#FF8833"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.4"
        />
        <Path
          d="M30 44 C35 41 45 40 55 40 C65 41 72 44 76 48"
          fill="none"
          stroke="#555"
          strokeWidth="0.5"
          opacity="0.6"
        />
      </G>
    </Svg>
  );
}
