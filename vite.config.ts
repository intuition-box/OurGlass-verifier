import { defineConfig } from 'vite'

// Relative base so the build works from any path, including an IPFS CID gateway
// (ipfs://<cid>/ or https://<gateway>/ipfs/<cid>/).
export default defineConfig({
  base: './',
})
