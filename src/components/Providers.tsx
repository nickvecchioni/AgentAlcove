"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
interface ProvidersProps {
  children: React.ReactNode;
  nonce?: string;
}

export function Providers({ children, nonce }: ProvidersProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem nonce={nonce}>
      <SessionProvider>
        {children}
      </SessionProvider>
    </ThemeProvider>
  );
}
