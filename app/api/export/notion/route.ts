import { NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    
    // Parse request body
    const { content, title, podcastName, contentType, episodeUrl, publishDate, episodeImage, channelImage } = await request.json();

    if (!content || !title) {
      return NextResponse.json(
        { error: 'Content and title are required' },
        { status: 400 }
      );
    }

    // Verify the user token and get user ID
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Get user's Notion token from database
    const { data: notionToken, error: tokenError } = await supabase
      .from('tbl_user_notion_tokens')
      .select('access_token, workspace_name')
      .eq('user_id', userId)
      .single();

    if (tokenError || !notionToken) {
      return NextResponse.json(
        { error: 'Notion account not connected. Please connect your Notion account first.' },
        { status: 400 }
      );
    }

    // Initialize Notion client with user's access token
    const notion = new Client({
      auth: notionToken.access_token,
    });

    // Export to workspace root by default
    const parent = { type: 'workspace' as const, workspace: true as const };

    // Notion has a 2000-character limit per rich_text.text.content.
    // Chunk long content safely into multiple paragraph blocks.
    const MAX_TEXT = 1900; // leave headroom below 2000
    const toChunks = (text: string, size = MAX_TEXT) => {
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += size) {
        chunks.push(text.slice(i, i + size));
      }
      return chunks;
    };

    const summaryBlocks = () => {
      const blocks: any[] = [];
      // Split on blank lines first, then hard chunk any long block
      const paragraphs = content.split(/\n{2,}/);
      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;
        if (trimmed.length <= MAX_TEXT) {
          blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: { content: trimmed },
                },
              ],
            },
          });
        } else {
          for (const c of toChunks(trimmed)) {
            blocks.push({
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  {
                    type: 'text',
                    text: { content: c },
                  },
                ],
              },
            });
          }
        }
      }
      return blocks;
    };

    // Parse rich text formatting (bold, italic, code, strikethrough)
    const parseRichText = (text: string) => {
      const richText: any[] = [];
      let currentIndex = 0;
      
      // Regular expressions for common markdown formats
      const patterns = [
        { regex: /\*\*(.*?)\*\*/g, type: 'bold' },
        { regex: /\*(.*?)\*/g, type: 'italic' },
        { regex: /`(.*?)`/g, type: 'code' },
        { regex: /~~(.*?)~~/g, type: 'strikethrough' },
      ];
      
      // Find all matches and sort by position
      const matches: Array<{ start: number; end: number; type: string; content: string }> = [];
      
      patterns.forEach(({ regex, type }) => {
        let match;
        while ((match = regex.exec(text)) !== null) {
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            type,
            content: match[1],
          });
        }
      });
      
      // Sort matches by start position
      matches.sort((a, b) => a.start - b.start);
      
      // Remove overlapping matches (keep the first one)
      const filteredMatches: Array<{ start: number; end: number; type: string; content: string }> = [];
      for (let i = 0; i < matches.length; i++) {
        const current = matches[i];
        const hasOverlap = filteredMatches.some(existing => 
          (current.start < existing.end && current.end > existing.start)
        );
        if (!hasOverlap) {
          filteredMatches.push(current);
        }
      }
      
      // Build rich text array
      for (const match of filteredMatches) {
        // Add text before the match
        if (currentIndex < match.start) {
          const beforeText = text.slice(currentIndex, match.start);
          if (beforeText) {
            richText.push({ type: 'text', text: { content: beforeText } });
          }
        }
        
        // Add the formatted text
        const annotations: any = {};
        if (match.type === 'bold') annotations.bold = true;
        if (match.type === 'italic') annotations.italic = true;
        if (match.type === 'code') annotations.code = true;
        if (match.type === 'strikethrough') annotations.strikethrough = true;
        
        richText.push({
          type: 'text',
          text: { content: match.content },
          annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
        });
        
        currentIndex = match.end;
      }
      
      // Add remaining text
      if (currentIndex < text.length) {
        const remainingText = text.slice(currentIndex);
        if (remainingText) {
          richText.push({ type: 'text', text: { content: remainingText } });
        }
      }
      
      return richText.length > 0 ? richText : [{ type: 'text', text: { content: text } }];
    };

    // Convert markdown to Notion blocks
    const convertMarkdownToBlocks = (text: string) => {
      const blocks: any[] = [];
      const lines = text.split('\n');
      let currentParagraph: string[] = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Handle headings
        if (trimmed.startsWith('### ')) {
          if (currentParagraph.length > 0) {
            blocks.push(...createParagraphBlocks(currentParagraph.join('\n')));
            currentParagraph = [];
          }
          const headingText = trimmed.substring(4);
          blocks.push({
            object: 'block',
            type: 'heading_3',
            heading_3: {
              rich_text: parseRichText(headingText),
            },
          });
        } else if (trimmed.startsWith('## ')) {
          if (currentParagraph.length > 0) {
            blocks.push(...createParagraphBlocks(currentParagraph.join('\n')));
            currentParagraph = [];
          }
          const headingText = trimmed.substring(3);
          blocks.push({
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: parseRichText(headingText),
            },
          });
        } else if (trimmed.startsWith('# ')) {
          if (currentParagraph.length > 0) {
            blocks.push(...createParagraphBlocks(currentParagraph.join('\n')));
            currentParagraph = [];
          }
          const headingText = trimmed.substring(2);
          blocks.push({
            object: 'block',
            type: 'heading_1',
            heading_1: {
              rich_text: parseRichText(headingText),
            },
          });
        } else if (trimmed === '') {
          // Empty line - end current paragraph
          if (currentParagraph.length > 0) {
            blocks.push(...createParagraphBlocks(currentParagraph.join('\n')));
            currentParagraph = [];
          }
        } else {
          currentParagraph.push(line);
        }
      }
      
      // Add remaining paragraph
      if (currentParagraph.length > 0) {
        blocks.push(...createParagraphBlocks(currentParagraph.join('\n')));
      }
      
      return blocks;
    };

    const createParagraphBlocks = (text: string) => {
      const chunks = toChunks(text);
      return chunks.map(chunk => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: parseRichText(chunk),
        },
      }));
    };

    // Format publish date for Notion
    const formatPublishDate = (dateString: string) => {
      if (!dateString) return new Date().toISOString().split('T')[0];
      try {
        return new Date(dateString).toISOString().split('T')[0];
      } catch {
        return new Date().toISOString().split('T')[0];
      }
    };

    // Prepare icon - use episode image if available, fallback to channel image, otherwise use emoji
    const iconImage = episodeImage || channelImage;
    const pageIcon = iconImage ? {
      type: 'external' as const,
      external: {
        url: iconImage
      }
    } : {
      type: 'emoji' as const,
      emoji: '📺' as const
    };

    const response = await notion.pages.create({
      parent,
      icon: pageIcon,
      properties: {
        title: {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        },
      },
      children: [
        // Add metadata as content blocks
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: '📺 Show: ' } },
              { 
                type: 'text', 
                text: { content: podcastName || 'Unknown Show' },
                annotations: { bold: true }
              },
            ],
          },
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: '📄 Content Type: ' } },
              { 
                type: 'text', 
                text: { content: contentType === 'summary' ? 'Summary' : 'Transcript' },
                annotations: { bold: true }
              },
            ],
          },
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: '📅 Publish Date: ' } },
              { 
                type: 'text', 
                text: { content: publishDate ? new Date(publishDate).toLocaleDateString() : new Date().toLocaleDateString() },
                annotations: { bold: true }
              },
            ],
          },
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: '🔗 Link: ' } },
              { 
                type: 'text', 
                text: { 
                  content: episodeUrl || 'https://www.latios.ai',
                  link: { url: episodeUrl || 'https://www.latios.ai' }
                },
                annotations: { bold: true }
              },
            ],
          },
        },
        // Add a divider
        {
          object: 'block',
          type: 'divider',
          divider: {},
        },
        // Add the main content
        ...convertMarkdownToBlocks(content),
      ],
    });

    return NextResponse.json({
      success: true,
      pageId: response.id,
      workspaceName: notionToken.workspace_name,
    });

  } catch (error: any) {
    console.error('Notion export error:', error);
    
    // Handle specific Notion API errors
    if (error.code === 'unauthorized') {
      return NextResponse.json(
        { error: 'Notion access token expired. Please reconnect your Notion account.' },
        { status: 401 }
      );
    }
    
    if (error.code === 'object_not_found') {
      return NextResponse.json(
        { error: 'Notion workspace not found' },
        { status: 404 }
      );
    }

    if (error.code === 'rate_limited') {
      return NextResponse.json(
        { error: 'Rate limited by Notion. Please try again later.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to export to Notion' },
      { status: 500 }
    );
  }
}
