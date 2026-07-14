import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { '/*': ['./node_modules/.prisma/**/*'] },
}

export default nextConfig
