import { appStorage } from "@/lib/app-storage"
export type AppTheme = "light" | "dark"

export function getInitialTheme(): AppTheme {
  const savedTheme = appStorage.getItem("quick-theme")
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}
