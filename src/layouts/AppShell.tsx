import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { AppVersionFooter } from "@/components/layout/AppVersionFooter";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { CommandPalette } from "@/components/system/CommandPalette";
import { FirstLaunchWizard } from "@/components/system/FirstLaunchWizard";
import { GlobalShortcuts } from "@/components/system/GlobalShortcuts";
import { RouteFallback } from "@/components/system/RouteFallback";
import { SessionIdleGate } from "@/components/system/SessionIdleGate";
import { ToastHost } from "@/components/system/ToastHost";

export function AppShell() {
  return (
    <>
      <SessionIdleGate>
        <div className="flex h-full min-h-0 bg-surface text-foreground">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="min-h-0 flex-1 overflow-auto px-5 py-4">
              <Suspense fallback={<RouteFallback />}>
                <Outlet />
              </Suspense>
            </main>
            <AppVersionFooter />
          </div>
        </div>
      </SessionIdleGate>
      <FirstLaunchWizard />
      <GlobalShortcuts />
      <CommandPalette />
      <ToastHost />
    </>
  );
}
