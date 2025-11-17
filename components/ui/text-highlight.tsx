import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Share2, Copy, Image, Download } from "lucide-react"
import { toast } from "./use-toast"
import html2canvas from "html2canvas"
import Markdown from "react-markdown"
import { renderToString } from "react-dom/server"
import remarkGfm from 'remark-gfm'
import ReactDOMServer from 'react-dom/server'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "./tooltip"
import { trackContentInteraction, trackError } from '@/lib/analytics'
import { useAuth } from '@/lib/auth'

// Declare global mouse position variables
declare global {
  interface Window {
    mouseX: number;
    mouseY: number;
  }
}

interface TextHighlightProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  podcastName?: string
  episodeTitle?: string
  contentType?: 'summary' | 'transcript' | 'episode'
}

export function TextHighlight({ 
  children, 
  className, 
  podcastName = "Unknown Podcast",
  episodeTitle = "Unknown Episode",
  contentType = 'episode',
  ...props 
}: TextHighlightProps) {
  const auth = useAuth()
  const userName = auth?.user?.user_metadata?.full_name || auth?.user?.user_metadata?.name || 'Guest'
  const userEmail = auth?.user?.email || ''
  const userId = auth?.user?.id || null

  const [geo, setGeo] = React.useState<{ country_name: string; city: string; ip: string } | null>(null)

  React.useEffect(() => {
    // Fetch geo info once for notifications
    fetch('/api/geo')
      .then(r => r.ok ? r.json() : null)
      .then(data => setGeo(data))
      .catch(() => setGeo(null))
  }, [])

  function computeWordCount(text: string): number {
    const englishWords = text.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g) || []
    const cjkChars = text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g) || []
    return englishWords.length + cjkChars.length
  }
  const [selection, setSelection] = React.useState<{
    text: string
    html: string
    rect: DOMRect
    mouseX: number
    mouseY: number
  } | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const toolbarRef = React.useRef<HTMLDivElement>(null)

  const handleSelection = React.useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) {
      setSelection(null)
      return
    }

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const container = containerRef.current

    // Only allow selection within the component's container
    if (!container) {
      setSelection(null)
      return
    }

    const { anchorNode, focusNode } = selection
    const isInside = (node: Node | null) => !!node && container.contains(node)
    if (!isInside(anchorNode) || !isInside(focusNode)) {
      setSelection(null)
      return
    }
    
    // Get the selected HTML content
    const fragment = range.cloneContents()
    const tempDiv = document.createElement('div')
    tempDiv.appendChild(fragment)
    const htmlContent = tempDiv.innerHTML
    
    // Get the plain text for fallback
    const text = selection.toString()

    if (text) {
      setSelection({
        text,
        html: htmlContent,
        rect,
        // Use viewport coordinates from the selection rect. Do NOT add scroll offsets when using fixed positioning
        mouseX: rect.left + rect.width / 2,
        mouseY: rect.bottom,
      })
    }
  }, [])

  // Track mouse position
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      window.mouseX = e.clientX
      window.mouseY = e.clientY
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const handleClickOutside = React.useCallback((event: MouseEvent) => {
    if (
      containerRef.current &&
      !containerRef.current.contains(event.target as Node) &&
      toolbarRef.current &&
      !toolbarRef.current.contains(event.target as Node)
    ) {
      setSelection(null)
    }
  }, [])

  const handleCopy = React.useCallback(async () => {
    if (!selection?.text) return

    try {
      // Create a temporary div to hold the HTML content
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = selection.html
      
      // Create a Blob with the HTML content
      const blob = new Blob([tempDiv.innerHTML], { type: 'text/html' })
      
      // Create a ClipboardItem with both text and HTML
      const item = new ClipboardItem({
        'text/plain': new Blob([selection.text], { type: 'text/plain' }),
        'text/html': blob
      })
      
      await navigator.clipboard.write([item])
      toast({
        title: "Copied to clipboard",
        description: "The selected text has been copied to your clipboard.",
      })
      // Vercel Analytics
      try {
        trackContentInteraction('copy', contentType)
      } catch (e: any) {
        trackError('highlight_copy_track', e?.message || 'unknown')
      }
      setSelection(null)
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Failed to copy the selected text.",
        //variant: "destructive",
      })
      trackError('highlight_copy_text', (err as any)?.message || 'unknown')
    }
  }, [selection, contentType, podcastName, episodeTitle, userName, userEmail, geo])

  // Shared helper to render selected HTML into a canvas
  const renderHighlightCanvas = React.useCallback(async (html: string) => {
    const tempDiv = document.createElement("div")
    tempDiv.style.position = "fixed"
    tempDiv.style.left = "0"
    tempDiv.style.top = "0"
    tempDiv.style.padding = "24px"
    tempDiv.style.background = "white"
    tempDiv.style.borderRadius = "12px"
    tempDiv.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)"
    tempDiv.style.fontSize = "16px"
    tempDiv.style.lineHeight = "1.6"
    tempDiv.style.color = "#333"
    tempDiv.style.maxWidth = "600px"
    tempDiv.style.width = "auto"
    tempDiv.style.whiteSpace = "pre-wrap"
    tempDiv.style.wordBreak = "break-word"
    tempDiv.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    tempDiv.style.border = "1px solid #eaeaea"
    tempDiv.style.transform = "translateX(-9999px)"
    tempDiv.style.pointerEvents = "none"
    tempDiv.style.zIndex = "-1"
    // Improve text rendering
    tempDiv.style.setProperty('-webkit-font-smoothing', 'antialiased')
    tempDiv.style.setProperty('-moz-osx-font-smoothing', 'grayscale')
    tempDiv.style.setProperty('text-rendering', 'optimizeLegibility')

    const quoteMark = document.createElement("div")
    quoteMark.style.position = "absolute"
    quoteMark.style.top = "12px"
    quoteMark.style.left = "12px"
    quoteMark.style.fontSize = "24px"
    quoteMark.style.color = "#eaeaea"
    quoteMark.style.fontFamily = "Georgia, serif"
    quoteMark.style.zIndex = "1"
    quoteMark.textContent = "\u201C"
    tempDiv.appendChild(quoteMark)

    const textContent = document.createElement("div")
    textContent.style.paddingLeft = "24px"
    textContent.style.position = "relative"
    textContent.style.zIndex = "1"

    const contentContainer = document.createElement("div")
    contentContainer.className = "markdown-content"
    contentContainer.innerHTML = html
    textContent.appendChild(contentContainer)

    const markdownStyle = document.createElement('style')
    markdownStyle.textContent = `
      .markdown-content {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        white-space: pre-wrap;
        word-wrap: break-word;
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        font-kerning: normal;
      }
      .markdown-content h1,
      .markdown-content h2,
      .markdown-content h3,
      .markdown-content h4,
      .markdown-content h5,
      .markdown-content h6 {
        margin-top: 24px;
        margin-bottom: 16px;
        font-weight: 600;
        line-height: 1.25;
      }
      .markdown-content h1 { font-size: 2em; }
      .markdown-content h2 { font-size: 1.5em; }
      .markdown-content h3 { font-size: 1.25em; }
      .markdown-content p { margin-bottom: 16px; }
      .markdown-content code {
        padding: 0.2em 0.4em;
        margin: 0;
        font-size: 85%;
        background-color: rgba(27,31,35,0.05);
        border-radius: 3px;
        font-family: "SFMono-Regular",Consolas,"Liberation Mono",Menlo,Courier,monospace;
      }
      .markdown-content pre {
        padding: 16px;
        overflow: auto;
        font-size: 85%;
        line-height: 1.45;
        background-color: #f6f8fa;
        border-radius: 3px;
        margin-bottom: 16px;
      }
      .markdown-content pre code {
        padding: 0;
        margin: 0;
        background-color: transparent;
        border: 0;
        word-break: normal;
        white-space: pre;
      }
      .markdown-content blockquote {
        padding: 0 1em;
        color: #6a737d;
        border-left: 0.25em solid #dfe2e5;
        margin: 0 0 16px 0;
      }
      .markdown-content ul,
      .markdown-content ol {
        padding-left: 2em;
        margin-bottom: 16px;
      }
      .markdown-content li {
        margin-bottom: 0.25em;
      }
      .markdown-content a {
        color: #0366d6;
        text-decoration: none;
      }
      .markdown-content a:hover {
        text-decoration: underline;
      }
      .markdown-content strong {
        font-weight: 600;
      }
      .markdown-content em {
        font-style: italic;
      }
    `
    document.head.appendChild(markdownStyle)

    tempDiv.appendChild(textContent)

    const sourceInfo = document.createElement("div")
    sourceInfo.className = "source-info"
    sourceInfo.style.cssText = `
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #eaeaea;
      font-size: 14px;
      color: #666;
      font-style: italic;
      width: 100%;
      display: block;
      position: relative;
      z-index: 1;
    `
    sourceInfo.innerHTML = `From <strong style="font-weight: 700; color: #333;">${podcastName || "Unknown Podcast"}</strong> - ${episodeTitle || "Unknown Episode"}`
    tempDiv.appendChild(sourceInfo)

    const watermark = document.createElement("div")
    watermark.className = "watermark"
    watermark.style.cssText = `
      position: absolute;
      bottom: 12px;
      right: 12px;
      font-size: 14px;
      color: rgba(0, 0, 0, 0.3);
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      pointer-events: none;
      user-select: none;
      z-index: 2;
      text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);
    `
    watermark.textContent = "Latios AI"
    tempDiv.appendChild(watermark)

    document.body.appendChild(tempDiv)

    try {
      // Use higher scale for sharper output, respecting devicePixelRatio and capping for performance
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
      const scale = Math.max(2, Math.min(4, dpr * 2))
      const canvas = await html2canvas(tempDiv, {
        scale,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
        allowTaint: true,
        foreignObjectRendering: true,
        removeContainer: false,
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.body.lastChild as HTMLElement
          if (clonedElement) {
            clonedElement.style.transform = "none"
            clonedElement.style.visibility = "visible"
            clonedElement.style.opacity = "1"
            clonedElement.style.position = "absolute"
            clonedElement.style.left = "0"
            clonedElement.style.top = "0"
            clonedElement.style.zIndex = "9999"
          }
        }
      })
      return canvas
    } finally {
      document.body.removeChild(tempDiv)
      document.head.removeChild(markdownStyle)
    }
  }, [podcastName, episodeTitle])

  const handleCopyImage = React.useCallback(async () => {
    if (!selection?.text || !containerRef.current) return

    try {
      const canvas = await renderHighlightCanvas(selection.html)

      // Convert canvas to blob and copy to clipboard
      canvas.toBlob((blob: Blob | null) => {
        if (!blob) return

        const item = new ClipboardItem({ 'image/png': blob })
        navigator.clipboard.write([item]).then(() => {
          toast({
            title: "Image copied",
            description: "The highlight has been copied to your clipboard.",
          })
          // Vercel Analytics
          try {
            trackContentInteraction('share', contentType)
          } catch (e: any) {
            trackError('highlight_copy_image_track', e?.message || 'unknown')
          }
          setSelection(null)
        }).catch(() => {
          toast({
            title: "Failed to copy",
            description: "Failed to copy the highlight image.",
            //variant: "destructive",
          })
        })
      }, "image/png", 1.0)
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Failed to create the highlight image.",
        //variant: "destructive",
      })
      trackError('highlight_copy_image', (err as any)?.message || 'unknown')
    }
  }, [selection, renderHighlightCanvas, userName, userEmail, geo])

  const handleShare = React.useCallback(async () => {
    if (!selection?.text || !containerRef.current) return

    try {
      const canvas = await renderHighlightCanvas(selection.html)

      // Convert canvas to blob
      canvas.toBlob((blob: Blob | null) => {
        if (!blob) return

        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "highlight.png"
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast({
          title: "Image saved",
          description: "The highlight has been saved as an image.",
        })
        // Vercel Analytics
        try {
          trackContentInteraction('share', contentType)
        } catch (e: any) {
          trackError('highlight_share_track', e?.message || 'unknown')
        }
        setSelection(null)
      }, "image/png", 1.0)
    } catch (err) {
      toast({
        title: "Failed to share",
        description: "Failed to create the highlight image.",
        //variant: "destructive",
      })
      trackError('highlight_share', (err as any)?.message || 'unknown')
    }
  }, [selection, renderHighlightCanvas])

  React.useEffect(() => {
    const handleMouseUp = () => {
      handleSelection()
    }

    document.addEventListener("mouseup", handleMouseUp)
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mouseup", handleMouseUp)
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [handleSelection, handleClickOutside])

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      {...props}
    >
      {children}
      {selection && (
        <TooltipProvider>
          <div
            ref={toolbarRef}
            className="fixed z-50 flex gap-2 p-2 bg-white rounded-lg shadow-lg"
            style={{
              position: 'fixed',
              top: `${selection.mouseY + 8}px`,
              left: `${selection.mouseX + 8}px`,
              transform: 'translateY(-50%)',
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  className="h-8 w-8"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Copy text</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyImage}
                  className="h-8 w-8"
                >
                  <Image className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Copy image</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleShare}
                  className="h-8 w-8"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Save image</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      )}
    </div>
  )
} 