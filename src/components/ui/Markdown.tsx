import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isSafeHttpUrl } from '@/utils/url';

/**
 * Renders user Markdown safely: raw HTML in the source is NOT rendered (react-markdown escapes it
 * by default and no rehype-raw plugin is used), and only http(s)/mailto links are kept.
 * Remote images are not loaded (privacy + CSP); their alt text is shown as a link instead.
 */
function urlTransform(url: string): string {
  const safe = defaultUrlTransform(url);
  if (!safe) return '';
  if (safe.startsWith('mailto:') || safe.startsWith('#')) return safe;
  return isSafeHttpUrl(safe) ? safe : '';
}

const components: Components = {
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ src, alt }) =>
    typeof src === 'string' && src ? (
      <a href={src} target="_blank" rel="noopener noreferrer nofollow">
        [image: {alt || 'link'}]
      </a>
    ) : null,
};

export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose-hub">
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform} components={components} skipHtml>
        {source}
      </ReactMarkdown>
    </div>
  );
}
