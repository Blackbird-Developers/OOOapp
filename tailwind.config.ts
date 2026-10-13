import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          accent: "#FCFA64",
          ink: "#422016",
        },
        // Whooo's greys lean warm, so they sit with the brown ink instead of
        // fighting it. Same lightness steps as Tailwind's neutral (contrast is
        // unchanged); chroma rises towards the dark end, and 900 is the ink.
        neutral: {
          50: "#fcf9f7",
          100: "#f8f4f0",
          200: "#eae4df",
          300: "#dad2cc",
          400: "#aba097",
          500: "#7e7066",
          600: "#665547",
          700: "#5b3f36",
          800: "#512f25",
          900: "#422016",
          950: "#2c120b",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
