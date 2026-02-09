import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    // 👇 여기가 제일 중요합니다! Tailwind가 감시할 폴더들입니다.
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}", // 👈 이 줄이 없어서 스타일이 안 먹혔던 겁니다!
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
export default config;