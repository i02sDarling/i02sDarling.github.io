// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://i02sdarling.github.io',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
