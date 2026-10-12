import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

const RELEASE_PRUNED_PUBLIC_PATHS = ['textures/expo']

function resolveBuildStamp() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.COMMIT_SHA ||
    (() => {
      try {
        return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
      } catch {
        return 'local'
      }
    })()

  const target = process.env.VERCEL_ENV ? `vercel-${process.env.VERCEL_ENV}` : 'local'
  return `${target}:${commit.slice(0, 12)}`
}

function isFeatureFlagEnabled(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '')
}

function releasePublicAssetPrunePlugin(): Plugin {
  let resolvedConfig: ResolvedConfig

  return {
    name: 'warpala-release-public-asset-prune',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      resolvedConfig = config
    },
    closeBundle() {
      const outDir = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir)
      for (const relativePath of RELEASE_PRUNED_PUBLIC_PATHS) {
        rmSync(path.join(outDir, relativePath), { recursive: true, force: true })
      }
    },
  }
}

function compactCloudflareEnvironmentPlugin(): Plugin {
  return {
    name: 'warpala-cloudflare-compact-environment',
    apply: 'build',
    enforce: 'pre',
    transform(source, id) {
      if (process.env.WARPALA_COMPACT_ASSETS !== '1'
        || !id.replaceAll('\\', '/').endsWith('/ExpoWorldSceneQualityStrategy.ts')) return null
      const original = "'/models/modern_evening_street_4k.exr'"
      if (!source.includes(original)) throw new Error('Compact environment source contract changed')
      return {
        code: source.replace(original, "'/textures/expo-runtime/modern-evening-street-1k.hdr'"),
        map: null,
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
  publicDir: process.env.WARPALA_PUBLIC_DIR || 'public',
  define: {
    global: 'window',
    __WARPALA_EXPO_BUILD_STAMP__: JSON.stringify(resolveBuildStamp()),
    __WARPALA_ENABLE_DEMO_ROUTES__: JSON.stringify(isFeatureFlagEnabled(env.VITE_ENABLE_DEMO)),
  },
  optimizeDeps: {
    entries: ['index.html'],
  },
  resolve: {
    dedupe: ['three', '@react-three/fiber', '@react-three/drei', 'react', 'react-dom'],
    alias: {
      ioredis: '/src/shims/ioredis-browser.ts',
    },
  },
  plugins: [
    compactCloudflareEnvironmentPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Warpala Sponsor Expo',
        short_name: 'Warpala',
        description: 'Web3D sponsor expo, city screens, booths, and modular-home studio',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5000000,
        globIgnores: ['**/textures/expo/**']
      },
      devOptions: {
        enabled: false // Disable dev caching during expo iteration.
      }
    }),
    releasePublicAssetPrunePlugin()
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1450,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/')
          if (normalizedId.includes('/src/modules/expo/runtime/modularHome/')) {
            return 'modular-home'
          }

          if (id.includes('node_modules')) {
            if (normalizedId.includes('/node_modules/three/')) {
              return 'three-core'
            }

            if (
              id.includes('@react-three') ||
              id.includes('three-stdlib') ||
              id.includes('@pmndrs') ||
              id.includes('troika-') ||
              id.includes('suspend-react')
            ) {
              return 'react-three-vendor'
            }

            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('react-router') ||
              id.includes('/scheduler/')
            ) {
              return 'react-vendor'
            }

            if (id.includes('@supabase')) {
              return 'supabase-vendor'
            }

          }

          return undefined
        }
      }
    }
  }
  }
})
