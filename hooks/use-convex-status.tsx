"use client";

import * as React from "react";

// Check if Convex is configured
const isConvexConfigured = !!process.env.NEXT_PUBLIC_CONVEX_URL;

interface ConvexStatusContextType {
  isConfigured: boolean;
  isConnected: boolean;
}

const ConvexStatusContext = React.createContext<ConvexStatusContextType>({
  isConfigured: isConvexConfigured,
  isConnected: false,
});

export function useConvexStatus() {
  return React.useContext(ConvexStatusContext);
}

export function ConvexStatusProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = React.useState(false);

  React.useEffect(() => {
    // If Convex URL is configured, assume connected after mount
    if (isConvexConfigured) {
      setIsConnected(true);
    }
  }, []);

  return (
    <ConvexStatusContext.Provider value={{ isConfigured: isConvexConfigured, isConnected }}>
      {children}
    </ConvexStatusContext.Provider>
  );
}

// Mock data for development without Convex
export const mockNotebooks = [
  {
    _id: "mock-notebook-1",
    title: "Research Notes",
    description: "My research on machine learning",
    createdAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 86400000,
  },
  {
    _id: "mock-notebook-2",
    title: "Project Documentation",
    description: "Documentation for the main project",
    createdAt: Date.now() - 86400000 * 14,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    _id: "mock-notebook-3",
    title: "Meeting Notes",
    description: undefined,
    createdAt: Date.now() - 86400000 * 30,
    updatedAt: Date.now() - 86400000 * 5,
  },
];

export const mockDocuments = [
  {
    _id: "mock-doc-1",
    name: "research-paper.pdf",
    type: "pdf",
    content: "This is sample content from a research paper about machine learning and artificial intelligence. It covers topics like neural networks, deep learning, and natural language processing.",
    createdAt: Date.now() - 86400000 * 3,
  },
  {
    _id: "mock-doc-2",
    name: "notes.txt",
    type: "txt",
    content: "Quick notes from the meeting:\n- Discussed project timeline\n- Reviewed budget\n- Assigned tasks to team members",
    createdAt: Date.now() - 86400000 * 5,
  },
  {
    _id: "mock-doc-3",
    name: "report.docx",
    type: "docx",
    content: "Quarterly report summary with key metrics and achievements.",
    createdAt: Date.now() - 86400000 * 7,
  },
];
