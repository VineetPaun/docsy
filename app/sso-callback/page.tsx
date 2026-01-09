"use client";

import * as React from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";

export default function SSOCallbackPage() {
  const { handleRedirectCallback } = useClerk();
  const router = useRouter();
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const handleCallback = async () => {
      try {
        await handleRedirectCallback({
          afterSignInUrl: "/dashboard",
          afterSignUpUrl: "/dashboard",
        });
      } catch (err: unknown) {
        const error = err as { errors?: { message: string }[] };
        setError(error.errors?.[0]?.message || "Authentication failed");
        // Redirect to sign-in after a delay
        setTimeout(() => {
          router.push("/sign-in");
        }, 3000);
      }
    };

    handleCallback();
  }, [handleRedirectCallback, router]);

  if (error) {
    return (
      <AuthLayout
        title="Authentication failed"
        description="There was a problem signing you in"
      >
        <div className="space-y-6 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-destructive/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-8 text-destructive"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">{error}</p>
          <p className="text-sm text-muted-foreground">
            Redirecting you back to sign in...
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Completing sign in"
      description="Please wait while we authenticate you"
    >
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-16 items-center justify-center">
          <svg
            className="size-8 animate-spin text-muted-foreground"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">
          This should only take a moment...
        </p>
      </div>
    </AuthLayout>
  );
}
