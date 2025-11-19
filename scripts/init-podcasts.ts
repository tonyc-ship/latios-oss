#!/usr/bin/env node

/**
 * Initialization script to populate tbl_podcast and tbl_episode
 * with pre-curated podcasts from top_podcasts.csv
 */

import { createClient } from '@supabase/supabase-js';
import { parseStringPromise } from 'xml2js';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

// Load environment variables from .env.local
try {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf-8');
    envFile.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          process.env[key.trim()] = value.trim();
        }
      }
    });
  }
} catch (error) {
  console.warn('Warning: Could not load .env.local file:', error);
}

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: Missing environment variables');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Number of latest episodes to fetch per podcast
const EPISODES_PER_PODCAST = 5;

interface PodcastRow {
  podcast_name: string;
  rss_feed_url: string;
}

// Helper function to strip HTML tags
function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, ' ').trim();
}

// Helper function to format duration
function formatDuration(duration: string | number): string {
  if (!duration) return '';
  
  // If already formatted as HH:MM:SS or MM:SS
  if (typeof duration === 'string' && duration.includes(':')) return duration;
  
  // Convert seconds to HH:MM:SS
  const seconds = parseInt(String(duration), 10);
  if (isNaN(seconds)) return String(duration);
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

// Helper function to format date
function formatDate(dateString: string): string | null {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch (e) {
    return null;
  }
}

// Generate a unique ID from RSS feed URL
function generatePodcastId(rssUrl: string): string {
  // Use hash of URL to create a consistent unique ID
  return createHash('md5').update(rssUrl).digest('hex');
}

// Parse CSV file
function parseCSV(filePath: string): PodcastRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  // Skip header row
  const rows: PodcastRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Improved CSV parsing that handles quoted fields with commas
    // Split by comma, but respect quoted strings
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim()); // Add the last part
    
    if (parts.length >= 2) {
      const podcastName = parts[0].replace(/^"|"$/g, '');
      const rssUrl = parts.slice(1).join(',').replace(/^"|"$/g, ''); // Join in case URL has commas
      
      if (podcastName && rssUrl) {
        rows.push({
          podcast_name: podcastName,
          rss_feed_url: rssUrl
        });
      }
    }
  }
  
  return rows;
}

// Fetch and parse RSS feed
async function fetchRSSFeed(rssUrl: string) {
  try {
    console.log(`  Fetching RSS feed: ${rssUrl}`);
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Latios/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const xmlText = await response.text();
    const parsed = await parseStringPromise(xmlText, { explicitArray: false });
    
    return parsed.rss.channel;
  } catch (error) {
    console.error(`  Error fetching RSS feed: ${error}`);
    throw error;
  }
}

// Insert podcast into database
async function insertPodcast(
  podcastId: string,
  channel: any,
  rssUrl: string
): Promise<boolean> {
  try {
    const title = channel.title || '';
    const description = stripHtml(channel.description || '');
    const image = channel.image?.url || channel['itunes:image']?.$.href || '';
    const author = channel['itunes:author'] || channel.managingEditor || '';
    const pubDate = formatDate(channel.pubDate || channel.lastBuildDate);
    
    const podcastData = {
      itunes_id: podcastId,
      title: title,
      short_title: title.substring(0, 100),
      description: description,
      introduction: description.substring(0, 500),
      image: image,
      itunes_image: image,
      itunes_author: author,
      pub_date: pubDate,
      items: 0, // Will be updated after episodes are inserted
      update_time: new Date().toISOString(),
      recommend: 0,
      sort: 0,
      delete_status: 1
    };

    const { error } = await supabase
      .from('tbl_podcast')
      .upsert(podcastData, { onConflict: 'itunes_id' });

    if (error) {
      console.error(`  Error inserting podcast: ${error.message}`);
      return false;
    }

    console.log(`  ✓ Podcast inserted/updated: ${title}`);
    return true;
  } catch (error) {
    console.error(`  Error inserting podcast: ${error}`);
    return false;
  }
}

// Insert episodes into database
async function insertEpisodes(
  podcastId: string,
  podcastName: string,
  items: any[],
  limit: number = EPISODES_PER_PODCAST
): Promise<number> {
  const episodesToInsert = items.slice(0, limit);
  let insertedCount = 0;

  for (const item of episodesToInsert) {
    try {
      const description = item.description || item['itunes:summary'] || item['content:encoded'] || '';
      const enclosureUrl = item.enclosure?.$.url || '';
      const enclosureType = item.enclosure?.$.type || '';
      const enclosureLength = item.enclosure?.$.length || '';
      
      // Generate GUID - use item.guid if available, otherwise create from title + pubDate
      let guid = item.guid?._ || item.guid || '';
      if (!guid || guid.trim() === '') {
        // Create a unique GUID from podcast ID, title, and pubDate
        const guidSource = `${podcastId}-${item.title || ''}-${item.pubDate || Date.now()}`;
        guid = createHash('md5').update(guidSource).digest('hex');
      }
      // Clean GUID to remove invalid characters and ensure it's not too long
      guid = guid.replace(/[\/\?\:\=]/g, '').substring(0, 500);

      const episodeData = {
        guid: guid,
        podcast_id: podcastId,
        podcast_name: podcastName,
        title: item.title || '',
        line_title: item.title || '',
        description: stripHtml(description),
        pub_date: formatDate(item.pubDate),
        author: item['itunes:author'] || item.author || '',
        itunes_image: item['itunes:image']?.$.href || '',
        itunes_duration: formatDuration(item['itunes:duration'] || item.duration || ''),
        itunes_summary: stripHtml(item['itunes:summary'] || ''),
        itunes_subtitle: item['itunes:subtitle'] || '',
        enclosure_url: enclosureUrl,
        enclosure_type: enclosureType,
        enclosure_length: enclosureLength,
        type: 1,
        status: 1,
        delete_status: 1,
        update_time: new Date().toISOString()
      };

      const { error } = await supabase
        .from('tbl_episode')
        .upsert(episodeData, { onConflict: 'guid' });

      if (error) {
        console.error(`    Error inserting episode "${item.title}": ${error.message}`);
      } else {
        insertedCount++;
      }
    } catch (error) {
      console.error(`    Error processing episode: ${error}`);
    }
  }

  // Update podcast items count
  await supabase
    .from('tbl_podcast')
    .update({ items: insertedCount })
    .eq('itunes_id', podcastId);

  return insertedCount;
}

// Main function
async function main() {
  console.log('🚀 Starting podcast initialization...\n');

  const csvPath = path.join(process.cwd(), 'top_podcasts.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error(`Error: CSV file not found at ${csvPath}`);
    process.exit(1);
  }

  const podcasts = parseCSV(csvPath);
  console.log(`Found ${podcasts.length} podcasts in CSV\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < podcasts.length; i++) {
    const podcast = podcasts[i];
    console.log(`[${i + 1}/${podcasts.length}] Processing: ${podcast.podcast_name}`);

    try {
      // Generate unique podcast ID from RSS URL
      const podcastId = generatePodcastId(podcast.rss_feed_url);

      // Fetch and parse RSS feed
      const channel = await fetchRSSFeed(podcast.rss_feed_url);

      // Insert podcast
      const podcastInserted = await insertPodcast(podcastId, channel, podcast.rss_feed_url);
      
      if (!podcastInserted) {
        errorCount++;
        console.log(`  ✗ Failed to insert podcast\n`);
        continue;
      }

      // Get episodes
      const items = Array.isArray(channel.item) ? channel.item : [channel.item];
      const itemsSorted = items.sort((a: any, b: any) => {
        const dateA = new Date(a.pubDate || 0).getTime();
        const dateB = new Date(b.pubDate || 0).getTime();
        return dateB - dateA; // Sort descending (newest first)
      });

      // Insert episodes
      const episodeCount = await insertEpisodes(
        podcastId,
        channel.title || podcast.podcast_name,
        itemsSorted,
        EPISODES_PER_PODCAST
      );

      console.log(`  ✓ Inserted ${episodeCount} episodes\n`);
      successCount++;
    } catch (error) {
      console.error(`  ✗ Error processing podcast: ${error}\n`);
      errorCount++;
    }
  }

  console.log('\n✅ Initialization complete!');
  console.log(`   Success: ${successCount} podcasts`);
  console.log(`   Errors: ${errorCount} podcasts`);
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

