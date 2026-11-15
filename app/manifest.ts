import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Personal Finance Observatory',
    short_name: 'Finance',
    description: 'Assets, cash flow and KR/US tax history from private local records',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F6F3',
    theme_color: '#FFFFFF',
    icons: [
      { src: '/android-chrome-192x192.png', type: 'image/png', sizes: '192x192' },
      { src: '/android-chrome-512x512.png', type: 'image/png', sizes: '512x512' },
      { src: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' },
    ],
  }
}
