"use client";

/**
 * The dashboard's data layer: the notebook list, plus create and delete.
 *
 * Split out of `app/dashboard/page.tsx` (AUDIT.md §6.2), which owned this
 * alongside the header, the create form, the grid and the delete dialog.
 *
 * It carries the mock-data path too: with no Convex configured the app still
 * renders a dashboard so the UI can be looked at (`lib/mock-data.ts`). That
 * branch is why every mutation here has two implementations.
 */

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useConvexAvailable } from "@/components/providers/convex-provider";
import { convexErrorMessage } from "@/lib/convex-error";
import { mockNotebooks } from "@/lib/mock-data";

export interface Notebook {
  _id: string;
  title: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export function useNotebooks() {
  const isConvexAvailable = useConvexAvailable();

  const convexNotebooks = useQuery(
    api.notebooks.getNotebooks,
    isConvexAvailable ? {} : "skip"
  ) as Notebook[] | undefined;

  const createNotebookMutation = useMutation(api.notebooks.createNotebook);
  const deleteNotebookMutation = useMutation(api.notebooks.deleteNotebook);

  const [localNotebooks, setLocalNotebooks] = React.useState<Notebook[]>([]);

  React.useEffect(() => {
    if (!isConvexAvailable) setLocalNotebooks(mockNotebooks as Notebook[]);
  }, [isConvexAvailable]);

  const notebooks = isConvexAvailable ? convexNotebooks : localNotebooks;

  const createNotebook = React.useCallback(
    async (rawTitle: string) => {
      const title = rawTitle.trim();
      if (!title) return false;

      if (!isConvexAvailable) {
        setLocalNotebooks((prev) => [
          {
            _id: `mock-${prev.length + 1}`,
            title,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          ...prev,
        ]);
        return true;
      }

      try {
        await createNotebookMutation({ title });
        return true;
      } catch (error) {
        // The 25-notebook cap arrives as a ConvexError; a generic toast would
        // make a limit the user can act on look like a bug.
        toast.error(convexErrorMessage(error, "Failed to create notebook"));
        return false;
      }
    },
    [createNotebookMutation, isConvexAvailable]
  );

  const deleteNotebook = React.useCallback(
    async (notebookId: string) => {
      if (!isConvexAvailable) {
        setLocalNotebooks((prev) => prev.filter((n) => n._id !== notebookId));
        toast.success("Notebook deleted");
        return;
      }

      try {
        await deleteNotebookMutation({ notebookId: notebookId as never });
        toast.success("Notebook deleted");
      } catch (error) {
        toast.error(convexErrorMessage(error, "Failed to delete notebook"));
      }
    },
    [deleteNotebookMutation, isConvexAvailable]
  );

  return { notebooks, isConvexAvailable, createNotebook, deleteNotebook };
}
