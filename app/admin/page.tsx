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
  pipelines?: {
    itemId: string;
    groupId: string;
    slug: string;
    displayName: string;
    position: number;
    active: boolean;
  }[];
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

type PipelineKey = "bhrt" | "video" | "wli" | "usecase";

const pipelineSlug: Record<PipelineKey, string> = {
  bhrt: "bhrt",
  video: "video",
  wli: "what-lies-inside",
  usecase: "use-case",
};

const broadcastChannelName = "rubenius-content";

export default function AdminPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
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

  // Pipeline slide states — named after the actual control-options labels
  const [bhrtSlides, setBhrtSlides] = useState<string[]>([]);
  const [videoSlides, setVideoSlides] = useState<string[]>([]);
  const [wliSlides, setWliSlides] = useState<string[]>([]);
  const [usecaseSlides, setUsecaseSlides] = useState<string[]>([]);

  const [bhrtActiveIdx, setBhrtActiveIdx] = useState<number>(0);
  const [videoActiveIdx, setVideoActiveIdx] = useState<number>(0);
  const [wliActiveIdx, setWliActiveIdx] = useState<number>(0);
  const [usecaseActiveIdx, setUsecaseActiveIdx] = useState<number>(0);

  const [bhrtOpen, setBhrtOpen] = useState<boolean>(true);
  const [videoOpen, setVideoOpen] = useState<boolean>(true);
  const [wliOpen, setWliOpen] = useState<boolean>(true);
  const [usecaseOpen, setUsecaseOpen] = useState<boolean>(true);

  // Drag and drop states for slide reordering
  const [draggedSlide, setDraggedSlide] = useState<{ pipeline: PipelineKey; index: number } | null>(null);
  const [dragOverSlideIndex, setDragOverSlideIndex] = useState<number | null>(null);

  const [groupItems, setGroupItems] = useState<Record<PipelineKey, MediaGroupItem[]>>({
    bhrt: [],
    video: [],
    wli: [],
    usecase: [],
  });

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
  }

  const publishLocalUpdate = (payload: unknown) => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(broadcastChannelName);
    channel.postMessage({ event: "content-updated", payload });
    channel.close();
  };

  const patchPipeline = async (pipeline: PipelineKey, body: unknown) => {
    const response = await fetch(`/api/media-groups/${pipelineSlug[pipeline]}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error("Pipeline update failed");
    }

    return response;
  };

  const applyGroups = (groups: MediaGroup[]) => {
    const nextItems = { bhrt: [], video: [], wli: [], usecase: [] } as Record<PipelineKey, MediaGroupItem[]>;

    for (const pipeline of Object.keys(pipelineSlug) as PipelineKey[]) {
      const group = groups.find((item) => item.slug === pipelineSlug[pipeline]);
      const items = group?.items.filter((item) => item.enabled) ?? [];
      nextItems[pipeline] = items;
      setSlides(pipeline, () => items.map((item) => item.asset.inlineUrl ?? item.asset.url));
      setActiveIdx(pipeline, items.length > 0 ? group?.activeIndex ?? 0 : -1);
    }

    setGroupItems(nextItems);
  };

  const getSlides = (pipeline: PipelineKey) => {
    if (pipeline === "bhrt") return bhrtSlides;
    if (pipeline === "video") return videoSlides;
    if (pipeline === "wli") return wliSlides;
    return usecaseSlides;
  };

  const getActiveIdx = (pipeline: PipelineKey) => {
    if (pipeline === "bhrt") return bhrtActiveIdx;
    if (pipeline === "video") return videoActiveIdx;
    if (pipeline === "wli") return wliActiveIdx;
    return usecaseActiveIdx;
  };

  const setSlides = (pipeline: PipelineKey, updater: (prev: string[]) => string[]) => {
    if (pipeline === "bhrt") setBhrtSlides(updater);
    else if (pipeline === "video") setVideoSlides(updater);
    else if (pipeline === "wli") setWliSlides(updater);
    else setUsecaseSlides(updater);
  };

  const setActiveIdx = (pipeline: PipelineKey, idx: number | ((prev: number) => number)) => {
    if (pipeline === "bhrt") setBhrtActiveIdx(idx as number);
    else if (pipeline === "video") setVideoActiveIdx(idx as number);
    else if (pipeline === "wli") setWliActiveIdx(idx as number);
    else setUsecaseActiveIdx(idx as number);
  };

  const handleTogglePipelineAsset = async (pipeline: PipelineKey, asset: Asset) => {
    const slides = getSlides(pipeline);
    const existingItemIndex = groupItems[pipeline].findIndex((item) => item.asset.id === asset.id);

    try {
      if (existingItemIndex !== -1) {
        setActiveIdx(pipeline, existingItemIndex);
        await patchPipeline(pipeline, {
          activeIndex: existingItemIndex,
          activeItemId: groupItems[pipeline][existingItemIndex]?.id ?? null,
        });
      } else {
        setSlides(pipeline, (prev) => [...prev, asset.url]);
        setActiveIdx(pipeline, slides.length);
        await patchPipeline(pipeline, { addAssetId: asset.id });
      }

      publishLocalUpdate({ groupId: pipelineSlug[pipeline], mediaId: asset.id });
      await fetchGroups();
    } catch {
      showToast("Unable to update pipeline", "error");
    }
  };

  const handleRemovePipelineAsset = async (pipeline: PipelineKey, assetId: string) => {
    try {
      await patchPipeline(pipeline, { removeAssetId: assetId });
      publishLocalUpdate({ groupId: pipelineSlug[pipeline] });
      await fetchGroups();
    } catch {
      showToast("Unable to remove card from pipeline", "error");
    }
  };

  const handleSlideDragStart = (pipeline: PipelineKey, index: number) => {
    setDraggedSlide({ pipeline, index });
  };

  const handleSlideDragOver = (e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    setDragOverSlideIndex(index);
  };

  const handleSlideDragEnd = () => {
    setDraggedSlide(null);
    setDragOverSlideIndex(null);
  };

  const handleSlideDrop = async (pipeline: PipelineKey, targetIndex: number) => {
    if (!draggedSlide || draggedSlide.pipeline !== pipeline) return;
    const sourceIndex = draggedSlide.index;
    if (sourceIndex === targetIndex) return;

    setSlides(pipeline, (prev) => {
      const list = [...prev];
      const [movedItem] = list.splice(sourceIndex, 1);
      list.splice(targetIndex, 0, movedItem);
      return list;
    });

    const activeIndex = getActiveIdx(pipeline);
    let nextActiveIndex = activeIndex;

    if (activeIndex === sourceIndex) {
      nextActiveIndex = targetIndex;
      setActiveIdx(pipeline, targetIndex);
    } else if (activeIndex > sourceIndex && activeIndex <= targetIndex) {
      nextActiveIndex = activeIndex - 1;
      setActiveIdx(pipeline, activeIndex - 1);
    } else if (activeIndex < sourceIndex && activeIndex >= targetIndex) {
      nextActiveIndex = activeIndex + 1;
      setActiveIdx(pipeline, activeIndex + 1);
    }

    handleSlideDragEnd();

    const nextItems = [...groupItems[pipeline]];
    const [movedItem] = nextItems.splice(sourceIndex, 1);
    if (movedItem) nextItems.splice(targetIndex, 0, movedItem);

    try {
      await patchPipeline(pipeline, {
        itemIds: nextItems.map((item) => item.id),
        activeIndex: nextActiveIndex,
        activeItemId: nextItems[nextActiveIndex]?.id ?? null,
      });
      publishLocalUpdate({ groupId: pipelineSlug[pipeline] });
      await fetchGroups();
    } catch {
      showToast("Unable to save slide order", "error");
    }
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
    applyGroups(data);
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

    let hasError = false;

    const getResourceType = (type: string) => {
      if (type.startsWith("image/")) return "image";
      if (type.startsWith("video/")) return "video";
      return "raw";
    };

    for (let i = 0; i < uploadFiles.length; i++) {
      const uf = uploadFiles[i];

      setUploadFiles((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, status: "uploading" } : item))
      );

      try {
        const signRes = await fetch("/api/upload/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder: "media" }),
        });
        if (!signRes.ok) throw new Error("Failed to get signature");
        const signData = await signRes.json();

        const resourceType = getResourceType(uf.file.type || "application/octet-stream");
        const cldFormData = new FormData();
        cldFormData.append("file", uf.file);
        cldFormData.append("api_key", signData.apiKey);
        cldFormData.append("timestamp", signData.timestamp.toString());
        cldFormData.append("signature", signData.signature);
        cldFormData.append("folder", signData.folder);

        const uploadRes = await fetch(
          `https://api.cloudinary.com/v1_1/${signData.cloudName}/${resourceType}/upload`,
          {
            method: "POST",
            body: cldFormData,
          }
        );
        if (!uploadRes.ok) throw new Error("Cloudinary upload failed");
        const uploadData = await uploadRes.json();

        const mediaRes = await fetch("/api/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalName: uf.file.name,
            objectName: uploadData.secure_url,
            contentType: uf.file.type || "application/octet-stream",
            size: uf.file.size,
          }),
        });
        if (!mediaRes.ok) throw new Error("Database registration failed");

        setUploadFiles((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, status: "success" } : item))
        );
      } catch (err) {
        console.error("Upload error for file:", uf.file.name, err);
        hasError = true;
        setUploadFiles((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, status: "error" } : item))
        );
      }
    }

    if (hasError) {
      showToast("Some uploads failed. Please try again.", "error");
    } else {
      showToast(`Successfully uploaded ${uploadFiles.length} file(s)`, "success");
      setTimeout(() => {
        setIsModalOpen(false);
        setUploadFiles([]);
        publishLocalUpdate({ uploaded: true });
        void Promise.all([fetchAssets(), fetchGroups()]);
      }, 800);
    }
    setIsUploading(false);
  };

  const totalSize = assets.reduce((acc, curr) => acc + curr.size, 0);
  const imagesCount = assets.filter((a) => a.type.startsWith("image/")).length;
  const pdfsCount = assets.filter((a) => a.type === "application/pdf").length;
  const activeBhrtAssetId =
    bhrtActiveIdx !== -1 ? assets.find((a) => a.url === bhrtSlides[bhrtActiveIdx])?.id ?? null : null;
  const activeVideoAssetId =
    videoActiveIdx !== -1 ? assets.find((a) => a.url === videoSlides[videoActiveIdx])?.id ?? null : null;
  const activeWliAssetId =
    wliActiveIdx !== -1 ? assets.find((a) => a.url === wliSlides[wliActiveIdx])?.id ?? null : null;
  const activeUsecaseAssetId =
    usecaseActiveIdx !== -1
      ? assets.find((a) => a.url === usecaseSlides[usecaseActiveIdx])?.id ?? null
      : null;
  const isAssetInPipeline = (pipeline: PipelineKey, assetId: string) =>
    groupItems[pipeline].some((item) => item.asset.id === assetId);
  const assetPipelineLabels = (asset: Asset) =>
    asset.pipelines?.length
      ? asset.pipelines.map((pipeline) =>
          pipeline.active ? `${pipeline.displayName}*` : pipeline.displayName,
        )
      : [
          isAssetInPipeline("bhrt", asset.id) ? "BHRT" : null,
          isAssetInPipeline("video", asset.id) ? "Video" : null,
          isAssetInPipeline("wli", asset.id) ? "What lies inside?" : null,
          isAssetInPipeline("usecase", asset.id) ? "USE CASE" : null,
        ].filter(Boolean);

  // Pipeline config for rendering
  const pipelines: {
    key: PipelineKey;
    label: string;
    color: string;
    activeColor: string;
    borderActive: string;
    bgActive: string;
    shadowActive: string;
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
    glowColor: string;
    indicatorColor: string;
    slides: string[];
    activeIdx: number;
    setActiveIdx: (idx: number) => void;
    isOpen: boolean;
    setOpen: (v: boolean) => void;
    activeAssetId: string | null;
    isVideo?: boolean;
  }[] = [
    {
      key: "bhrt",
      label: "BHRT",
      color: "text-amber-400",
      activeColor: "group-hover/hdr:text-amber-400",
      borderActive: "border-amber-500",
      bgActive: "bg-amber-500/5",
      shadowActive: "shadow-[0_0_15px_rgba(245,158,11,0.2)]",
      badgeBg: "bg-amber-500/10",
      badgeBorder: "border-amber-500/20",
      badgeText: "text-amber-400",
      glowColor: "bg-amber-400",
      indicatorColor: "#f59e0b",
      slides: bhrtSlides,
      activeIdx: bhrtActiveIdx,
      setActiveIdx: (idx) => setBhrtActiveIdx(idx),
      isOpen: bhrtOpen,
      setOpen: setBhrtOpen,
      activeAssetId: activeBhrtAssetId,
    },
    {
      key: "video",
      label: "Video",
      color: "text-cyan-400",
      activeColor: "group-hover/hdr:text-cyan-400",
      borderActive: "border-cyan-400",
      bgActive: "bg-cyan-400/5",
      shadowActive: "shadow-[0_0_15px_rgba(6,182,212,0.2)]",
      badgeBg: "bg-cyan-500/10",
      badgeBorder: "border-cyan-400/20",
      badgeText: "text-cyan-400",
      glowColor: "bg-cyan-400",
      indicatorColor: "#22d3ee",
      slides: videoSlides,
      activeIdx: videoActiveIdx,
      setActiveIdx: (idx) => setVideoActiveIdx(idx),
      isOpen: videoOpen,
      setOpen: setVideoOpen,
      activeAssetId: activeVideoAssetId,
      isVideo: true,
    },
    {
      key: "wli",
      label: "What lies inside?",
      color: "text-emerald-400",
      activeColor: "group-hover/hdr:text-emerald-400",
      borderActive: "border-emerald-500",
      bgActive: "bg-emerald-500/5",
      shadowActive: "shadow-[0_0_15px_rgba(16,185,129,0.2)]",
      badgeBg: "bg-emerald-500/10",
      badgeBorder: "border-emerald-500/20",
      badgeText: "text-emerald-400",
      glowColor: "bg-emerald-400",
      indicatorColor: "#10b981",
      slides: wliSlides,
      activeIdx: wliActiveIdx,
      setActiveIdx: (idx) => setWliActiveIdx(idx),
      isOpen: wliOpen,
      setOpen: setWliOpen,
      activeAssetId: activeWliAssetId,
    },
    {
      key: "usecase",
      label: "USE CASE",
      color: "text-purple-400",
      activeColor: "group-hover/hdr:text-purple-400",
      borderActive: "border-purple-500",
      bgActive: "bg-purple-500/5",
      shadowActive: "shadow-[0_0_15px_rgba(168,85,247,0.2)]",
      badgeBg: "bg-purple-500/10",
      badgeBorder: "border-purple-500/20",
      badgeText: "text-purple-400",
      glowColor: "bg-purple-400",
      indicatorColor: "#a855f7",
      slides: usecaseSlides,
      activeIdx: usecaseActiveIdx,
      setActiveIdx: (idx) => setUsecaseActiveIdx(idx),
      isOpen: usecaseOpen,
      setOpen: setUsecaseOpen,
      activeAssetId: activeUsecaseAssetId,
    },
  ];

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
            <p className="text-xs text-slate-400 font-light mt-1">Uploaded files accessible dynamically by BHRT, Video, What lies inside? and USE CASE viewports.</p>
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
                    const isInBhrt = isAssetInPipeline("bhrt", asset.id);
                    const isInVideo = isAssetInPipeline("video", asset.id);
                    const isInWli = isAssetInPipeline("wli", asset.id);
                    const isInUsecase = isAssetInPipeline("usecase", asset.id);
                    const assignedPipelines = assetPipelineLabels(asset);

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
                          <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-white/10 bg-slate-950 flex items-center justify-center">
                            <video src={asset.url} className="w-full h-full object-cover" preload="metadata" muted playsInline />
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
                          {/* BHRT Button */}
                          <button
                            onClick={() => handleTogglePipelineAsset("bhrt", asset)}
                            title={isInBhrt ? "Assigned to BHRT. Click to make active." : "Add to BHRT pipeline"}
                            className={`px-2.5 py-1.5 rounded-xl text-[10px] font-mono font-bold tracking-wider transition-all duration-200 border cursor-pointer ${
                              activeBhrtAssetId === asset.id
                                ? "bg-amber-400 border-amber-400 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                                : isInBhrt
                                ? "bg-amber-400/10 border-amber-400/60 text-amber-300 hover:bg-amber-400/15"
                                : "bg-transparent border-amber-500/20 text-amber-400/60 hover:text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/5"
                            }`}
                          >
                            {activeBhrtAssetId === asset.id ? "BHRT*" : "BHRT"}
                          </button>
                          {/* Video Button */}
                          <button
                            onClick={() => handleTogglePipelineAsset("video", asset)}
                            title={isInVideo ? "Assigned to Video. Click to make active." : "Add to Video pipeline"}
                            className={`px-2.5 py-1.5 rounded-xl text-[10px] font-mono font-bold tracking-wider transition-all duration-200 border cursor-pointer ${
                              activeVideoAssetId === asset.id
                                ? "bg-cyan-400 border-cyan-400 text-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.25)]"
                                : isInVideo
                                ? "bg-cyan-400/10 border-cyan-400/60 text-cyan-300 hover:bg-cyan-400/15"
                                : "bg-transparent border-cyan-500/20 text-cyan-400/60 hover:text-cyan-400 hover:border-cyan-500/40 hover:bg-cyan-500/5"
                            }`}
                          >
                            {activeVideoAssetId === asset.id ? "VID*" : "VID"}
                          </button>
                          {/* WLI Button */}
                          <button
                            onClick={() => handleTogglePipelineAsset("wli", asset)}
                            title={isInWli ? "Assigned to What lies inside?. Click to make active." : "Add to What lies inside? pipeline"}
                            className={`px-2.5 py-1.5 rounded-xl text-[10px] font-mono font-bold tracking-wider transition-all duration-200 border cursor-pointer ${
                              activeWliAssetId === asset.id
                                ? "bg-emerald-400 border-emerald-400 text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.25)]"
                                : isInWli
                                ? "bg-emerald-400/10 border-emerald-400/60 text-emerald-300 hover:bg-emerald-400/15"
                                : "bg-transparent border-emerald-500/20 text-emerald-400/60 hover:text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/5"
                            }`}
                          >
                            {activeWliAssetId === asset.id ? "WLI*" : "WLI"}
                          </button>
                          {/* USE CASE Button */}
                          <button
                            onClick={() => handleTogglePipelineAsset("usecase", asset)}
                            title={isInUsecase ? "Assigned to USE CASE. Click to make active." : "Add to USE CASE pipeline"}
                            className={`px-2.5 py-1.5 rounded-xl text-[10px] font-mono font-bold tracking-wider transition-all duration-200 border cursor-pointer ${
                              activeUsecaseAssetId === asset.id
                                ? "bg-purple-400 border-purple-400 text-slate-950 shadow-[0_0_10px_rgba(168,85,247,0.25)]"
                                : isInUsecase
                                ? "bg-purple-400/10 border-purple-400/60 text-purple-300 hover:bg-purple-400/15"
                                : "bg-transparent border-purple-500/20 text-purple-400/60 hover:text-purple-400 hover:border-purple-500/40 hover:bg-purple-500/5"
                            }`}
                          >
                            {activeUsecaseAssetId === asset.id ? "USE*" : "USE"}
                          </button>
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
            {pipelines.map((pl) => (
              <div key={pl.key} className="p-6 bg-slate-900/10 backdrop-blur-xl border border-white/5 rounded-3xl space-y-4">
                {/* Pipeline header */}
                <div
                  onClick={() => pl.setOpen(!pl.isOpen)}
                  className="flex justify-between items-center cursor-pointer select-none group/hdr hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${pl.glowColor} animate-pulse`} />
                    <span className={`text-sm font-mono font-bold tracking-wider ${pl.color} uppercase`}>
                      {pl.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-xs font-mono ${pl.badgeBg} ${pl.badgeText} border ${pl.badgeBorder} px-2 py-0.5 rounded`}>
                      ACTIVE: {pl.activeIdx !== -1 ? pl.slides[pl.activeIdx]?.split("/").pop() : "NONE"}
                    </span>
                    <svg
                      className={`w-4 h-4 text-slate-500 ${pl.activeColor} transition-transform duration-300 ${pl.isOpen ? "rotate-180" : ""}`}
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
                {pl.isOpen && (
                  <div className="flex gap-4 overflow-x-auto pb-3">
                    {pl.slides.map((slide, idx) => {
                      const isActive = pl.activeIdx === idx;
                      const isDraggingThis = draggedSlide?.pipeline === pl.key && draggedSlide.index === idx;
                      const fileName = slide.split("/").pop();
                      const isVideoSlide = slide.endsWith(".mp4") || slide.endsWith(".webm") || slide.endsWith(".mov");

                      return (
                        <div
                          key={idx}
                          draggable
                          onDragStart={() => handleSlideDragStart(pl.key, idx)}
                          onDragOver={(e) => handleSlideDragOver(e, idx)}
                          onDragEnd={handleSlideDragEnd}
                          onDrop={() => handleSlideDrop(pl.key, idx)}
                          className="flex flex-col gap-1.5 shrink-0 relative"
                        >
                          {/* Drag insert indicator */}
                          {draggedSlide && draggedSlide.pipeline === pl.key && dragOverSlideIndex === idx && draggedSlide.index !== idx && (
                            <div
                              className={`absolute top-0 bottom-0 w-1 rounded-full animate-pulse z-30 ${
                                draggedSlide.index > idx ? "left-0 -translate-x-1" : "right-0 translate-x-1"
                              }`}
                              style={{ backgroundColor: pl.indicatorColor, boxShadow: `0 0 10px ${pl.indicatorColor}` }}
                            />
                          )}

                          <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] font-mono font-bold text-slate-500">INDEX {idx + 1}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const assetId = groupItems[pl.key]?.[idx]?.asset.id;
                                if (assetId) {
                                  void handleRemovePipelineAsset(pl.key, assetId);
                                }
                              }}
                              className="text-slate-500 hover:text-rose-500 transition-colors p-1 rounded hover:bg-white/5 cursor-pointer"
                              title="Remove from pipeline"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>

                          <div
                            onClick={() => pl.setActiveIdx(idx)}
                            className={`w-44 border rounded-2xl overflow-hidden p-2 flex flex-col gap-2.5 transition-all duration-300 transform select-none cursor-grab active:cursor-grabbing ${
                              isDraggingThis
                                ? `opacity-20 border-dashed scale-95`
                                : isActive
                                ? `${pl.borderActive} ${pl.bgActive} ${pl.shadowActive} -translate-y-1`
                                : "border-white/10 bg-slate-950/60 hover:border-white/20 hover:bg-slate-950/80 hover:-translate-y-0.5"
                            }`}
                            style={isDraggingThis ? { borderColor: pl.indicatorColor } : {}}
                          >
                            {/* Slide Viewport */}
                            <div className="relative aspect-[16/10] w-full rounded-lg overflow-hidden border border-white/5 bg-slate-900 flex items-center justify-center">
                              <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.15)_50%,rgba(0,0,0,0)_50%)] bg-[size:100%_4px] pointer-events-none z-10" />
                              {isVideoSlide ? (
                                <video src={slide} className="w-full h-full object-cover pointer-events-none" preload="metadata" muted playsInline />
                              ) : (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={slide}
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
                                <span className={`text-[9px] font-mono font-bold ${pl.badgeText} ${pl.badgeBg} px-1.5 py-0.5 rounded border ${pl.badgeBorder} shrink-0`}>
                                  ACTIVE
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
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
