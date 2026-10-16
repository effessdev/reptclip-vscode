// Ambient declaration so TypeScript accepts importing markdown files as raw
// text. esbuild inlines these as strings at build time via the `text` loader
// (see esbuild.js).
declare module "*.md" {
  const content: string;
  export default content;
}
