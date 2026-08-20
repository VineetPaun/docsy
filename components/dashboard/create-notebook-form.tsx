"use client";

/**
 * The inline "new notebook" form.
 *
 * Stacks below `sm`: three controls in a row put the title field at ~100px on a
 * phone (AUDIT.md §9.1).
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface CreateNotebookFormProps {
  onCreate: (title: string) => Promise<boolean>;
  onCancel: () => void;
}

export function CreateNotebookForm({
  onCreate,
  onCancel,
}: CreateNotebookFormProps) {
  const [title, setTitle] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const submit = async () => {
    if (!title.trim() || isSaving) return;

    setIsSaving(true);
    const created = await onCreate(title);
    setIsSaving(false);

    // Left open on failure, with what was typed still in it — the cap message
    // is useless next to an empty form.
    if (created) setTitle("");
  };

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Input
            type="text"
            placeholder="Notebook title..."
            value={title}
            autoFocus
            aria-label="Notebook title"
            className="flex-1"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
          />
          <div className="flex gap-2">
            <Button
              onClick={submit}
              disabled={!title.trim() || isSaving}
              className="flex-1 sm:flex-none"
            >
              {isSaving ? "Creating..." : "Create"}
            </Button>
            <Button
              variant="outline"
              onClick={onCancel}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
