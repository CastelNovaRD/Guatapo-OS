import 'server-only'

import { Pool, type PoolClient, type QueryResultRow } from 'pg'

let pool: Pool | undefined

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not configured for ShopDesk.')
    this.name = 'DatabaseNotConfiguredError'
  }
}

export function getDatabasePool(): Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new DatabaseNotConfiguredError()

  pool ??= new Pool({ connectionString })
  return pool
}

export async function query<T extends QueryResultRow>(text: string, values: readonly unknown[] = []) {
  return getDatabasePool().query<T>(text, [...values])
}

export async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDatabasePool().connect()
  try {
    await client.query('BEGIN')
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
