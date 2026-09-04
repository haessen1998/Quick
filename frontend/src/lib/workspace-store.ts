import { useCallback, useSyncExternalStore, type Dispatch, type SetStateAction } from "react"

export type WorkspaceDocument = { id: string; title: string }
const values = new Map<string, unknown>()
const listeners = new Set<() => void>()
const documents = new Map<string, WorkspaceDocument[]>()
const selected = new Map<string, string>()
const documentSequence = new Map<string, number>()
const closed = new Map<string, { document: WorkspaceDocument; fields: [string, unknown][] }>()
let revision = 0
const notify = () => {
  revision++
  listeners.forEach((listener) => listener())
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function getWorkspaceDocuments(scope: string): WorkspaceDocument[] {
  if (!documents.has(scope)) documents.set(scope, [{ id: "default", title: "文档 1" }])
  return documents.get(scope)!
}
export function getActiveDocument(scope: string): string {
  return selected.get(scope) ?? "default"
}
export function useWorkspaceDocuments(scope: string) {
  useSyncExternalStore(subscribe, () => revision)
  return { documents: getWorkspaceDocuments(scope), selected: getActiveDocument(scope) }
}
export function selectWorkspaceDocument(scope: string, id: string) {
  if (!getWorkspaceDocuments(scope).some((doc) => doc.id === id)) return
  selected.set(scope, id)
  notify()
}
export function addWorkspaceDocument(scope: string) {
  const current = getWorkspaceDocuments(scope)
  if (current.length >= 12) throw new Error("每个工具最多保留 12 个文档，请先关闭不需要的文档")
  const number = (documentSequence.get(scope) ?? 1) + 1
  documentSequence.set(scope, number)
  const doc = { id: crypto.randomUUID(), title: `文档 ${number}` }
  documents.set(scope, [...current, doc])
  selected.set(scope, doc.id)
  notify()
}
export function closeWorkspaceDocument(scope: string, id: string) {
  const current = getWorkspaceDocuments(scope)
  if (current.length <= 1) return
  const document = current.find((doc) => doc.id === id)
  if (!document) return
  closed.set(scope, { document, fields: [...values].filter(([key]) => key.startsWith(`${scope}/${id}/`)) })
  documents.set(
    scope,
    current.filter((doc) => doc.id !== id),
  )
  if (getActiveDocument(scope) === id) selected.set(scope, documents.get(scope)![0].id)
  for (const key of values.keys()) if (key.startsWith(`${scope}/${id}/`)) values.delete(key)
  notify()
}
export function restoreWorkspaceDocument(scope: string) {
  const entry = closed.get(scope)
  if (!entry || getWorkspaceDocuments(scope).length >= 12) return
  documents.set(scope, [...getWorkspaceDocuments(scope), entry.document])
  for (const [key, value] of entry.fields) values.set(key, value)
  selected.set(scope, entry.document.id)
  closed.delete(scope)
  notify()
}
/** ViewModels own data independently from the lifetime of page components. */
export function useDraftState<T>(scope: string, field: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const document = useSyncExternalStore(subscribe, () => getActiveDocument(scope))
  const key = `${scope}/${document}/${field}`
  if (!values.has(key)) values.set(key, typeof initial === "function" ? (initial as () => T)() : initial)
  const value = useSyncExternalStore(subscribe, () => values.get(key) as T)
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      if (!getWorkspaceDocuments(scope).some((doc) => doc.id === document)) return
      const previous = values.get(key) as T
      const updated = typeof next === "function" ? (next as (value: T) => T)(previous) : next
      if (Object.is(previous, updated)) return
      values.set(key, updated)
      notify()
    },
    [key],
  )
  return [value, setValue]
}

export function readWorkspaceFields(scope: string): Record<string, unknown> {
  const prefix = `${scope}/${getActiveDocument(scope)}/`
  return Object.fromEntries([...values].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]))
}

export function updateWorkspaceFields(scope: string, fields: Record<string, unknown>) {
  const prefix = `${scope}/${getActiveDocument(scope)}/`
  for (const [field, value] of Object.entries(fields)) values.set(prefix + field, value)
  notify()
}
