import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F5F3EC",
        ink: "#1C2321",
        forest: {
          DEFAULT: "#2F6F4E",
          dark: "#1F4D36",
          light: "#E4EFE8"
        },
        gold: {
          DEFAULT: "#D9A441",
          dark: "#B9862B",
          light: "#FBF0DC"
        },
        clay: "#C0392B",
        line: "#DEDACD"
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        body: ["var(--font-jakarta)", "sans-serif"]
      },
      borderRadius: {
        card: "1.1rem"
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,35,33,0.06), 0 8px 24px -12px rgba(28,35,33,0.12)"
      }
    }
  },
  plugins: []
};
export default config;
