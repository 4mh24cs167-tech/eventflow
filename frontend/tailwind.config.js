/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,vue}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary-container": "#1a237e", "on-surface-variant": "#454652", "surface-container-highest": "#e1e3e4",
        "error-container": "#ffdad6", "primary": "#000666", "on-secondary-fixed-variant": "#004f4f",
        "surface-container": "#edeeef", "surface-bright": "#f8f9fa", "inverse-primary": "#bdc2ff", "tertiary": "#380b00",
        "surface-dim": "#d9dadb", "outline-variant": "#c6c5d4", "primary-fixed-dim": "#bdc2ff", "surface-container-lowest": "#ffffff",
        "on-secondary-fixed": "#002020", "secondary-container": "#90efef", "on-error-container": "#93000a",
        "background": "#f8f9fa", "tertiary-container": "#5c1800", "on-primary": "#ffffff", "error": "#ba1a1a",
        "surface-container-low": "#f3f4f5", "primary-fixed": "#e0e0ff", "surface-variant": "#e1e3e4",
        "on-primary-fixed-variant": "#343d96", "secondary": "#006a6a", "on-tertiary-fixed": "#390c00",
        "surface-tint": "#4c56af", "on-tertiary-container": "#e17c5a", "on-secondary-container": "#006e6e",
        "on-primary-container": "#8690ee", "tertiary-fixed-dim": "#ffb59d", "secondary-fixed": "#93f2f2",
        "on-secondary": "#ffffff", "surface-container-high": "#e7e8e9", "secondary-fixed-dim": "#76d6d5",
        "on-background": "#191c1d", "surface": "#f8f9fa", "on-tertiary-fixed-variant": "#7b2e12",
        "on-surface": "#191c1d", "tertiary-fixed": "#ffdbd0", "on-error": "#ffffff", "outline": "#767683",
        "on-tertiary": "#ffffff", "inverse-surface": "#2e3132", "inverse-on-surface": "#f0f1f2", "on-primary-fixed": "#000767"
      },
      fontFamily: { 
        "headline": ["Manrope", "sans-serif"], 
        "body": ["Inter", "sans-serif"], 
        "label": ["Inter", "sans-serif"] 
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries')
  ],
}
