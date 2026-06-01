import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const dbUrl = process.env.DATABASE_URL || 'file:./outreach.db'
  // Normalise file: URL for libsql — it needs file: protocol
  const libsqlUrl = dbUrl.startsWith('file:') ? dbUrl : `file:${dbUrl}`

  const adapter = new PrismaLibSql({ url: libsqlUrl })

  return new PrismaClient({
    adapter,
    log: ['error'],
  } as ConstructorParameters<typeof PrismaClient>[0])
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
