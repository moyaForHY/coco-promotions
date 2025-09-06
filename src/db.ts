import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const client = await pool.connect()
  try {
    const res = await client.query(text, params)
    return res.rows as T[]
  } finally {
    client.release()
  }
}



