import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ReviewerProvider } from "@/lib/reviewer";
import Audit from "@/screens/Audit";
import Dashboard from "@/screens/Dashboard";
import Sandbox from "@/screens/Sandbox";
import Search from "@/screens/Search";
import Workspace from "@/screens/Workspace";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 10_000 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ReviewerProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/queue" element={<Workspace />} />
              <Route path="/search" element={<Search />} />
              <Route path="/sandbox" element={<Sandbox />} />
              <Route path="/audit" element={<Audit />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="bottom-right" toastOptions={{ style: { borderRadius: "10px" } }} />
      </ReviewerProvider>
    </QueryClientProvider>
  </StrictMode>,
);
