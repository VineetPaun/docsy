// Placeholder notebooks shown on the dashboard when NEXT_PUBLIC_CONVEX_URL is
// absent, so the UI is still explorable without a Convex deployment.
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
