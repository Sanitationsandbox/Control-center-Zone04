"use client";

import { useState, useEffect, useRef, DragEvent, ChangeEvent } from "react";
import Link from "next/link";

interface Asset {
  id: string;
  name: string;
  filename: string;
  url: string;
  size: number;
  type: string;
  uploadedAt: number;
  downloadUrl?: string;
  inlineUrl?: string;
  mediaType?: "IMAGE" | "VIDEO" | "PDF" | "OTHER";
}

interface MediaGroupItem {
  id: string;
  position: number;
  enabled: boolean;
  asset: Asset;
}

interface MediaGroup {
  id: string;
  slug: string;
  displayName: string;
  controlKind: "PAGE_SEQUENCE" | "VIDEO";
  sortOrder: number;
  activeIndex: number;
  activeItemId: string | null;
  items: MediaGroupItem[];
}

interface UploadingFile {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
}

const broadcastChannelName = "rubenius-content";

// Static Tailwind class names (kept literal so the JIT compiler picks them up)
// cycled through for however many fields exist — this is what lets pipelines
// be created dynamically without touching this file again.
const PIPELINE_PALETTE = [
  { color: "text-amber-400", activeColor: "group-hover/hdr:text-amber-400", borderActive: "border-amber-500", bgActive: "bg-amber-500/5", shadowActive: "shadow-[0_0_15px_rgba(245,158,11,0.2)]", badgeBg: "bg-amber-500/10", badgeBorder: "border-amber-500/20", badgeText: "text-amber-400", glowColor: "bg-amber-400", indicatorColor: "#f59e0b" },
  { color: "text-cyan-400", activeColor: "group-hover/hdr:text-cyan-400", borderActive: "border-cyan-400", bgActive: "bg-cyan-400/5", shadowActive: "shadow-[0_0_15px_rgba(6,182,212,0.2)]", badgeBg: "bg-cyan-500/10", badgeBorder: "border-cyan-400/20", badgeText: "text-cyan-400", glowColor: "bg-cyan-400", indicatorColor: "#22d3ee" },
  { color: "text-emerald-400", activeColor: "group-hover/hdr:text-emerald-400", borderActive: "border-emerald-500", bgActive: "bg-emerald-500/5", shadowActive: "shadow-[0_0_15px_rgba(16,185,129,0.2)]", badgeBg: "bg-emerald-500/10", badgeBorder: "border-emerald-500/20", badgeText: "text-emerald-400", glowColor: "bg-emerald-400", indicatorColor: "#10b981" },
  { color: "text-purple-400", activeColor: "group-hover/hdr:text-purple-400", borderActive: "border-purple-500", bgActive: "bg-purple-500/5", shadowActive: "shadow-[0_0_15px_rgba(168,85,247,0.2)]", badgeBg: "bg-purple-500/10", badgeBorder: "border-purple-500/20", badgeText: "text-purple-400", glowColor: "bg-purple-400", indicatorColor: "#a855f7" },
  { color: "text-rose-400", activeColor: "group-hover/hdr:text-rose-400", borderActive: "border-rose-500", bgActive: "bg-rose-500/5", shadowActive: "shadow-[0_0_15px_rgba(244,63,94,0.2)]", badgeBg: "bg-rose-500/10", badgeBorder: "border-rose-500/20", badgeText: "text-rose-400", glowColor: "bg-rose-400", indicatorColor: "#f43f5e" },
  { color: "text-blue-400", activeColor: "group-hover/hdr:text-blue-400", borderActive: "border-blue-500", bgActive: "bg-blue-500/5", shadowActive: "shadow-[0_0_15px_rgba(59,130,246,0.2)]", badgeBg: "bg-blue-500/10", badgeBorder: "border-blue-500/20", badgeText: "text-blue-400", glowColor: "bg-blue-400", indicatorColor: "#3b82f6" },
  { color: "text-lime-400", activeColor: "group-hover/hdr:text-lime-400", borderActive: "border-lime-500", bgActive: "bg-lime-500/5", shadowActive: "shadow-[0_0_15px_rgba(132,204,22,0.2)]", badgeBg: "bg-lime-500/10", badgeBorder: "border-lime-500/20", badgeText: "text-lime-400", glowColor: "bg-lime-400", indicatorColor: "#84cc16" },
  { color: "text-orange-400", activeColor: "group-hover/hdr:text-orange-400", borderActive: "border-orange-500", bgActive: "bg-orange-500/5", shadowActive: "shadow-[0_0_15px_rgba(249,115,22,0.2)]", badgeBg: "bg-orange-500/10", badgeBorder: "border-orange-500/20", badgeText: "text-orange-400", glowColor: "bg-orange-400", indicatorColor: "#fb923c" },
];

function paletteFor(index: number) {
  return PIPELINE_PALETTE[index % PIPELINE_PALETTE.length];
}

function abbreviate(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "??";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) return trimmed.slice(0, 4).toUpperCase();
  return words.map((word) => word[0]).join("").slice(0, 4).toUpperCase();
}

export default function AdminPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [groups, setGroups] = useState<MediaGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Upload modal states
  const [uploadFiles, setUploadFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pipeline (media group) UI state, keyed by group id so any number of
  // dynamically-created fields works without additional state variables.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Drag and drop states for slide reordering
  const [draggedSlide, setDraggedSlide] = useState<{ groupId: string; index: number } | null>(null);
  const [dragOverSlideIndex, setDragOverSlideIndex] = useState<number | null>(null);

  // Add More Field modal state
  const [isAddFieldModalOpen, setIsAddFieldModalOpen] = useState<boolean>(false);
  const [newFieldName, setNewFieldName] = useState<string>("");
  const [newFieldKind, setNewFieldKind] = useState<"PAGE_SEQUENCE" | "VIDEO">("PAGE_SEQUENCE");
  const [isAddingField, setIsAddingField] = useState<boolean>(false);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
  }

  const publishLocalUpdate = (payload: unknown) => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(broadcastChannelName);
    channel.postMessage({ event: "content-updated", payload });
    channel.close();
  };

  const patchPipeline = async (groupSlug: string, body: unknown) => {
    const response = await fetch(`/api/media-groups/${groupSlug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error("Pipeline update failed");
    }

    return response;
  };

  const fetchAssets = async () => {
    try {
      const res = await fetch("/api/media");
      if (!res.ok) throw new Error("Failed to load assets");
      const data = (await res.json()) as Asset[];
      setAssets(data);
    } catch {
      showToast("Error loading assets", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    const res = await fetch("/api/media-groups");
    if (!res.ok) throw new Error("Failed to load media groups");
    const data = (await res.json()) as MediaGroup[];
    setGroups(data);
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const group of data) {
        if (!(group.id in next)) next[group.id] = true;
      }
      return next;
    });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([fetchAssets(), fetchGroups()]).finally(() => setLoading(false));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;

    const channel = new BroadcastChannel(broadcastChannelName);
    channel.onmessage = () => {
      void Promise.all([fetchAssets(), fetchGroups()]);
    };

    return () => channel.close();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setAssetToDelete(null);
  };

  const handleDelete = async () => {
    if (!assetToDelete) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/media/${assetToDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete asset");
      showToast("Asset deleted successfully", "success");
      publishLocalUpdate({ mediaId: assetToDelete.id, deleted: true });
      setAssetToDelete(null);
      await Promise.all([fetchAssets(), fetchGroups()]);
    } catch {
      showToast("Failed to delete asset", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
  };

  const addFiles = (files: File[]) => {
    setUploadFiles((prev) => [
      ...prev,
      ...files.map((file) => ({ file, status: "pending" as const, progress: 0 })),
    ]);
  };

  const removeUploadFile = (index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadSubmit = async () => {
    if (uploadFiles.length === 0) return;
    setIsUploading(true);
    const formData = new FormData();
    uploadFiles.forEach((uf) => formData.append("files", uf.file));
    setUploadFiles((prev) => prev.map((uf) => ({ ...uf, status: "uploading" })));
    try {
      const res = await fetch("/api/media", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      setUploadFiles((prev) => prev.map((uf) => ({ ...uf, status: "success" })));
      showToast(`Successfully uploaded ${uploadFiles.length} file(s)`, "success");
      setTimeout(() => {
        setIsModalOpen(false);
        setUploadFiles([]);
        publishLocalUpdate({ uploaded: true });
        void Promise.all([fetchAssets(), fetchGroups()]);
      }, 800);
    } catch {
      setUploadFiles((prev) => prev.map((uf) => ({ ...uf, status: "error" })));
      showToast("Upload failed. Please try again.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  // Pipeline (media group) helpers — all derived from `groups`, nothing hardcoded.
  const isAssetInPipeline = (group: MediaGroup, assetId: string) =>
    group.items.some((item) => item.enabled && item.asset.id === assetId);

  const activeAssetIdForGroup = (group: MediaGroup) => {
    const activeItem = group.items.find((item) => item.enabled && item.id === group.activeItemId);
    return activeItem?.asset.id ?? null;
  };

  const handleTogglePipelineAsset = async (group: MediaGroup, asset: Asset) => {
    const enabledItems = group.items.filter((item) => item.enabled);
    const existingItem = enabledItems.find((item) => item.asset.id === asset.id);

    try {
      if (existingItem) {
        const idx = enabledItems.indexOf(existingItem);
        await patchPipeline(group.slug, { activeIndex: idx, activeItemId: existingItem.id });
      } else {
        await patchPipeline(group.slug, { addAssetId: asset.id });
      }

      publishLocalUpdate({ groupId: group.slug, mediaId: asset.id });
      await fetchGroups();
    } catch {
      showToast("Unable to update pipeline", "error");
    }
  };

  const handleActivateSlide = async (group: MediaGroup, item: MediaGroupItem, index: number) => {
    try {
      await patchPipeline(group.slug, { activeIndex: index, activeItemId: item.id });
      publishLocalUpdate({ groupId: group.slug });
      await fetchGroups();
    } catch {
      showToast("Unable to update pipeline", "error");
    }
  };

  const handleSlideDragStart = (groupId: string, index: number) => {
    setDraggedSlide({ groupId, index });
  };

  const handleSlideDragOver = (e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    setDragOverSlideIndex(index);
  };

  const handleSlideDragEnd = () => {
    setDraggedSlide(null);
    setDragOverSlideIndex(null);
  };

  const handleSlideDrop = async (group: MediaGroup, targetIndex: number) => {
    if (!draggedSlide || draggedSlide.groupId !== group.id) return;
    const sourceIndex = draggedSlide.index;
    handleSlideDragEnd();
    if (sourceIndex === targetIndex) return;

    const enabledItems = group.items.filter((item) => item.enabled);
    const activeItem = enabledItems.find((item) => item.id === group.activeItemId);
    const activeIndex = activeItem ? enabledItems.indexOf(activeItem) : -1;

    const nextItems = [...enabledItems];
    const [moved] = nextItems.splice(sourceIndex, 1);
    nextItems.splice(targetIndex, 0, moved);

    let nextActiveIndex = activeIndex;
    if (activeIndex === sourceIndex) {
      nextActiveIndex = targetIndex;
    } else if (activeIndex > sourceIndex && activeIndex <= targetIndex) {
      nextActiveIndex = activeIndex - 1;
    } else if (activeIndex < sourceIndex && activeIndex >= targetIndex) {
      nextActiveIndex = activeIndex + 1;
    }

    try {
      await patchPipeline(group.slug, {
        itemIds: nextItems.map((item) => item.id),
        activeIndex: nextActiveIndex,
        activeItemId: nextItems[nextActiveIndex]?.id ?? null,
      });
      publishLocalUpdate({ groupId: group.slug });
      await fetchGroups();
    } catch {
      showToast("Unable to save slide order", "error");
    }
  };

  const handleAddField = async () => {
    const name = newFieldName.trim();
    if (!name || isAddingField) return;

    setIsAddingField(true);
    try {
      const res = await fetch("/api/media-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, controlKind: newFieldKind }),
      });
      if (!res.ok) throw new Error("Failed to add field");
      const created = (await res.json()) as MediaGroup;

      setOpenGroups((prev) => ({ ...prev, [created.id]: true }));
      showToast(`Field "${name}" added`, "success");
      setIsAddFieldModalOpen(false);
      setNewFieldName("");
      setNewFieldKind("PAGE_SEQUENCE");
      publishLocalUpdate({ groupAdded: created.slug });
      await fetchGroups();
    } catch {
      showToast("Unable to add field", "error");
    } finally {
      setIsAddingField(false);
    }
  };

  const closeAddFieldModal = () => {
    if (isAddingField) return;
    setIsAddFieldModalOpen(false);
    setNewFieldName("");
    setNewFieldKind("PAGE_SEQUENCE");
  };

  const totalSize = assets.reduce((acc, curr) => acc + curr.size, 0);
  const imagesCount = assets.filter((a) => a.type.startsWith("image/")).length;
  const pdfsCount = assets.filter((a) => a.type === "application/pdf").length;

  return (
    <main className="relative min-h-screen w-full flex flex-col items-center p-6 md:p-12 lg:p-20 overflow-hidden bg-[#070b14] text-slate-100 font-sans">
      {/* Background radial glow effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-950/20 via-slate-950 to-slate-950 pointer-events-none" />

      {/* Grid Overlay */}
      <div
        className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none"
        style={{ maskImage: "radial-gradient(ellipse at center, black, transparent 80%)", WebkitMaskImage: "radial-gradient(ellipse at center, black, transparent 80%)" }}
      />

      {/* Decorative ambient blobs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[600px] h-[600px] rounded-full bg-teal-500/5 blur-[140px] pointer-events-none" style={{ animationDelay: "1.5s" }} />

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl border backdrop-blur-xl shadow-2xl transition-all duration-300 ${
          toast.type === "success"
            ? "bg-emerald-950/80 border-emerald-500/35 text-emerald-300"
            : "bg-rose-950/80 border-rose-500/35 text-rose-300"
        }`}>
          {toast.type === "success" ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          <span className="text-sm font-medium tracking-wide">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="relative w-full max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 z-10 border-b border-white/5 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-cyan-400 font-mono border border-cyan-400/30 px-2 py-0.5 rounded-full bg-cyan-950/30">
              ADMIN PANEL
            </span>
          </div>
          <p className="text-xs text-slate-400 font-light">Asset management pipeline and presentation controllers.</p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-mono tracking-widest text-slate-400 hover:text-cyan-400 transition-colors uppercase py-2 px-4 rounded-lg bg-slate-900/40 border border-white/5"
          >
            &larr; BACK TO CONSOLE
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <div className="relative w-full max-w-6xl mx-auto z-10 mt-10 space-y-10">

        {/* Stats Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="p-5 bg-slate-900/30 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl flex flex-col justify-between">
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">Total Assets</span>
            <span className="text-3xl font-extrabold font-mono text-cyan-400 mt-2">{assets.length}</span>
          </div>
          <div className="p-5 bg-slate-900/30 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl flex flex-col justify-between">
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">Total Size</span>
            <span className="text-3xl font-extrabold font-mono text-teal-400 mt-2">{formatBytes(totalSize)}</span>
          </div>
          <div className="p-5 bg-slate-900/30 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl flex flex-col justify-between">
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">Images</span>
            <span className="text-3xl font-extrabold font-mono text-amber-500 mt-2">{imagesCount}</span>
          </div>
          <div className="p-5 bg-slate-900/30 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl flex flex-col justify-between">
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">PDFs</span>
            <span className="text-3xl font-extrabold font-mono text-purple-400 mt-2">{pdfsCount}</span>
          </div>
        </section>

        {/* Action Header & Upload Trigger */}
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Repository Assets</h2>
            <p className="text-xs text-slate-400 font-light mt-1">Uploaded files accessible dynamically by every active pipeline field below.</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 py-3 px-6 text-xs font-mono font-bold tracking-wider text-[#070b14] bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all duration-200 shadow-[0_0_20px_rgba(34,211,238,0.2)] hover:shadow-[0_0_30px_rgba(34,211,238,0.4)] cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            UPLOAD ASSETS
          </button>
        </section>

        {/* Asset Table */}
        <section className="p-6 bg-slate-900/20 backdrop-blur-xl border border-white/5 rounded-3xl shadow-xl overflow-hidden">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-400">
              <div className="w-8 h-8 rounded-full border-2 border-cyan-400/20 border-t-cyan-400 animate-spin" />
              <span className="text-xs font-mono tracking-widest">LOADING ASSETS DATABASE...</span>
            </div>
          ) : assets.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center gap-6 border border-dashed border-white/5 rounded-2xl bg-slate-950/10">
              <div className="w-16 h-16 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center text-slate-500">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
                </svg>
              </div>
              <div className="text-center space-y-1.5">
                <p className="text-sm font-semibold text-white">No assets uploaded yet</p>
                <p className="text-xs text-slate-400 max-w-sm font-light">Get started by uploading presentation media.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="py-2.5 px-5 text-xs font-mono border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 rounded-xl transition-all duration-200 cursor-pointer"
              >
                Upload First File
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    <th className="pb-4 font-semibold w-16">Preview</th>
                    <th className="pb-4 font-semibold">Name</th>
                    <th className="pb-4 font-semibold hidden md:table-cell">Type</th>
                    <th className="pb-4 font-semibold">Size</th>
                    <th className="pb-4 font-semibold hidden sm:table-cell">Uploaded At</th>
                    <th className="pb-4 font-semibold text-center">Pipeline</th>
                    <th className="pb-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {assets.map((asset) => {
                    const assignedPipelines = groups
                      .filter((group) => isAssetInPipeline(group, asset.id))
                      .map((group) =>
                        activeAssetIdForGroup(group) === asset.id ? `${group.displayName}*` : group.displayName,
                      );

                    return (
                    <tr key={asset.id} className="group hover:bg-white/[0.01] transition-colors">
                      <td className="py-4 pr-4">
                        {asset.type.startsWith("image/") ? (
                          <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-white/10 bg-slate-950">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
                          </div>
                        ) : asset.type === "application/pdf" ? (
                          <div className="w-12 h-12 rounded-lg border border-white/10 bg-purple-500/10 flex items-center justify-center text-purple-400">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          </div>
                        ) : asset.type.startsWith("video/") ? (
                          <div className="w-12 h-12 rounded-lg border border-white/10 bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-lg border border-white/10 bg-slate-800/40 flex items-center justify-center text-slate-400">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                        )}
                      </td>
                      <td className="py-4 pr-4">
                        <div className="font-medium text-white max-w-[180px] truncate" title={asset.name}>{asset.name}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5 max-w-[180px] truncate" title={asset.url}>{asset.url}</div>
                      </td>
                      <td className="py-4 pr-4 text-slate-300 hidden md:table-cell">
                        <span className="text-xs font-mono bg-slate-800/30 px-2 py-0.5 border border-white/5 rounded text-slate-400">{asset.type}</span>
                      </td>
                      <td className="py-4 pr-4 text-slate-300 font-mono text-xs">{formatBytes(asset.size)}</td>
                      <td className="py-4 pr-4 text-slate-400 text-xs hidden sm:table-cell">{new Date(asset.uploadedAt).toLocaleString()}</td>
                      <td className="py-4 px-2">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {groups.map((group, idx) => {
                            const palette = paletteFor(idx);
                            const inPipeline = isAssetInPipeline(group, asset.id);
                            const isActive = activeAssetIdForGroup(group) === asset.id;
                            const abbr = abbreviate(group.displayName);

                            return (
                              <button
                                key={group.id}
                                onClick={() => void handleTogglePipelineAsset(group, asset)}
                                title={
                                  inPipeline
                                    ? `Assigned to ${group.displayName}. Click to make active.`
                                    : `Add to ${group.displayName} pipeline`
                                }
                                className={`px-2.5 py-1.5 rounded-xl text-[10px] font-mono font-bold tracking-wider transition-all duration-200 border cursor-pointer ${
                                  isActive
                                    ? `${palette.glowColor} border-transparent text-slate-950 shadow-lg`
                                    : inPipeline
                                    ? `${palette.badgeBg} ${palette.badgeBorder} ${palette.badgeText} hover:opacity-80`
                                    : `bg-transparent border-white/10 ${palette.color}/60 hover:${palette.color} hover:border-white/20`
                                }`}
                              >
                                {isActive ? `${abbr}*` : abbr}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-2 text-center text-[10px] font-mono text-slate-500">
                          {assignedPipelines.length > 0
                            ? `ASSIGNED: ${assignedPipelines.join(", ")}`
                            : "UNASSIGNED"}
                        </div>
                      </td>
                      <td className="py-4 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          <a
                            href={asset.downloadUrl ?? asset.url}
                            target="_blank"
                            rel="noreferrer"
                            title="Open file in new tab"
                            className="p-2 rounded-lg border border-white/5 bg-slate-900/40 text-slate-400 hover:text-teal-400 hover:border-teal-500/20 transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                          <button
                            onClick={() => setAssetToDelete(asset)}
                            title="Delete file"
                            className="p-2 rounded-lg border border-white/5 bg-slate-900/40 text-rose-500 hover:text-rose-400 hover:border-rose-500/25 transition-all cursor-pointer"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Pipelines Controller Section */}
        <section className="space-y-6 pb-10">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Active Presentation Pipelines</h2>
            <p className="text-xs text-slate-400 font-light mt-1">
              Drag and drop cards to reorder slides. Click any card to set it as the active display index.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            {groups.map((group, idx) => {
              const palette = paletteFor(idx);
              const enabledItems = group.items.filter((item) => item.enabled);
              const activeItem = enabledItems.find((item) => item.id === group.activeItemId) ?? null;
              const activeIdx = activeItem ? enabledItems.indexOf(activeItem) : -1;
              const isOpen = openGroups[group.id] ?? true;

              return (
              <div key={group.id} className="p-6 bg-slate-900/10 backdrop-blur-xl border border-white/5 rounded-3xl space-y-4">
                {/* Pipeline header */}
                <div
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [group.id]: !isOpen }))}
                  className="flex justify-between items-center cursor-pointer select-none group/hdr hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${palette.glowColor} animate-pulse`} />
                    <span className={`text-sm font-mono font-bold tracking-wider ${palette.color} uppercase`}>
                      {group.displayName}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-xs font-mono ${palette.badgeBg} ${palette.badgeText} border ${palette.badgeBorder} px-2 py-0.5 rounded`}>
                      ACTIVE: {activeIdx !== -1 ? activeItem?.asset.name : "NONE"}
                    </span>
                    <svg
                      className={`w-4 h-4 text-slate-500 ${palette.activeColor} transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Slide cards */}
                {isOpen && (
                  <div className="flex gap-4 overflow-x-auto pb-3">
                    {enabledItems.length === 0 ? (
                      <p className="text-xs text-slate-500 font-mono py-6">
                        No assets assigned yet. Use the pipeline buttons above to add some.
                      </p>
                    ) : (
                      enabledItems.map((item, slideIdx) => {
                      const isActive = activeIdx === slideIdx;
                      const isDraggingThis = draggedSlide?.groupId === group.id && draggedSlide.index === slideIdx;
                      const asset = item.asset;
                      const fileName = asset.name;
                      const slideUrl = asset.inlineUrl ?? asset.url;
                      const isVideoSlide = asset.mediaType === "VIDEO" || asset.type.startsWith("video/");

                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={() => handleSlideDragStart(group.id, slideIdx)}
                          onDragOver={(e) => handleSlideDragOver(e, slideIdx)}
                          onDragEnd={handleSlideDragEnd}
                          onDrop={() => void handleSlideDrop(group, slideIdx)}
                          className="flex flex-col gap-1.5 shrink-0 relative"
                        >
                          {/* Drag insert indicator */}
                          {draggedSlide && draggedSlide.groupId === group.id && dragOverSlideIndex === slideIdx && draggedSlide.index !== slideIdx && (
                            <div
                              className={`absolute top-0 bottom-0 w-1 rounded-full animate-pulse z-30 ${
                                draggedSlide.index > slideIdx ? "left-0 -translate-x-1" : "right-0 translate-x-1"
                              }`}
                              style={{ backgroundColor: palette.indicatorColor, boxShadow: `0 0 10px ${palette.indicatorColor}` }}
                            />
                          )}

                          <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] font-mono font-bold text-slate-500">INDEX {slideIdx + 1}</span>
                          </div>

                          <div
                            onClick={() => void handleActivateSlide(group, item, slideIdx)}
                            className={`w-44 border rounded-2xl overflow-hidden p-2 flex flex-col gap-2.5 transition-all duration-300 transform select-none cursor-grab active:cursor-grabbing ${
                              isDraggingThis
                                ? `opacity-20 border-dashed scale-95`
                                : isActive
                                ? `${palette.borderActive} ${palette.bgActive} ${palette.shadowActive} -translate-y-1`
                                : "border-white/10 bg-slate-950/60 hover:border-white/20 hover:bg-slate-950/80 hover:-translate-y-0.5"
                            }`}
                            style={isDraggingThis ? { borderColor: palette.indicatorColor } : {}}
                          >
                            {/* Slide Viewport */}
                            <div className="relative aspect-[16/10] w-full rounded-lg overflow-hidden border border-white/5 bg-slate-900 flex items-center justify-center">
                              <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.15)_50%,rgba(0,0,0,0)_50%)] bg-[size:100%_4px] pointer-events-none z-10" />
                              {isVideoSlide ? (
                                <div className="flex flex-col items-center justify-center gap-1 text-slate-500 w-full h-full bg-slate-900">
                                  <svg className="w-8 h-8 text-cyan-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                  <span className="text-[9px] font-mono text-slate-500">VIDEO</span>
                                </div>
                              ) : (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={slideUrl}
                                  alt={fileName || "Slide"}
                                  className="w-full h-full object-cover pointer-events-none"
                                />
                              )}
                            </div>

                            {/* Name and active badge */}
                            <div className="flex justify-between items-center px-0.5 pb-0.5">
                              <span className="text-[10px] font-mono font-bold text-slate-300 truncate max-w-[100px]" title={fileName}>
                                {fileName}
                              </span>
                              {isActive && (
                                <span className={`text-[9px] font-mono font-bold ${palette.badgeText} ${palette.badgeBg} px-1.5 py-0.5 rounded border ${palette.badgeBorder} shrink-0`}>
                                  ACTIVE
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                      })
                    )}
                  </div>
                )}
              </div>
              );
            })}

            {/* Add More Field */}
            <button
              type="button"
              onClick={() => setIsAddFieldModalOpen(true)}
              className="flex items-center justify-center gap-2 py-5 px-6 text-xs font-mono font-bold tracking-wider text-slate-400 hover:text-cyan-400 border-2 border-dashed border-white/10 hover:border-cyan-500/30 rounded-3xl transition-all duration-200 hover:bg-cyan-500/5 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              ADD MORE FIELD
            </button>
          </div>
        </section>
      </div>

      {/* Upload Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#040710]/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div
            className="w-full max-w-xl bg-slate-950 border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <div>
                <h3 className="text-lg font-bold text-white">Upload Assets</h3>
                <p className="text-xs text-slate-400 font-light mt-0.5">Select or drop multiple presentation files.</p>
              </div>
              <button
                onClick={() => { if (!isUploading) { setIsModalOpen(false); setUploadFiles([]); } }}
                disabled={isUploading}
                className="p-2 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-30"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Drag & Drop Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 text-center cursor-pointer transition-all duration-200 ${
                isDragging
                  ? "border-cyan-400 bg-cyan-950/15"
                  : "border-white/10 bg-slate-900/20 hover:border-white/20 hover:bg-slate-900/40"
              } ${isUploading ? "pointer-events-none opacity-50" : ""}`}
            >
              <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
              <div className="w-12 h-12 rounded-full bg-slate-900 border border-white/5 flex items-center justify-center text-slate-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">Drag and drop files here</p>
                <p className="text-xs text-slate-400 mt-1 font-light">
                  or <span className="text-cyan-400 font-semibold underline decoration-cyan-400/35 hover:text-cyan-300">browse local files</span>
                </p>
              </div>
              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">SUPPORTS MULTIPLE FILES</p>
            </div>

            {/* Selected File List */}
            {uploadFiles.length > 0 && (
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Selected Files ({uploadFiles.length})</p>
                <div className="space-y-2">
                  {uploadFiles.map((uf, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 border border-white/5 text-xs text-slate-300">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {uf.status === "uploading" ? (
                          <div className="w-4 h-4 rounded-full border border-cyan-400/25 border-t-cyan-400 animate-spin" />
                        ) : uf.status === "success" ? (
                          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : uf.status === "error" ? (
                          <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-white" title={uf.file.name}>{uf.file.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">{formatBytes(uf.file.size)}</p>
                        </div>
                      </div>
                      {!isUploading && uf.status === "pending" && (
                        <button
                          onClick={() => removeUploadFile(index)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-all cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex gap-3 justify-end pt-2 border-t border-white/5">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => { setIsModalOpen(false); setUploadFiles([]); }}
                className="py-3 px-5 text-xs font-mono font-bold tracking-wider rounded-xl border border-white/5 hover:border-white/10 text-slate-400 hover:text-white transition-all cursor-pointer disabled:opacity-40"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isUploading || uploadFiles.length === 0}
                onClick={handleUploadSubmit}
                className="py-3 px-5 text-xs font-mono font-bold tracking-wider rounded-xl bg-cyan-400 hover:bg-cyan-300 text-[#070b14] transition-all shadow-[0_0_20px_rgba(34,211,238,0.15)] disabled:opacity-30 disabled:shadow-none cursor-pointer"
              >
                {isUploading ? "UPLOADING..." : "UPLOAD FILES"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Field Modal */}
      {isAddFieldModalOpen && (
        <div
          className="fixed inset-0 bg-[#040710]/85 backdrop-blur-md flex items-center justify-center z-50 p-4"
          onClick={closeAddFieldModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-field-title"
            className="w-full max-w-md bg-slate-950 border border-white/10 rounded-3xl p-6 md:p-7 shadow-2xl flex flex-col gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <div>
                <h3 id="add-field-title" className="text-lg font-bold text-white">Add New Field</h3>
                <p className="text-xs text-slate-400 font-light mt-0.5">
                  Creates a new pipeline here and on the control center automatically.
                </p>
              </div>
              <button
                onClick={closeAddFieldModal}
                disabled={isAddingField}
                className="p-2 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-30"
                aria-label="Close add field dialog"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Field Name</label>
              <input
                type="text"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="e.g. Testimonials"
                disabled={isAddingField}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddField();
                }}
                autoFocus
                className="w-full py-3 px-4 text-sm rounded-xl bg-slate-900/50 border border-white/10 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Content Type</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={isAddingField}
                  onClick={() => setNewFieldKind("PAGE_SEQUENCE")}
                  className={`flex-1 py-2.5 px-4 text-xs font-mono font-bold rounded-xl border transition-all cursor-pointer ${
                    newFieldKind === "PAGE_SEQUENCE"
                      ? "bg-cyan-400/10 border-cyan-400/60 text-cyan-300"
                      : "border-white/10 text-slate-400 hover:border-white/20"
                  }`}
                >
                  IMAGE / PDF SLIDES
                </button>
                <button
                  type="button"
                  disabled={isAddingField}
                  onClick={() => setNewFieldKind("VIDEO")}
                  className={`flex-1 py-2.5 px-4 text-xs font-mono font-bold rounded-xl border transition-all cursor-pointer ${
                    newFieldKind === "VIDEO"
                      ? "bg-cyan-400/10 border-cyan-400/60 text-cyan-300"
                      : "border-white/10 text-slate-400 hover:border-white/20"
                  }`}
                >
                  VIDEO
                </button>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2 border-t border-white/5">
              <button
                type="button"
                disabled={isAddingField}
                onClick={closeAddFieldModal}
                className="py-3 px-5 text-xs font-mono font-bold tracking-wider rounded-xl border border-white/5 hover:border-white/10 text-slate-400 hover:text-white transition-all cursor-pointer disabled:opacity-40"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isAddingField || !newFieldName.trim()}
                onClick={() => void handleAddField()}
                className="py-3 px-5 text-xs font-mono font-bold tracking-wider rounded-xl bg-cyan-400 hover:bg-cyan-300 text-[#070b14] transition-all shadow-[0_0_20px_rgba(34,211,238,0.15)] disabled:opacity-30 disabled:shadow-none cursor-pointer"
              >
                {isAddingField ? "ADDING..." : "ADD FIELD"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {assetToDelete && (
        <div
          className="fixed inset-0 bg-[#040710]/85 backdrop-blur-md flex items-center justify-center z-50 p-4"
          onClick={closeDeleteModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-asset-title"
            className="w-full max-w-md bg-slate-950 border border-rose-500/20 rounded-3xl p-6 md:p-7 shadow-2xl flex flex-col gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/5">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12V16.5zm-7.794 1.52h15.588c1.54 0 2.502-1.667 1.732-3L13.732 4.5c-.77-1.333-2.694-1.333-3.464 0L2.474 15.02c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 id="delete-asset-title" className="text-lg font-bold text-white">Delete Asset</h3>
                  <p className="text-xs text-slate-400 font-light mt-0.5">This removes the file from the repository and active pipelines.</p>
                </div>
              </div>
              <button
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="p-2 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-30"
                aria-label="Close delete confirmation"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="rounded-2xl bg-slate-900/40 border border-white/5 p-4">
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Selected Asset</p>
              <p className="mt-2 text-sm font-semibold text-white break-words">{assetToDelete.name}</p>
              <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-slate-400">
                <span className="px-2 py-0.5 rounded border border-white/5 bg-slate-800/40">{assetToDelete.type}</span>
                <span>{formatBytes(assetToDelete.size)}</span>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={closeDeleteModal}
                className="py-3 px-5 text-xs font-mono font-bold tracking-wider rounded-xl border border-white/5 hover:border-white/10 text-slate-400 hover:text-white transition-all cursor-pointer disabled:opacity-40"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleDelete()}
                className="py-3 px-5 text-xs font-mono font-bold tracking-wider rounded-xl bg-rose-500 hover:bg-rose-400 text-white transition-all shadow-[0_0_20px_rgba(244,63,94,0.15)] disabled:opacity-40 disabled:shadow-none cursor-pointer"
              >
                {isDeleting ? "DELETING..." : "DELETE ASSET"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
