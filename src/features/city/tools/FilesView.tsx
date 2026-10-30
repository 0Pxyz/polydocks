import { useState, useEffect } from "react";
import {
  Folder,
  FileText,
  FileCode,
  Plus,
  FloppyDisk,
  PencilSimple,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useTabState } from "@/lib/tabs/useTabState";

export interface WorkspaceFileItem {
  path: string;
  name: string;
  size: number;
}

interface FilesViewProps {
  cityId: string;
  cityName: string;
  onOpenFile?: (path: string) => void;
}

export function FilesView({ cityId, cityName, onOpenFile: _onOpenFile }: FilesViewProps) {
  const [files, setFiles] = useState<WorkspaceFileItem[]>([]);
  // The open file persists across tab switches and hibernation; content is
  // refetched on restore (fresh from disk, never a stale snapshot).
  const [selectedFile, setSelectedFile] = useTabState<string | null>(`city:${cityId}:files`, "selected", null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [newFilePath, setNewFilePath] = useState<string>("");
  const [newFileContent, setNewFileContent] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  // Honest load failure: never render fabricated content as if it were the file.
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadFiles = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/cities/${encodeURIComponent(cityId)}/files`);
      if (res.ok) {
        const data = await res.json();
        const list = data.files || [];
        setFiles(list);
        if (selectedFile && list.some((f: WorkspaceFileItem) => f.path === selectedFile)) {
          loadFileContent(selectedFile);
        } else if (list.length > 0 && !selectedFile) {
          loadFileContent(list[0].path);
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  const loadFileContent = async (path: string) => {
    setSelectedFile(path);
    setIsEditing(false);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/cities/${encodeURIComponent(cityId)}/files?path=${encodeURIComponent(path)}`
      );
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content || "");
      } else {
        setFileContent("");
        setLoadError(`Couldn't load "${path}" (server responded ${res.status}).`);
      }
    } catch {
      setFileContent("");
      setLoadError(`Couldn't load "${path}". Check your connection and try again.`);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [cityId]);

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilePath.trim()) return;

    try {
      const res = await fetch(`/api/cities/${encodeURIComponent(cityId)}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: newFilePath.trim(),
          content: newFileContent,
        }),
      });

      if (res.ok) {
        setShowNewModal(false);
        setNewFilePath("");
        setNewFileContent("");
        await loadFiles();
        loadFileContent(newFilePath.trim());
      }
    } catch (err: any) {
      alert("Failed to create file: " + err.message);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedFile) return;
    try {
      const res = await fetch(`/api/cities/${encodeURIComponent(cityId)}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: selectedFile,
          content: fileContent,
        }),
      });

      if (res.ok) {
        setSaveStatus("Saved!");
        setIsEditing(false);
        setTimeout(() => setSaveStatus(null), 2000);
      }
    } catch (err: any) {
      alert("Failed to save: " + err.message);
    }
  };

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith(".ts") || fileName.endsWith(".js") || fileName.endsWith(".html") || fileName.endsWith(".json")) {
      return <FileCode size={16} className="text-[#38bdf8]" />;
    }
    return <FileText size={16} className="text-[var(--accent-lime)]" />;
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Folder size={18} className="text-[var(--accent-lime)]" />
            <span>Workspace Files</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            workspace/{cityId}/
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadFiles}
            className="h-8 gap-1.5 text-xs font-mono"
          >
            <ArrowClockwise size={14} className={isLoading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setShowNewModal(true)}
            className="h-8 gap-1.5 text-xs font-mono bg-[var(--accent-lime)] text-black hover:opacity-90 font-semibold"
          >
            <Plus size={14} weight="bold" />
            <span>New File</span>
          </Button>
        </div>
      </div>

      {/* Main Files Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 min-h-[480px]">
        {/* File Explorer Sidebar */}
        <div className="md:col-span-4 rounded-2xl border border-white/5 bg-[#0c0e14] p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between px-2 py-1 text-xs font-mono text-muted-foreground">
            <span>Explorer ({files.length})</span>
            <span>Size</span>
          </div>

          <div className="flex flex-col gap-1 overflow-y-auto max-h-[450px]">
            {files.map((f) => {
              const isSelected = selectedFile === f.path;
              return (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => loadFileContent(f.path)}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-mono transition-colors text-left cursor-pointer ${
                    isSelected
                      ? "bg-white/[0.08] text-white"
                      : "text-muted-foreground hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate max-w-[200px]">
                    {getFileIcon(f.name)}
                    <span className="truncate">{f.path}</span>
                  </div>
                  <span className="text-[11px] opacity-60">
                    {(f.size / 1024).toFixed(1)}k
                  </span>
                </button>
              );
            })}

            {files.length === 0 && !isLoading && (
              <div className="p-4 text-center text-xs text-muted-foreground font-mono">
                No files found. Click &quot;New File&quot; to create one.
              </div>
            )}
          </div>
        </div>

        {/* File Content Viewer / Editor */}
        <div className="md:col-span-8 rounded-2xl border border-white/5 bg-[#0c0e14] p-4 flex flex-col justify-between">
          <div className="flex flex-col gap-3">
            {/* Viewer Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div className="flex items-center gap-2 font-mono text-xs text-foreground">
                <span className="text-muted-foreground">Editing:</span>
                <span className="font-semibold text-white">{selectedFile || "None"}</span>
              </div>

              <div className="flex items-center gap-2">
                {saveStatus && (
                  <span className="text-[var(--accent-lime)] text-xs font-mono">
                    {saveStatus}
                  </span>
                )}
                {isEditing ? (
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    className="h-7 text-xs gap-1 bg-[var(--accent-lime)] text-black font-semibold"
                  >
                    <FloppyDisk size={14} />
                    <span>Save</span>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <PencilSimple size={14} />
                    <span>Edit</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Content Field */}
            {loadError ? (
              <div className="w-full h-[380px] p-3 rounded-lg bg-black/40 border border-red-400/20 font-mono text-xs flex flex-col items-center justify-center gap-2 text-center">
                <span className="text-red-300/90">{loadError}</span>
                <button
                  type="button"
                  onClick={() => selectedFile && loadFileContent(selectedFile)}
                  className="text-[var(--accent-lime)] hover:opacity-80 cursor-pointer"
                >
                  Try again
                </button>
              </div>
            ) : isEditing ? (
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="w-full h-[380px] p-3 rounded-lg bg-black/40 border border-white/10 font-mono text-xs text-foreground resize-none outline-none focus:border-[var(--accent-lime)]"
                placeholder="File content..."
              />
            ) : (
              <pre className="w-full h-[380px] p-3 rounded-lg bg-black/40 border border-white/5 font-mono text-xs text-foreground overflow-auto whitespace-pre-wrap">
                {fileContent || "// Empty file"}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* New File Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl bg-[#0f141f] border border-white/10 shadow-2xl p-6 text-foreground">
            <h3 className="font-display text-base font-semibold text-white mb-4">
              Create New File in {cityName}
            </h3>

            <form onSubmit={handleCreateFile} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#9aa5b8] mb-1.5">
                  Relative File Path
                </label>
                <input
                  type="text"
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  placeholder="e.g. notes/deep-dive.md or data/dataset.json"
                  className="w-full px-3 py-2 rounded-lg bg-[#161c28] border border-white/10 text-xs text-white placeholder-muted-foreground outline-none focus:border-[var(--accent-lime)] font-mono"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#9aa5b8] mb-1.5">
                  Initial Content (Optional)
                </label>
                <textarea
                  value={newFileContent}
                  onChange={(e) => setNewFileContent(e.target.value)}
                  placeholder="# My Note or code..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg bg-[#161c28] border border-white/10 text-xs text-white placeholder-muted-foreground outline-none focus:border-[var(--accent-lime)] font-mono resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-[var(--accent-lime)] text-black font-semibold hover:opacity-90"
                >
                  Create File
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
