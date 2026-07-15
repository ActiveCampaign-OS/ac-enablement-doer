import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    inlineCss: true,
  },
  outputFileTracingIncludes: { '/*': ['./node_modules/.prisma/**/*'] },
}

export default nextConfig
