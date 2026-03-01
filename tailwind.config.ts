import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#162033",
        sand: "#f6f1e8",
        ember: "#b05a40",
        moss: "#3f5f57",
        gold: "#c8a55a",
        slate: "#5e6778",
      },
      boxShadow: {
        card: "0 18px 48px rgba(22, 32, 51, 0.06), 0 1px 0 rgba(255, 255, 255, 0.72) inset",
      },
      backgroundImage: {
        grain:
          "linear-gradient(180deg, rgba(255,255,255,0.4), rgba(255,255,255,0.08)), radial-gradient(circle at top left, rgba(176, 90, 64, 0.06), transparent 32%), radial-gradient(circle at bottom right, rgba(63, 95, 87, 0.08), transparent 26%)",
      },
    },
  },
  plugins: [],
};

export default config;
