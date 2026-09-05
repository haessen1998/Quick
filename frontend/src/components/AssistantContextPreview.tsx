import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { uiText } from "@/lib/i18n"

export function AssistantContextPreview({ context }: { context: unknown }) {
  return (
    <Accordion type="single" collapsible className="mb-3 min-w-0 rounded-lg border bg-muted/20 p-1">
      <AccordionItem value="context">
        <AccordionTrigger className="text-xs">{uiText("可供小Q读取的页面上下文")}</AccordionTrigger>
        <AccordionContent className="px-2.5 pb-2.5">
          <p className="mb-3 text-xs leading-5 text-muted-foreground">
            {uiText("仅在小Q调用上下文工具时发送；密钥等字段已过滤。自由文本仍可能含私人内容，请先检查。")}
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-3 text-xs leading-5">
            {JSON.stringify(context, null, 2)}
          </pre>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
