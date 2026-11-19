<script lang="ts">
  import {
    AlertTriangle,
    Bookmark,
    Check,
    ChevronDown,
    ChevronRight,
    Clock,
    Code,
    Copy,
    Download,
    File,
    Folder,
    GitBranch,
    Globe,
    GripVertical,
    History,
    Info,
    Keyboard,
    Layers,
    PanelLeft,
    Plus,
    Save,
    Search,
    Send,
    Settings,
    Trash,
    Upload,
    Users,
    X,
    Zap,
  } from "@lucid/svelte";
  import type { Component } from "svelte";

  export type IconName =
    | "zap"
    | "search"
    | "plus"
    | "chevron-down"
    | "chevron-right"
    | "folder"
    | "send"
    | "clock"
    | "check"
    | "copy"
    | "trash"
    | "globe"
    | "layers"
    | "history"
    | "settings"
    | "users"
    | "grip"
    | "x"
    | "git-branch"
    | "upload"
    | "download"
    | "file"
    | "alert-triangle"
    | "code"
    | "info"
    | "keyboard"
    | "panel-left"
    | "save"
    | "bookmark";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ICONS: Record<IconName, Component<any>> = {
    zap: Zap,
    search: Search,
    plus: Plus,
    "chevron-down": ChevronDown,
    "chevron-right": ChevronRight,
    folder: Folder,
    send: Send,
    clock: Clock,
    check: Check,
    copy: Copy,
    trash: Trash,
    globe: Globe,
    layers: Layers,
    history: History,
    settings: Settings,
    users: Users,
    grip: GripVertical,
    x: X,
    "git-branch": GitBranch,
    upload: Upload,
    download: Download,
    file: File,
    "alert-triangle": AlertTriangle,
    code: Code,
    info: Info,
    keyboard: Keyboard,
    "panel-left": PanelLeft,
    save: Save,
    bookmark: Bookmark,
  };

  let {
    name,
    size = 16,
    class: klass = "",
  }: { name: IconName; size?: number; class?: string } = $props();

  const IconComp = $derived(ICONS[name] ?? Zap);
</script>

<IconComp {size} class={klass} strokeWidth={1.75} aria-hidden="true" />
