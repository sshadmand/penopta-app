"use client";

import { Toaster } from "sonner";

import { useTheme } from "@/components/ThemeProvider";

export function AppToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster richColors theme={resolved} position="top-center" closeButton />
  );
}
