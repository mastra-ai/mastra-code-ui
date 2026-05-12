import { memo, useCallback, useMemo } from "react"
import { Streamdown } from "streamdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import { MermaidBlock } from "./MermaidBlock"
import { CodeBlock } from "./CodeBlock"
import { FileMentionChip, isFileToken } from "./FileMentionChip"

const remarkPlugins = [remarkGfm, remarkBreaks]

const animationConfig = {
	animation: "blurIn" as const,
	duration: 200,
	easing: "ease-out",
}

const reactNodeToString = (node: React.ReactNode): string => {
	if (typeof node === "string") return node
	if (typeof node === "number") return String(node)
	if (Array.isArray(node)) return node.map(reactNodeToString).join("")
	return ""
}

interface MessageMarkdownProps {
	content: string
	streaming: boolean
	onFileClick?: (filePath: string) => void
}

export const MessageMarkdown = memo(
	function MessageMarkdown({
		content,
		streaming,
		onFileClick,
	}: MessageMarkdownProps) {
		const handleAnchorClick = useCallback(
			(e: React.MouseEvent<HTMLAnchorElement>) => {
				const href = e.currentTarget.getAttribute("href")
				if (!href) return
				e.preventDefault()
				window.api.invoke({
					type: "openExternal",
					url: e.currentTarget.href,
				})
			},
			[],
		)

		const markdownComponents = useMemo(
			() => ({
				a: ({
					children,
					href,
					...props
				}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
					<a {...props} href={href} onClick={handleAnchorClick}>
						{children}
					</a>
				),
				pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
				code: ({
					className,
					children,
					...props
				}: React.HTMLAttributes<HTMLElement>) => {
					const lang = /language-(\w+)/.exec(className || "")?.[1]
					const text = reactNodeToString(children).replace(/\n$/, "")
					if (lang === "mermaid") return <MermaidBlock code={text} />
					if (lang) return <CodeBlock code={text} language={lang} />
					if (isFileToken(text)) {
						return (
							<FileMentionChip
								path={text.startsWith("@") ? text.slice(1) : text}
								variant="message"
								onOpen={onFileClick}
							/>
						)
					}
					return (
						<code className={className} {...props}>
							{children}
						</code>
					)
				},
			}),
			[handleAnchorClick, onFileClick],
		)

		return (
			<Streamdown
				mode={streaming ? "streaming" : "static"}
				remarkPlugins={remarkPlugins}
				components={markdownComponents}
				parseIncompleteMarkdown={streaming}
				animated={streaming ? animationConfig : false}
				isAnimating={streaming}
				caret={streaming ? "circle" : undefined}
				controls={false}
			>
				{content}
			</Streamdown>
		)
	},
	(prev, next) =>
		prev.content === next.content &&
		prev.streaming === next.streaming &&
		prev.onFileClick === next.onFileClick,
)
