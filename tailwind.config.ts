import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F7FCFD",
        ink: "#173042",
        turquoise: {
          DEFAULT: "#32C7D2",
          dark: "#1CB5C9",
          mid: "#27C3CF",
          light: "#E6F9FB"
        },
        gold: {
          DEFAULT: "#FFD233",
          dark: "#E6B800",
          light: "#FFF6D9"
        },
        clay: "#E5484D",
        line: "#DCEEF1"
      },
      fontFamily: {
        display: ["var(--font-poppins)", "sans-serif"],
        body: ["var(--font-poppins)", "sans-serif"]
      },
      backgroundImage: {
        brand: "linear-gradient(135deg, #32C7D2, #27C3CF, #1CB5C9)"
      },
      borderRadius: {
        card: "1.25rem",
        pill: "999px"
      },
      boxShadow: {
        card: "0 1px 2px rgba(23,48,66,0.05), 0 12px 28px -14px rgba(23,48,66,0.16)",
        soft: "0 8px 24px -10px rgba(28,167,190,0.28)",
        glow: "0 0 0 4px rgba(50,199,210,0.12)"
      },
      backdropBlur: {
        glass: "16px"
      }
    }
  },
  plugins: []
};
export default config;
