import { type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({
  children,
  context,
}: {
  children: ReactNode;
  context?: string;
}) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-base)]">
      <Sidebar />
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <Topbar context={context} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
