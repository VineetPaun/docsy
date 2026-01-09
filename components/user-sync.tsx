"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";

export function UserSync() {
  const { user, isLoaded } = useUser();
  const upsertUser = useMutation(api.users.upsertUser);

  useEffect(() => {
    if (!isLoaded || !user) return;

    const syncUser = async () => {
      try {
        await upsertUser({
          clerkId: user.id,
          email: user.primaryEmailAddress?.emailAddress ?? "",
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
          imageUrl: user.imageUrl ?? undefined,
        });
      } catch (error) {
        console.error("Failed to sync user:", error);
      }
    };

    syncUser();
  }, [isLoaded, user, upsertUser]);

  return null;
}
