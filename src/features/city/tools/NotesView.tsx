import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Plus, Edit3, Eye, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    <div className="flex flex-col md:flex-row gap-6 w-full h-full min-h-[500px]">
      {/* Notes Sidebar */}
      <div className="w-full md:w-64 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-mono uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-primary" />
            Workspace Notes ({notes.length})
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
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          {notes.map((note) => {
            const isSelected = note.name === selectedNoteName;
            return (
              <button
                key={note.name}
                type="button"
                onClick={() => handleSelectNote(note.name)}
                className={`flex items-center justify-between p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-secondary border-primary/40 text-foreground font-medium shadow-sm"
                    : "bg-card/50 border-border/60 text-muted-foreground hover:text-foreground hover:bg-card"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileText className={`w-3.5 h-3.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="truncate">{note.name}</span>
                </div>
                {note.updatedAt && (
                  <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                    {new Date(note.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Note Canvas */}
      <div className="flex-1 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
        {/* Note Action Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/60">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary">
              {currentNote.name}
            </Badge>
            {savedSuccess && (
              <span className="text-xs text-[var(--accent-lime)] flex items-center gap-1 font-mono">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    setEditBuffer(currentNote.content);
                    setIsEditing(false);
                  }}
                >
                  <Eye className="w-3.5 h-3.5" /> Preview
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleSave}
                >
                  <Check className="w-3.5 h-3.5" /> Save Changes
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 hover:border-primary/50"
                onClick={() => {
                  setEditBuffer(currentNote.content);
                  setIsEditing(true);
                }}
              >
                <Edit3 className="w-3.5 h-3.5 text-primary" /> Edit Markdown
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
            <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:text-foreground prose-a:text-primary prose-code:text-[var(--accent-lime)] prose-pre:bg-secondary/60">
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
