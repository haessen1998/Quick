package main

import (
	"embed"
	"log"
	"os"

	"github.com/haessen1998/Quick/internal/config"
	"github.com/haessen1998/Quick/internal/files"
	quickmcp "github.com/haessen1998/Quick/internal/mcp"
	"github.com/haessen1998/Quick/internal/navigation"
	"github.com/haessen1998/Quick/internal/network"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	application.RegisterEvent[map[string]any]("files-dropped")
	application.RegisterEvent[string](navigation.NavigationGroupsChangedEvent)
}

func configureQuickRuntime() {
	if os.Getenv("WAILS_MCP_HOST") == "" {
		host := os.Getenv("QUICK_MCP_HOST")
		if host == "" {
			host = "127.0.0.1"
		}
		_ = os.Setenv("WAILS_MCP_HOST", host)
	}
	if os.Getenv("WAILS_MCP_PORT") == "" {
		port := os.Getenv("QUICK_MCP_PORT")
		if port == "" {
			port = "43122"
		}
		_ = os.Setenv("WAILS_MCP_PORT", port)
	}
}

func main() {
	configureQuickRuntime()
	configService := config.NewConfigService()

	app := application.New(application.Options{
		Name:        "Quick",
		Description: "A local-first cross-platform developer toolkit",
		Services: []application.Service{
			application.NewService(&network.NetworkService{}),
			application.NewService(&quickmcp.MCPProxyService{}),
			application.NewService(&quickmcp.MCPStdioService{}),
			application.NewService(configService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})
	app.RegisterService(application.NewService(files.NewFileRenameService(app)))
	app.RegisterService(application.NewService(navigation.NewNavigationService(configService, app)))

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:          "Quick",
		EnableFileDrop: true,
		// Window sized to the golden ratio (1000 / 618 ≈ 1.618).
		Width:  1000,
		Height: 618,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(6, 7, 15),
		URL:              "/",
	})
	window.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		details := event.Context().DropTargetDetails()
		if details == nil || details.ElementID != "file-rename-drop-zone" {
			return
		}
		app.Event.Emit("files-dropped", map[string]any{"files": event.Context().DroppedFiles()})
	})

	err := app.Run()

	if err != nil {
		log.Fatal(err)
	}
}
