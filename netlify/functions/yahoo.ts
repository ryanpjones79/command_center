const cache = new Map()

export default async (request) => {
  const url = new URL(request.url)
  const targetPath = url.searchParams.get('path')

  if (!targetPath || !targetPath.startsWith('/v7/finance/') && !targetPath.startsWith('/v8/finance/')) {
    return new Response(JSON.stringify({ error: 'Invalid path' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const ttlMs = 30_000
  const key = targetPath
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && now - cached.ts < ttlMs) {
    return new Response(cached.body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-cache': 'HIT',
      },
    })
  }

  const upstream = await fetch(`https://query2.finance.yahoo.com${targetPath}`, {
    headers: {
      'user-agent': 'Mozilla/5.0',
    },
  })

  const body = await upstream.text()
  if (upstream.ok) {
    cache.set(key, { ts: now, body })
  }

  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': 'application/json',
      'x-cache': 'MISS',
    },
  })
}
