"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, createContext, useContext } from "react";

// Handle missing URL gracefully during build
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

// Create client only if URL is available
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

// Context to check if Convex is available
const ConvexAvailableContext = createContext<boolean>(!!convex);

export function useConvexAvailable() {
  return useContext(ConvexAvailableContext);
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  // If no Convex URL is configured, render children without Convex
  if (!convex) {
    return (
      <ConvexAvailableContext.Provider value={false}>
        {children}
      </ConvexAvailableContext.Provider>
    );
  }

  return (
    <ConvexAvailableContext.Provider value={true}>
      <ConvexProvider client={convex}>{children}</ConvexProvider>
    </ConvexAvailableContext.Provider>
  );
}
