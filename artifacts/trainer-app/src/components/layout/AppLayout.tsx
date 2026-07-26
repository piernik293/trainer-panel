import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto print-container">
        <div className="max-w-6xl mx-auto p-4 md:p-8 print-container">
          {children}
        </div>
      </main>
    </div>
  );
}
