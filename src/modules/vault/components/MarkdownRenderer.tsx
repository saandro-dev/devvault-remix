import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none
      prose-headings:text-foreground prose-p:text-foreground/90
      prose-a:text-primary prose-strong:text-foreground
      prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded
      prose-pre:bg-muted prose-pre:border prose-pre:border-border
      prose-li:text-foreground/90
      prose-blockquote:border-primary/50 prose-blockquote:text-muted-foreground
      ${className ?? ""}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
