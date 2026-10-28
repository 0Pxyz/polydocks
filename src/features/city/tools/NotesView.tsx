import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Plus, PencilSimple, Eye, Check } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { CityNoteItem } from "../types";

interface NotesViewProps {
  notes: CityNoteItem[];
  cityName: string;
  onSaveNote?: (name: string, content: string) => void;
}

export function NotesView({ notes, cityName, onSaveNote }: NotesViewProps) {
  const [selectedNoteName, setSelectedNoteName] = useState<string>(
    notes[0]?.name || "summary.md"
  );
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const currentNote = notes.find((n) => n.name === selectedNoteName) || notes[0] || {
    name: "summary.md",
    path: "notes/summary.md",
    content: `# ${cityName} Notes\n\nNo notes written yet. Click edit to begin synthesizing.`,
  };

  const [editBuffer, setEditBuffer] = useState<string>(currentNote.content);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const handleSelectNote = (name: string) => {
    setSelectedNoteName(name);
    const target = notes.find((n) => n.name === name);
    if (target) {
      setEditBuffer(target.content);
    }
    setIsEditing(false);
  };

  const handleSave = () => {
    onSaveNote?.(currentNote.name, editBuffer);
    setSavedSuccess(true);
    setIsEditing(false);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full max-w-5xl h-full min-h-[500px]">
      {/* Notes Sidebar */}
      <div className="w-full md:w-60 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between px-1 mb-1">
          <span className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
            <FileText size={16} />
            <span>Notes ({notes.length})</span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => {
              const newName = `note-${notes.length + 1}.md`;
              onSaveNote?.(newName, `# New Note for ${cityName}\n\nStart writing...`);
              setSelectedNoteName(newName);
              setEditBuffer(`# New Note for ${cityName}\n\nStart writing...`);
              setIsEditing(true);
            }}
            title="Create Note"
          >
            <Plus size={14} />
          </Button>
        </div>

        <div className="flex flex-col gap-1">
          {notes.map((note) => {
            const isSelected = note.name === selectedNoteName;
            return (
              <button
                key={note.name}
                type="button"
                onClick={() => handleSelectNote(note.name)}
                className={`flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-white/[0.08] text-white font-medium"
                    : "text-muted-foreground hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileText size={14} className={isSelected ? "text-[var(--accent-lime)]" : "text-muted-foreground"} />
                  <span className="truncate">{note.name}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Note Canvas */}
      <div className="flex-1 flex flex-col rounded-2xl bg-[#0c0e14] border border-white/5 overflow-hidden">
        {/* Note Action Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-white">
              {currentNote.name}
            </span>
            {savedSuccess && (
              <span className="text-xs text-[var(--accent-lime)] flex items-center gap-1 font-mono">
                <Check size={14} /> Saved
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    setEditBuffer(currentNote.content);
                    setIsEditing(false);
                  }}
                >
                  <Eye size={14} /> Preview
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1 bg-[var(--accent-lime)] text-black font-semibold hover:opacity-90"
                  onClick={handleSave}
                >
                  <Check size={14} /> Save
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-white"
                onClick={() => {
                  setEditBuffer(currentNote.content);
                  setIsEditing(true);
                }}
              >
                <PencilSimple size={14} /> Edit
              </Button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 p-6 overflow-y-auto max-h-[600px]">
          {isEditing ? (
            <textarea
              value={editBuffer}
              onChange={(e) => setEditBuffer(e.target.value)}
              className="w-full h-full min-h-[380px] bg-transparent font-mono text-sm text-foreground focus:outline-none resize-none leading-relaxed"
              placeholder="Write your synthesized knowledge notes in markdown..."
            />
          ) : (
            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-foreground prose-a:text-[var(--accent-lime)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {currentNote.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
