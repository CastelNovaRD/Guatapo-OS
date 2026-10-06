import { NextResponse } from 'next/server'
import { fetchHubConfigFromServer, normalizeHubConfig } from '@/lib/castelnova-hub'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const config = await fetchHubConfigFromServer()
    return NextResponse.json(config)
  } catch (error) {
    return NextResponse.json(
      normalizeHubConfig({
        connected: false,
        maintenance_message:
          error instanceof Error
            ? `No se pudo conectar con CastelNova Hub: ${error.message}`
            : 'No se pudo conectar con CastelNova Hub.',
        last_seen_at: new Date().toISOString(),
      }),
      { status: 200 }
    )
  }
}
