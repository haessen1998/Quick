import Ajv from "ajv"
import { PAGE_LABELS, type PageId } from "./pages"
import { TOOL_INPUT_SCHEMAS } from "./tool-catalog"

const ajv = new Ajv({ allErrors: true, strict: false })
export function toolDefinition(page: PageId, action: string) {
  const source = TOOL_INPUT_SCHEMAS[page as keyof typeof TOOL_INPUT_SCHEMAS]
  const needsInput = Boolean(source && "required" in source && (source.required as string[]).includes("input"))
  const inputSchema = source
    ? {
        ...source,
        properties: { ...source.properties, sourceResultId: { type: "string", description: "本次会话的完整本地结果 ID，替代 input" } },
        required:
          "required" in source ? source.required.filter((name) => name !== "input" && !(name === "action" && ["file-tools", "navigation"].includes(page))) : [],
        ...(needsInput ? {anyOf: [{required: ["input"]}, {required: ["sourceResultId"]}]} : {}),
      }
    : { type: "object", properties: {}, additionalProperties: false, required: [] }
  return {
    id: `${page}.${action}`,
    page,
    action,
    label: PAGE_LABELS[page],
    inputSchema,
    permissions: "每次执行根据 page/action/operation 检查；有副作用默认逐次确认",
  }
}
const validators = new Map<string, ReturnType<typeof ajv.compile>>()
export function validateToolInput(page: PageId, action: string, input: Record<string, unknown>) {
  const key = `${page}.${action}`
  let validate = validators.get(key)
  if (!validate) {
    validate = ajv.compile(toolDefinition(page, action).inputSchema)
    validators.set(key, validate)
  }
  // Approval is always derived by the execution layer, never trusted from callers.
  const { operationAutoApproved: _ignored, ...value } = input
  if (!validate(value)) throw new Error(`工具参数不合法：${ajv.errorsText(validate.errors)}`)
  return value
}
