// app/sitemap.ts
import type { MetadataRoute } from 'next'

const BASE_URL = 'https://www.latios.ai'

export const runtime = 'nodejs'
export const revalidate = 86400 // 24 hours

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const currentDate = new Date()
  const entries: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: currentDate, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/help`, lastModified: currentDate, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/docs/pp`, lastModified: currentDate, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${BASE_URL}/docs/term`, lastModified: currentDate, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${BASE_URL}/library`, lastModified: currentDate, changeFrequency: 'daily', priority: 0.7 },
  ]

  // Early return if we're in development and want to avoid heavy queries
  if (process.env.NODE_ENV === 'development') {
    return entries
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase env not configured')
    }

    const headers = {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Accept': 'application/json',
    } as Record<string, string>

    // 1) Collect ALL distinct summary episode_ids via pagination
    const pageSize = 1000
    let offset = 0
    const allEpisodeIds = new Set<string>()

    while (true) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/tbl_summarize?select=episode_id&delete_status=eq.1&order=episode_id.asc`,
        { 
          headers: { ...headers, Prefer: 'count=exact', Range: `${offset}-${offset + pageSize - 1}` }, 
          next: { revalidate: 86400 },
          signal: AbortSignal.timeout(30000) // 30 second timeout
        }
      )
      if (!res.ok) {
        console.warn(`Failed to fetch episode IDs at offset ${offset}: ${res.status}`)
        break
      }
      const batch: Array<{ episode_id: string }> = await res.json()
      for (const row of batch) {
        if (row.episode_id) allEpisodeIds.add(row.episode_id)
      }
      if (batch.length < pageSize) break
      offset += pageSize
    }

    // 2) Join with tbl_episode (apple) to get podcast_id
    const episodeIds = Array.from(allEpisodeIds)
    const episodeAppleInfo: Record<string, { podcast_id: string, update_time?: string, pub_date?: string }> = {}
    if (episodeIds.length) {
      const chunkSize = 150
      for (let i = 0; i < episodeIds.length; i += chunkSize) {
        const chunk = episodeIds.slice(i, i + chunkSize)
        const inList = encodeURIComponent(`(${chunk.map(id => `"${id}"`).join(',')})`)
        const url = `${supabaseUrl}/rest/v1/tbl_episode?select=guid,podcast_id,update_time,pub_date&guid=in.${inList}`
        const res = await fetch(url, { 
          headers, 
          next: { revalidate: 86400 },
          signal: AbortSignal.timeout(30000) // 30 second timeout
        })
        if (!res.ok) continue
        const rows: Array<{ guid: string, podcast_id: string, update_time?: string, pub_date?: string }> = await res.json()
        for (const r of rows) {
          if (r.guid && r.podcast_id) {
            episodeAppleInfo[r.guid] = { podcast_id: r.podcast_id, update_time: r.update_time, pub_date: r.pub_date }
          }
        }
      }
    }

    // 3) Build URLs for Apple + YouTube (xyz removed for performance)
    const seen = new Set<string>()
    for (const id of allEpisodeIds) {
      const apple = episodeAppleInfo[id]
      const lastModified = new Date(apple?.update_time || apple?.pub_date || currentDate)

      // Apple
      if (apple?.podcast_id) {
        const url = `${BASE_URL}/episode/${apple.podcast_id}/${id}/apple`
        if (!seen.has(url)) {
          entries.push({ url, lastModified, changeFrequency: 'daily', priority: 0.6 })
          seen.add(url)
        }
        // Podcast page
        const podcastUrl = `${BASE_URL}/podcast/${apple.podcast_id}?type=apple`
        if (!seen.has(podcastUrl)) {
          entries.push({ url: podcastUrl, lastModified, changeFrequency: 'weekly', priority: 0.5 })
          seen.add(podcastUrl)
        }
      }

      // YouTube (video IDs are typically 11 chars)
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) {
        const url = `${BASE_URL}/episode/youtube/${id}`
        if (!seen.has(url)) {
          entries.push({ url, lastModified, changeFrequency: 'daily', priority: 0.6 })
          seen.add(url)
        }
      }

      // xyz URLs skipped
    }
  } catch (e) {
    console.error('sitemap generation failed', e)
    // Return basic entries if database queries fail
    return entries
  }

  return entries
}