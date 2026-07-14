import { PrismaClient } from '@prisma/client'

// Zendesk IDs exceed INT4 — stored as BigInt. Serialize to Number for JSON responses
// (all values fit safely within Number.MAX_SAFE_INTEGER ≈ 9 quadrillion).
;(BigInt.prototype as any).toJSON = function () { return Number(this) }

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    })
  }
  return globalForPrisma.prisma
}
