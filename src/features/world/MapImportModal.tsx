import { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UploadSimple, X, Image as ImageIcon } from "@phosphor-icons/react";
import type { MapSource } from "./types";
import { prefersReducedMotion } from "@/lib/motion";

export interface MapImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMapImported: (map: MapSource) => void;
}

export function MapImportModal({
  isOpen,
  onClose,
  onMapImported,
}: MapImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [mapName, setMapName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isReduced = prefersReducedMotion();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setError(null);

    // Validate size (20MB)
    if (selected.size > 20 * 1024 * 1024) {
      setError("File exceeds 20MB limit.");
      return;
    }

    // Validate mime/type (raster only)
    if (
      !selected.type.includes("png") &&
      !selected.type.includes("jpeg") &&
      !selected.type.includes("webp")
    ) {
      setError("Only PNG, JPG, and WebP images are allowed (SVG is forbidden).");
      return;
    }

    setFile(selected);
    if (!mapName) {
      const defaultName = selected.name.replace(/\.[^/.]+$/, "");
      setMapName(defaultName);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", mapName.trim() || "Custom Map");

      const res = await fetch("/api/maps/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to import map");
      }

      onMapImported(data.map);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Error importing map");
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
        <motion.div
          initial={isReduced ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md rounded-2xl bg-[#0f141f] border border-white/10 shadow-2xl p-6 text-foreground"
        >
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <h3 className="font-display text-base font-semibold text-white">Import Custom Map</h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-[#9aa5b8] hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {/* File Dropzone Box */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex flex-col items-center justify-center p-6 rounded-xl border border-dashed border-white/20 hover:border-[var(--accent-lime)] bg-white/[0.02] hover:bg-white/[0.05] transition-all cursor-pointer text-center"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              {file ? (
                <div className="flex flex-col items-center gap-1.5">
                  <ImageIcon size={32} className="text-[var(--accent-lime)]" />
                  <span className="text-xs font-mono text-white max-w-[280px] truncate">{file.name}</span>
                  <span className="text-[11px] text-[#9aa5b8]">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <UploadSimple size={32} className="text-[#9aa5b8] group-hover:text-[var(--accent-lime)]" />
                  <span className="text-xs text-white">Click or drag raster map image here</span>
                  <span className="text-[11px] text-[#9aa5b8]">PNG, JPG, or WebP up to 20MB</span>
                </div>
              )}
            </div>

            {/* Map Name Input */}
            <div>
              <label className="block text-xs font-mono text-[#9aa5b8] mb-1.5">Map Display Name</label>
              <input
                type="text"
                value={mapName}
                onChange={(e) => setMapName(e.target.value)}
                placeholder="e.g. Eldoria Continent"
                className="w-full px-3 py-2 rounded-lg bg-[#161c28] border border-white/10 text-xs text-white placeholder-muted-foreground outline-none focus:border-[var(--accent-lime)] font-mono"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 font-mono bg-red-950/40 p-2 rounded border border-red-800/40">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[#9aa5b8] hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!file || isUploading}
                className="px-4 py-2 rounded-lg bg-[var(--accent-lime)] text-black font-semibold text-xs hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer flex items-center gap-1.5"
              >
                {isUploading ? "Processing…" : "Import Map"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
