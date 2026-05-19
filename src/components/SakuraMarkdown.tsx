import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChartBlock } from "./ChartBlock";

export function SakuraMarkdown({ children }: { children: string }) {
  return (
    <div className="sakura-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const text = String(children).replace(/\n$/, "");
            if (className === "language-chart") {
              try {
                const spec = JSON.parse(text);
                return <ChartBlock spec={spec} />;
              } catch {
                return <pre><code>{text}</code></pre>;
              }
            }
            return <code className={className} {...props}>{children}</code>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
