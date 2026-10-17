import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo, type ReactNode } from 'react';

function textOf(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  return (node.children ?? []).map(textOf).join('');
}

const components = {
  // highlight the "Qué debo saber responder" boxes
  blockquote({ node, children }: { node?: any; children?: ReactNode }) {
    const know = /qu[eé] debo saber responder/i.test(textOf(node).slice(0, 80));
    return <blockquote className={know ? 'know' : undefined}>{children}</blockquote>;
  },
  a({ href, children }: { href?: string; children?: ReactNode }) {
    return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
  },
};

export const Markdown = memo(function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components as any}>{children}</ReactMarkdown>
    </div>
  );
});

/** Inline markdown (stems/options) without wrapping <p>. */
export function InlineMd({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <>{children}</> }}>
      {children}
    </ReactMarkdown>
  );
}
