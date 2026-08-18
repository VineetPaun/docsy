"use client";

/**
 * Rename a source (AUDIT.md §9.6).
 *
 * A source is named by its filename, so a notebook of scans reads as
 * "scan_0043.pdf" — and that name is what the citation chips and the model see.
 *
 * Built on the shadcn `Dialog`, so focus trapping, Escape and the backdrop come
 * from Radix rather than from a hand-rolled overlay (the mistake §9.4 records).
 */

import * as React from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { convexErrorMessage } from "@/lib/convex-error";
import type { SourceDocument } from "./types";

interface RenameSourceDialogProps {
  /** The source being renamed; `null` closes the dialog. */
  source: SourceDocument | null;
  onClose: () => void;
}

export function RenameSourceDialog({
  source,
  onClose,
}: RenameSourceDialogProps) {
  const [name, setName] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const renameDocument = useMutation(api.documents.renameDocument);

  // Reset to the current name each time a different source is opened.
  React.useEffect(() => {
    setName(source?.name ?? "");
  }, [source]);

  const handleSave = async () => {
    if (!source || !name.trim() || isSaving) return;

    setIsSaving(true);
    try {
      await renameDocument({
        documentId: source._id as never,
        name: name.trim(),
      });
      toast.success("Source renamed");
      onClose();
    } catch (error) {
      toast.error(convexErrorMessage(error, "Could not rename this source"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={source !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename source</DialogTitle>
          <DialogDescription>
            This is the name shown in the source list and in citations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="source-name">Name</Label>
          <Input
            id="source-name"
            value={name}
            autoFocus
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
