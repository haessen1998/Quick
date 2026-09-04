import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { useLanguage } from "@/lib/i18n"
import { useDraftState } from "@/lib/workspace-store"
import { Events } from "@wailsio/runtime"
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react"
import { toast } from "sonner"
import {
  ChooseFolder,
  ExecuteRename,
  InspectFiles,
  ListFiles,
  PreviewRename,
  UndoLastRename,
} from "../../bindings/github.com/haessen1998/Quick/internal/files/filerenameservice"
import type {
  FileInspection,
  RenameFileInfo,
  RenamePlanItem,
  RenamePreview,
  RenameRequest,
} from "../../bindings/github.com/haessen1998/Quick/internal/files/models"

export type RenameRules = Omit<RenameRequest, "paths">

export const initialRules: RenameRules = {
  recursive: false,
  matchMode: "all",
  matchPattern: "*",
  matchFullName: true,
  operation: "reset",
  find: "",
  replacement: "文件",
  useRegex: false,
  prefix: "",
  suffix: "",
  start: 1,
  step: 1,
  width: 3,
  includeExtension: false,
  sortBy: "name",
}

export function requestFor(paths: string[], rules: RenameRules): RenameRequest {
  return { ...rules, paths }
}

export function statusLabel(status: string) {
  if (status === "ready") return "待执行"
  if (status === "conflict") return "冲突"
  if (status === "unchanged") return "无变化"
  return "已跳过"
}

export function remapSourcePaths(paths: string[], items: RenamePlanItem[] | null) {
  const mapping = new Map((items ?? []).filter((item) => item.status === "ready").map((item) => [item.sourcePath, item.targetPath]))
  return paths.map((path) => mapping.get(path) ?? path)
}

function useFileToolsPageModel() {
  const { language, t } = useLanguage()
  const [sourcePaths, setSourcePaths] = useDraftState<string[]>("file-tools", "sourcePaths", [])
  const [files, setFiles] = useDraftState<RenameFileInfo[]>("file-tools", "files", [])
  const [rules, setRules] = useDraftState<RenameRules>("file-tools", "rules", initialRules)
  const [preview, setPreview] = useDraftState<RenamePreview | null>("file-tools", "preview", null)
  const [busy, setBusy] = useDraftState("file-tools", "busy", false)
  const [confirmOpen, setConfirmOpen] = useDraftState("file-tools", "confirmOpen", false)
  const [canUndo, setCanUndo] = useDraftState("file-tools", "canUndo", false)
  const [digestAlgorithm, setDigestAlgorithm] = useDraftState("file-tools", "digestAlgorithm", "SHA-256")
  const [inspections, setInspections] = useDraftState<FileInspection[]>("file-tools", "inspections", [])

  const loadSources = useCallback(
    async (paths: string[], recursive = rules.recursive) => {
      if (!paths.length) return
      setBusy(true)
      try {
        const listed = await ListFiles(paths, recursive)
        setSourcePaths(paths)
        setFiles(listed ?? [])
        setPreview(null)
        setInspections([])
        toast.success(`已读取 ${listed?.length ?? 0} 个文件`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
      } finally {
        setBusy(false)
      }
    },
    [rules.recursive],
  )

  useEffect(
    () =>
      Events.On("files-dropped", (event: any) => {
        const paths = Array.isArray(event?.data?.files) ? event.data.files.map(String) : []
        if (paths.length) void loadSources(paths)
      }),
    [loadSources],
  )

  const chooseFolder = async () => {
    try {
      const path = await ChooseFolder()
      if (path) await loadSources([path])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const runPreview = useCallback(
    async (nextRules = rules) => {
      if (!sourcePaths.length) throw new Error("请先选择文件夹或拖入文件")
      setBusy(true)
      try {
        const result = await PreviewRename(requestFor(sourcePaths, nextRules))
        setPreview(result)
        return result
      } finally {
        setBusy(false)
      }
    },
    [rules, sourcePaths],
  )

  const previewClick = async () => {
    try {
      const result = await runPreview()
      if (result.conflicts) toast.error(`发现 ${result.conflicts} 个冲突`)
      else toast.success(`预览完成，${result.ready} 个文件待重命名`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const execute = async () => {
    setConfirmOpen(false)
    setBusy(true)
    try {
      const result = await ExecuteRename(requestFor(sourcePaths, rules))
      setCanUndo(result.canUndo)
      toast.success(result.message)
      await loadSources(remapSourcePaths(sourcePaths, result.items))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const undo = async () => {
    setBusy(true)
    try {
      const result = await UndoLastRename()
      result.success ? toast.success(result.message) : toast.info(result.message)
      setCanUndo(result.canUndo)
      if (sourcePaths.length) await loadSources(remapSourcePaths(sourcePaths, result.items))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const inspectFiles = useCallback(
    async (algorithm = digestAlgorithm) => {
      if (!sourcePaths.length) throw new Error("请先选择文件夹或拖入文件")
      setBusy(true)
      try {
        const result = await InspectFiles(sourcePaths, rules.recursive, algorithm)
        setDigestAlgorithm(algorithm)
        setInspections(result ?? [])
        toast.success(`已检查 ${result?.length ?? 0} 个文件`)
        return result ?? []
      } finally {
        setBusy(false)
      }
    },
    [digestAlgorithm, rules.recursive, sourcePaths],
  )

  useAssistantCapability({
    page: "file-tools",
    getContext: () => ({
      sourceCount: sourcePaths.length,
      fileCount: files.length,
      rules,
      preview: preview ? { total: preview.total, matched: preview.matched, ready: preview.ready, conflicts: preview.conflicts } : null,
      canUndo,
      inspection: { algorithm: digestAlgorithm, count: inspections.length },
    }),
    actions: {
      prepare: async (values) => {
        const nextRules = { ...rules, ...values } as RenameRules
        delete (nextRules as RenameRules & { paths?: unknown }).paths
        setRules(nextRules)
        if (!sourcePaths.length) return { success: true, executed: false, message: "规则已填写，请由用户选择文件夹或拖入文件后预览" }
        const result = await runPreview(nextRules)
        return { success: true, executed: true, preview: { matched: result.matched, ready: result.ready, conflicts: result.conflicts } }
      },
      execute: async (values) => {
        if (!values.operationAutoApproved)
          return {
            success: false,
            executed: false,
            requiresConfirmation: true,
            message: "批量重命名会修改文件，需要开启操作自动审核或由用户在页面确认",
          }
        const result = await ExecuteRename(requestFor(sourcePaths, rules))
        setCanUndo(result.canUndo)
        await loadSources(remapSourcePaths(sourcePaths, result.items))
        return { success: result.success, executed: true, renamed: result.renamed, canUndo: result.canUndo }
      },
      undo: async (values) => {
        if (!values.operationAutoApproved)
          return {
            success: false,
            executed: false,
            requiresConfirmation: true,
            message: "撤销会再次修改文件，需要开启操作自动审核或由用户在页面确认",
          }
        const result = await UndoLastRename()
        setCanUndo(result.canUndo)
        if (sourcePaths.length) await loadSources(remapSourcePaths(sourcePaths, result.items))
        return { success: result.success, executed: true, renamed: result.renamed }
      },
      inspect: async (values) => {
        if (!sourcePaths.length) return { success: true, executed: false, message: "请由用户选择文件或文件夹；助手不能填写本机路径" }
        const algorithm = ["MD5", "SHA-256", "SHA-512"].includes(String(values.algorithm)) ? String(values.algorithm) : "SHA-256"
        const result = await inspectFiles(algorithm)
        return {
          success: true,
          executed: true,
          algorithm,
          files: result
            .slice(0, 100)
            .map((item) => ({
              name: item.name,
              size: item.size,
              mime: item.mime,
              digest: item.digest,
              width: item.width,
              height: item.height,
              utf8: item.utf8,
              lineEnding: item.lineEnding,
            })),
          truncated: result.length > 100,
        }
      },
    },
  })

  const rootLabel = useMemo(
    () =>
      sourcePaths.length === 1
        ? sourcePaths[0]
        : sourcePaths.length
          ? language === "en-US"
            ? `${sourcePaths.length} paths selected`
            : `已选择 ${sourcePaths.length} 个路径`
          : t("尚未选择文件"),
    [language, sourcePaths, t],
  )

  return {
    language,
    sourcePaths,
    files,
    rules,
    setRules,
    preview,
    busy,
    confirmOpen,
    setConfirmOpen,
    canUndo,
    digestAlgorithm,
    setDigestAlgorithm,
    inspections,
    loadSources,
    chooseFolder,
    previewClick,
    execute,
    undo,
    inspectFiles,
    rootLabel,
  }
}

const ModelContext = createContext<ReturnType<typeof useFileToolsPageModel> | null>(null)
export function FileToolsPageModelProvider(props: { children: ReactNode }) {
  const model = useFileToolsPageModel()
  return <ModelContext.Provider value={model}>{props.children}</ModelContext.Provider>
}
export function useFileToolsPageViewModel() {
  const value = useContext(ModelContext)
  if (!value) throw new Error("FileToolsPageModelProvider missing")
  return value
}
