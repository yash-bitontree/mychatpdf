/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17212b",
        mist: "#f6f8fb",
        sea: "#2068f8",
        brand: {
          blue: "#2068f8",
          violet: "#8040f0",
          ice: "#eef4ff",
          lavender: "#f4efff"
        },
        teal: {
          50: "#eef4ff",
          100: "#dbe8ff",
          200: "#bfd6ff",
          800: "#1d4ed8",
          900: "#1e3a8a"
        },
        coral: "#d95f43"
      },
      boxShadow: {
        panel: "0 18px 45px rgba(23, 33, 43, 0.08)"
      }
    }
  },
  plugins: []
};
