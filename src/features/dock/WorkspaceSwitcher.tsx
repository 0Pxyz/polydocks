import { useState, useRef, useEffect } from "react";
import { Briefcase, CaretDown, Check, Plus, Folder } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { useWorkspaceStore } from "@/lib/store/useWorkspaceStore";
import { cn } from "@/lib/cn";

interface WorkspaceSwitcherProps {
  className?: string;
}

export function WorkspaceSwitcher({ className }: WorkspaceSwitcherProps) {
  const {
    workspaces,
    activeWorkspaceId,
    fetchWorkspaces,
    setActiveWorkspace,
    createWorkspace,
  } = useWorkspaceStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus();
    }
  }, [isCreating]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setIsCreating(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId) || {
    id: "default",
    name: "Focus Hub",
    icon: "Briefcase",
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newWorkspaceName.trim();
    if (!trimmed) return;

    const created = await createWorkspace(trimmed);
    if (created) {
      setNewWorkspaceName("");
      setIsCreating(false);
      setIsOpen(false);
    }
  };

  return (
    <div className={cn("relative pointer-events-auto", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all duration-150 border",
          "bg-[#0c0e14]/90 backdrop-blur-md text-[#d1d6e2] hover:text-white border-white/10 hover:border-white/20 shadow-lg",
          isOpen && "border-[var(--accent-lime)]/40 text-white bg-white/[0.08]"
        )}
        aria-expanded={isOpen}
        aria-label="Switch workspace"
      >
        <Briefcase size={14} className="text-[var(--accent-lime)]" weight="bold" />
        <span className="max-w-[120px] truncate">{activeWs.name}</span>
        <CaretDown
          size={12}
          className={cn(
            "text-[#9aa5b8] transition-transform duration-150",
            isOpen && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 mt-2 w-64 rounded-2xl bg-[#0c0e14]/98 border border-white/10 p-1.5 shadow-2xl backdrop-blur-2xl z-50 flex flex-col gap-1 text-xs"
          >
            <div className="px-2.5 py-1.5 flex items-center justify-between text-[#9aa5b8] font-medium border-b border-white/[0.06]">
              <span className="text-[11px] tracking-wider uppercase">Workspaces</span>
              <span className="text-[10px] text-[#9aa5b8]/70">PolyDocks V2</span>
            </div>

            <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto py-1">
              {workspaces.map((ws) => {
                const isActive = ws.id === activeWorkspaceId;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      setActiveWorkspace(ws.id);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer",
                      isActive
                        ? "bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] font-medium"
                        : "text-[#d1d6e2] hover:bg-white/[0.06] hover:text-white"
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Folder size={14} className={isActive ? "text-[var(--accent-lime)]" : "text-[#9aa5b8]"} />
                      <div className="flex flex-col truncate">
                        <span className="truncate">{ws.name}</span>
                        {ws.description && (
                          <span className="text-[10px] text-[#9aa5b8] truncate">{ws.description}</span>
                        )}
                      </div>
                    </div>
                    {isActive && <Check size={14} className="shrink-0 text-[var(--accent-lime)]" weight="bold" />}
                  </button>
                );
              })}
            </div>

            <div className="pt-1 border-t border-white/[0.06]">
              {isCreating ? (
                <form onSubmit={handleCreate} className="flex items-center gap-1.5 p-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    placeholder="Workspace name..."
                    className="flex-1 bg-white/[0.06] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-[#9aa5b8] focus:outline-none focus:border-[var(--accent-lime)]/50"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 bg-[var(--accent-lime)] text-black font-semibold rounded-lg text-xs hover:opacity-90 cursor-pointer"
                  >
                    Add
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-[#9aa5b8] hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Create Workspace...</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
