"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
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

  // ConvexProviderWithClerk — not plain ConvexProvider — is what attaches the
  // Clerk JWT to every query and mutation. Without it `ctx.auth` is always
  // empty in convex/ and every function reads as anonymous.
  return (
    <ConvexAvailableContext.Provider value={true}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ConvexAvailableContext.Provider>
  );
}
