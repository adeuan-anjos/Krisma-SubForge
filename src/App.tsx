import { useState } from "react";
import { AppSidebar } from "./components/layout/AppSidebar";
import { HomeScreen } from "./components/screens/HomeScreen";
import { ProcessingScreen } from "./components/screens/ProcessingScreen";
import { EditorScreen } from "./components/screens/EditorScreen";
import { HistoryScreen } from "./components/screens/HistoryScreen";
import { SettingsScreen } from "./components/screens/SettingsScreen";
import { BurnSubtitleScreen } from "./components/screens/BurnSubtitleScreen";
import type { AppScreen, ProcessingOptions } from "./lib/types";
import "./index.css";

export default function App() {
  const [screen, setScreen] = useState<AppScreen>("home");
  const [currentVideoPath, setCurrentVideoPath] = useState<string>("");
  const [currentSrtPath, setCurrentSrtPath] = useState<string>("");
  const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>({
    gemini_key: "",
    audio_cleanup_enabled: true,
  });

  function handleNavigate(s: AppScreen) {
    setScreen(s);
  }

  function handleStartProcessing(videoPath: string, options: ProcessingOptions) {
    setCurrentVideoPath(videoPath);
    setProcessingOptions(options);
    setScreen("processing");
  }

  function handleProcessingComplete(srtPath: string) {
    setCurrentSrtPath(srtPath);
    setScreen("editor");
  }

  function handleProcessingCancel() {
    setScreen("home");
  }

  function renderScreen() {
    switch (screen) {
      case "home":
        return (
          <HomeScreen
            onStartProcessing={handleStartProcessing}
            onNavigate={handleNavigate}
          />
        );
      case "processing":
        return (
          <ProcessingScreen
            videoPath={currentVideoPath}
            options={processingOptions}
            onComplete={handleProcessingComplete}
            onCancel={handleProcessingCancel}
          />
        );
      case "editor":
        return (
          <EditorScreen
            videoPath={currentVideoPath}
            srtPath={currentSrtPath}
            onNavigate={handleNavigate}
          />
        );
      case "history":
        return (
          <HistoryScreen
            onNavigate={handleNavigate}
            onOpenSrt={(srtPath, videoPath) => {
              setCurrentSrtPath(srtPath);
              setCurrentVideoPath(videoPath);
              setScreen("editor");
            }}
          />
        );
      case "settings":
        return <SettingsScreen onNavigate={handleNavigate} />;
      case "burn":
        return <BurnSubtitleScreen onNavigate={handleNavigate} />;
      default:
        return null;
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <AppSidebar current={screen} onNavigate={handleNavigate} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {renderScreen()}
      </main>
    </div>
  );
}
