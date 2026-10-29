import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileText,
  FileCode,
  FileSpreadsheet,
  File,
  Image as ImageIcon,
  X,
  Download,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import { type ChatAttachment, formatFileSize } from "@/lib/agent/attachments";
import { cn } from "@/lib/cn";

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["ts", "tsx", "js", "jsx", "py", "html", "css", "json", "sh"].includes(ext)) {
    return <FileCode className="w-4 h-4 text-cyan-400" />;
  }
  if (["csv", "tsv", "xlsx", "xls"].includes(ext)) {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
  }
  if (["pdf", "md", "txt", "doc", "docx"].includes(ext)) {
    return <FileText className="w-4 h-4 text-amber-400" />;
  }
  return <File className="w-4 h-4 text-muted-foreground" />;
}

// -------------------------------------------------------------
// Lightbox Modal for Fullscreen Image Preview
// -------------------------------------------------------------
interface LightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageAlt?: string;
}

export function LightboxModal({ isOpen, onClose, imageUrl, imageAlt }: LightboxModalProps) {
  const [zoom, setZoom] = useState(1);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="relative max-w-5xl max-h-[90vh] flex flex-col items-center bg-[#0E0E12] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* Header controls */}
          <div className="w-full flex items-center justify-between px-4 py-2.5 bg-white/5 border-b border-white/10">
            <span className="text-xs font-mono text-muted-foreground truncate max-w-xs">
              {imageAlt || "Image preview"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
                className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                title="Reset zoom"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <a
                href={imageUrl}
                download={imageAlt || "download.png"}
                className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                title="Download image"
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors ml-2"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Image container */}
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[300px] max-h-[80vh]">
            <img
              src={imageUrl}
              alt={imageAlt || "Preview"}
              style={{ transform: `scale(${zoom})`, transition: "transform 0.15s ease-out" }}
              className="max-h-[75vh] max-w-full object-contain rounded-lg select-none"
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// -------------------------------------------------------------
// Staging Bar (pre-send attachments list)
// -------------------------------------------------------------
interface AttachmentStagingBarProps {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
  className?: string;
}

export function AttachmentStagingBar({
  attachments,
  onRemove,
  className,
}: AttachmentStagingBarProps) {
  if (attachments.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 p-2 px-3 bg-white/[0.04] border-b border-white/10 rounded-t-xl overflow-x-auto",
        className
      )}
    >
      {attachments.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white/90 group"
        >
          {item.isImage ? (
            <img
              src={item.dataUrl}
              alt={item.name}
              className="w-6 h-6 rounded object-cover border border-white/20"
            />
          ) : (
            getFileIcon(item.name)
          )}

          <div className="flex flex-col">
            <span className="font-medium truncate max-w-[140px] text-[11px]">{item.name}</span>
            <span className="text-[9px] font-mono text-muted-foreground">
              {formatFileSize(item.size)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="p-1 rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-colors cursor-pointer"
            title="Remove attachment"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------------------------
// Message Attachments Rendering in Transcript
// -------------------------------------------------------------
interface MessageAttachmentsProps {
  attachments?: ChatAttachment[];
}

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  const [activeLightboxImage, setActiveLightboxImage] = useState<ChatAttachment | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.isImage);
  const documents = attachments.filter((a) => !a.isImage);

  return (
    <>
      <div className="mt-2 space-y-2">
        {/* Images Grid */}
        {images.length > 0 && (
          <div
            className={cn(
              "grid gap-2",
              images.length === 1 ? "grid-cols-1 max-w-sm" : "grid-cols-2 sm:grid-cols-3 max-w-md"
            )}
          >
            {images.map((img) => (
              <div
                key={img.id}
                onClick={() => {
                  if (img.dataUrl) setActiveLightboxImage(img);
                }}
                className={cn(
                  "relative group rounded-xl overflow-hidden border border-white/10 bg-black/30 aspect-video sm:aspect-square flex items-center justify-center",
                  img.dataUrl ? "cursor-pointer" : "cursor-default"
                )}
              >
                {img.dataUrl ? (
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 p-3 text-center">
                    <ImageIcon className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground truncate max-w-full">
                      {img.name}
                    </span>
                  </div>
                )}
                {img.dataUrl && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                    <Maximize2 className="w-4 h-4 text-white" />
                    <span className="text-[10px] font-mono text-white">Preview</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Documents List */}
        {documents.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10 max-w-sm"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="p-1.5 rounded-lg bg-black/40 border border-white/10">
                    {getFileIcon(doc.name)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-white truncate">{doc.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {formatFileSize(doc.size)}
                    </span>
                  </div>
                </div>

                <a
                  href={doc.dataUrl || undefined}
                  download={doc.dataUrl ? doc.name : undefined}
                  aria-disabled={!doc.dataUrl}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors flex-shrink-0",
                    doc.dataUrl
                      ? "hover:bg-white/10 text-muted-foreground hover:text-white cursor-pointer"
                      : "text-muted-foreground/40 cursor-default pointer-events-none"
                  )}
                  title={doc.dataUrl ? "Download file" : "Original file not stored in the transcript"}
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeLightboxImage && (
        <LightboxModal
          isOpen={true}
          onClose={() => setActiveLightboxImage(null)}
          imageUrl={activeLightboxImage.dataUrl}
          imageAlt={activeLightboxImage.name}
        />
      )}
    </>
  );
}
