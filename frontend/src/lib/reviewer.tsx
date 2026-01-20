import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Reviewer } from "@/lib/api";

// Who is signed in as the acting steward. A real merge requires one, so the whole app
// needs to know it. Persisted so it survives a refresh.
interface ReviewerCtx {
  reviewers: Reviewer[];
  current?: Reviewer;
  setCurrentId: (id: number) => void;
}

const Ctx = createContext<ReviewerCtx | null>(null);

export function ReviewerProvider({ children }: { children: ReactNode }) {
  const { data: reviewers = [] } = useQuery({ queryKey: ["reviewers"], queryFn: api.reviewers });
  const [currentId, setCurrentId] = useState<number | null>(() => {
    const saved = localStorage.getItem("reviewerId");
    return saved ? Number(saved) : null;
  });

  useEffect(() => {
    if (currentId == null && reviewers.length) setCurrentId(reviewers[0].id);
  }, [reviewers, currentId]);

  useEffect(() => {
    if (currentId != null) localStorage.setItem("reviewerId", String(currentId));
  }, [currentId]);

  const current = reviewers.find((r) => r.id === currentId);
  return <Ctx.Provider value={{ reviewers, current, setCurrentId }}>{children}</Ctx.Provider>;
}

export function useReviewer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useReviewer must be used within ReviewerProvider");
  return ctx;
}
