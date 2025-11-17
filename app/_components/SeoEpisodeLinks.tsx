// Server component: renders a static list of episode URLs for SEO indexing

type SummarizeRow = {
  episode_id: string
  update_time?: string
}

type EpisodeRow = {
  guid: string
  podcast_id: string
  update_time?: string
  pub_date?: string
}

function isYouTubeId(id: string) {
  return /^[A-Za-z0-9_-]{11}$/.test(id)
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, next: { revalidate: 3600 } })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export default async function SeoEpisodeLinks() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    Accept: 'application/json',
  } as Record<string, string>

  const summarizeUrl = `${supabaseUrl}/rest/v1/tbl_summarize?select=episode_id,update_time&delete_status=eq.1&order=update_time.desc&limit=300`
  const summarize = await fetchJson<SummarizeRow[]>(summarizeUrl, headers)
  if (!summarize || summarize.length === 0) return null

  const episodeIds = Array.from(new Set(summarize.map(r => r.episode_id).filter(Boolean)))
  const episodeAppleInfo: Record<string, { podcast_id: string; update_time?: string; pub_date?: string }> = {}

  const chunkSize = 150
  for (let i = 0; i < episodeIds.length; i += chunkSize) {
    const chunk = episodeIds.slice(i, i + chunkSize)
    const inList = encodeURIComponent(`(${chunk.map(id => `"${id}"`).join(',')})`)
    const url = `${supabaseUrl}/rest/v1/tbl_episode?select=guid,podcast_id,update_time,pub_date&guid=in.${inList}`
    const rows = await fetchJson<EpisodeRow[] | null>(url, headers)
    if (!rows || rows.length === 0) continue
    for (const r of rows) {
      if (r.guid && r.podcast_id) {
        episodeAppleInfo[r.guid] = {
          podcast_id: r.podcast_id,
          update_time: r.update_time,
          pub_date: r.pub_date,
        }
      }
    }
  }

  const links: { href: string; label: string }[] = []
  for (const id of episodeIds) {
    const apple = episodeAppleInfo[id]
    if (apple?.podcast_id) {
      links.push({ href: `/episode/${apple.podcast_id}/${id}/apple`, label: `Episode ${id}` })
    } else if (isYouTubeId(id)) {
      links.push({ href: `/episode/youtube/${id}`, label: `YouTube ${id}` })
    }
  }

  if (links.length === 0) return null

  // Keep this visually subtle but visible to ensure indexing
  return (
    <section aria-label="Episode links for SEO" aria-hidden="true" className="hidden mt-8">
      <h2 className="text-sm font-medium text-gray-500">Latest episode links</h2>
      <ul className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
        {links.slice(0, 200).map((l, idx) => (
          <li key={idx}>
            <a href={l.href} className="underline hover:text-blue-600">{l.label}</a>
          </li>
        ))}
      </ul>
    </section>
  )
}


