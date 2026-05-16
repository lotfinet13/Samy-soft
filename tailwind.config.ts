import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontSize: {
        xs: ["0.6875rem", { lineHeight: "1rem" }],
        sm: ["0.75rem", { lineHeight: "1rem" }],
        base: ["0.8125rem", { lineHeight: "1.25rem" }],
      },
      colors: {
        surface: {
          DEFAULT: "rgb(var(--color-surface) / <alpha-value>)",
          muted: "rgb(var(--color-surface-muted) / <alpha-value>)",
          elevated: "rgb(var(--color-surface-elevated) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--color-border) / <alpha-value>)",
          strong: "rgb(var(--color-border-strong) / <alpha-value>)",
        },
        foreground: {
          DEFAULT: "rgb(var(--color-fg) / <alpha-value>)",
          muted: "rgb(var(--color-fg-muted) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          foreground: "rgb(var(--color-accent-fg) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--color-danger) / <alpha-value>)",
          foreground: "rgb(var(--color-danger-fg) / <alpha-value>)",
        },
        sidebar: {
          bg: "rgb(var(--color-sidebar-bg) / <alpha-value>)",
          muted: "rgb(var(--color-sidebar-muted) / <alpha-value>)",
          border: "rgb(var(--color-sidebar-border) / <alpha-value>)",
          fg: "rgb(var(--color-sidebar-fg) / <alpha-value>)",
          "fg-muted": "rgb(var(--color-sidebar-fg-muted) / <alpha-value>)",
          accent: "rgb(var(--color-sidebar-accent) / <alpha-value>)",
          "accent-fg": "rgb(var(--color-sidebar-accent-fg) / <alpha-value>)",
          ring: "rgb(var(--color-sidebar-ring) / <alpha-value>)",
        },
      },
      borderRadius: {
        xl: "0.4375rem",
        "2xl": "var(--erp-radius-panel)",
      },
      minHeight: {
        touch: "36px",
      },
      minWidth: {
        touch: "34px",
      },
      spacing: {
        sidebar: "14.5rem",
        topbar: "2.875rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
