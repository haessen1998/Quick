import type { ProxySettings } from "@/lib/proxy"
import type { MCPServerProfile } from "@/lib/saved-connections"
import type { ReactNode } from "react"
import { CryptoPageModelProvider } from "./CryptoPageModel"
import { DataConversionPageModelProvider } from "./DataConversionPageModel"
import { FileToolsPageModelProvider } from "./FileToolsPageModel"
import { FormatterModelProvider } from "./FormatterModel"
import { FrontendToolsPageModelProvider } from "./FrontendToolsPageModel"
import { MCPInspectorPageModelProvider } from "./MCPInspectorPageModel"
import { NavigationPageModelProvider } from "./NavigationPageModel"
import { NetworkPageModelProvider } from "./NetworkPageModel"
import { TextWorkbenchPageModelProvider } from "./TextWorkbenchPageModel"
import { TimeIdentifiersPageModelProvider } from "./TimeIdentifiersPageModel"
import { ValidationPageModelProvider } from "./ValidationPageModel"

/** Headless application models. No page view is mounted to execute a tool. */
export function ToolModels({
  children,
  proxy,
  profiles,
  onSaveProfile,
}: {
  children: ReactNode
  proxy: ProxySettings
  profiles: MCPServerProfile[]
  onSaveProfile: (profile: MCPServerProfile) => void
}) {
  return (
    <FormatterModelProvider>
      <DataConversionPageModelProvider>
        <TimeIdentifiersPageModelProvider>
          <ValidationPageModelProvider>
            <FrontendToolsPageModelProvider>
              <CryptoPageModelProvider>
                <NetworkPageModelProvider proxy={proxy}>
                  <TextWorkbenchPageModelProvider>
                    <FileToolsPageModelProvider>
                      <NavigationPageModelProvider>
                        <MCPInspectorPageModelProvider proxy={proxy} profiles={profiles} onSaveProfile={onSaveProfile}>
                          {children}
                        </MCPInspectorPageModelProvider>
                      </NavigationPageModelProvider>
                    </FileToolsPageModelProvider>
                  </TextWorkbenchPageModelProvider>
                </NetworkPageModelProvider>
              </CryptoPageModelProvider>
            </FrontendToolsPageModelProvider>
          </ValidationPageModelProvider>
        </TimeIdentifiersPageModelProvider>
      </DataConversionPageModelProvider>
    </FormatterModelProvider>
  )
}
