// Vite asset-URL imports (resolved by the consumer's bundler, e.g. the desktop
// renderer's Vite). Needed so tsc accepts the pdf.js worker `?url` import.
declare module "*?url" {
  const src: string;
  export default src;
}
