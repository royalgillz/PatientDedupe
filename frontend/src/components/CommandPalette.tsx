import { Command } from "cmdk";
import { FlaskConical, Inbox, LayoutDashboard, ScrollText, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const ITEMS = [
  { label: "Go to Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Go to Review queue", to: "/queue", icon: Inbox },
  { label: "Go to Search", to: "/search", icon: Search },
  { label: "Go to Sandbox", to: "/sandbox", icon: FlaskConical },
  { label: "Go to Audit log", to: "/audit", icon: ScrollText },
];

// A Cmd/Ctrl+K command palette for keyboard-first navigation, the way Linear, Vercel, and
// Raycast work. Opens from anywhere; filtering and arrow keys are handled by cmdk.
//
// @spec CONSOLE-011
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-[90] bg-[rgba(27,31,35,0.4)] backdrop-blur-[1px]"
      contentClassName="fixed left-1/2 top-[18%] z-[100] w-[min(560px,92vw)] -translate-x-1/2"
      className="overflow-hidden rounded-xl border bg-surface shadow-2xl"
    >
      <Command.Input
        placeholder="Jump to..."
        className="w-full border-b bg-transparent px-4 py-3.5 text-[14px] text-ink outline-none placeholder:text-ink-3"
      />
      <Command.List className="max-h-[320px] overflow-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-[13px] text-ink-3">No matches.</Command.Empty>
        <Command.Group heading="Navigate" className="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
          {ITEMS.map((it) => (
            <Command.Item
              key={it.to}
              value={it.label}
              onSelect={() => {
                navigate(it.to);
                setOpen(false);
              }}
              className="mt-0.5 flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] text-ink-2 data-[selected=true]:bg-brand-subtle data-[selected=true]:text-brand-ink"
            >
              <it.icon className="size-4" /> {it.label}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
