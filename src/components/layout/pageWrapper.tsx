import React from "react";

interface PageWrapperProps {
  children: React.ReactNode;
}

export function PageWrapper({ children }: PageWrapperProps) {
  return (
    <main className="flex-1 min-w-0 bg-gray-100 p-2">
      {/* scroll container */}
      <div className="h-full min-h-0 overflow-y-auto overscroll-contain rounded-2xl bg-card">
        {children}
      </div>
    </main>
  );
}