// Tailwind v4 PostCSS pipeline. The plugin reads `globals.css` for the
// `@theme` block (Camp design tokens) and generates utility classes from
// it at build time.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
