<script lang="ts">
  import { tick } from "svelte";
  import { splitVars } from "#lib/utils/interpolate";
  import {
    activeEnvKeys,
    allAvailableEnvVarItems,
    getVariableInfo,
    type EnvVarItem,
  } from "./state.svelte";

  let {
    value = $bindable(""),
    placeholder = "",
    ariaLabel = undefined,
    /** The input's full class string (border, bg, rounding, focus, padding,
     *  font, size, text color, sizing). Applied verbatim to BOTH the real input
     *  and the highlight mirror behind it, so their glyphs align exactly. */
    class: cls = "",
    /** Extra layout classes for the positioned wrapper (e.g. `flex-1 min-w-0
     *  h-full` when the input must fill a flex row). */
    containerClass = "",
    spellcheck = false,
    /** Fired after the value settles (native change / picking a suggestion) —
     *  use to persist, e.g. commitCollections. */
    onchange = undefined,
    /** Forwarded input handler (e.g. ensureTrailingRow). */
    oninput = undefined,
    onpaste = undefined,
  }: {
    value?: string;
    placeholder?: string;
    ariaLabel?: string;
    class?: string;
    containerClass?: string;
    spellcheck?: boolean;
    onchange?: () => void;
    oninput?: () => void;
    onpaste?: (e: ClipboardEvent) => void;
  } = $props();

  let inputEl = $state<HTMLInputElement>();
  let mirrorEl = $state<HTMLDivElement>();

  // Colored segments drawn behind the (transparent-text) input. Reactive to the
  // value and the active environment (a token flips brand↔warn when env changes).
  const segments = $derived(splitVars(value));
  const defined = $derived(new Set(activeEnvKeys()));

  // ── `{{var}}` autocomplete ──────────────────────────────────────────────
  let menu = $state<{
    items: EnvVarItem[];
    index: number;
    left: number;
    top: number;
    width: number;
    from: number; // index of the opening "{{"
    to: number; // caret (end of the partial name)
  } | null>(null);

  // ── `{{var}}` hover preview ─────────────────────────────────────────────
  let hoveredVar = $state<{
    name: string;
    value: string | undefined;
    isDefined: boolean;
    envName: string;
    definedInOtherEnvs: string[];
    x: number;
    y: number;
  } | null>(null);

  let hoverRaf = 0;

  // Keep the highlight mirror scrolled in lockstep with the input.
  function syncScroll() {
    if (mirrorEl && inputEl) mirrorEl.scrollLeft = inputEl.scrollLeft;
  }

  /** If the caret sits inside an unterminated `{{…` with a valid partial name,
   *  return the opening position + the typed query; otherwise null. */
  function activeToken(): { from: number; q: string } | null {
    if (!inputEl) return null;
    const caret = inputEl.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const from = before.lastIndexOf("{{");
    if (from === -1) return null;
    const between = before.slice(from + 2);
    // A closing "}}" means we're past the token; only name chars (+ spaces) count.
    if (between.includes("}}") || !/^[\s\w.-]*$/.test(between)) return null;
    return { from, q: between.trim() };
  }

  function refresh() {
    if (!inputEl) return;
    const tok = activeToken();
    if (!tok) {
      menu = null;
      return;
    }
    const q = tok.q.toLowerCase();
    const all = allAvailableEnvVarItems();
    const items = all.filter((item) => item.key.toLowerCase().includes(q));
    if (!items.length) {
      menu = null;
      return;
    }
    const r = inputEl.getBoundingClientRect();
    menu = {
      items,
      index: 0,
      left: r.left,
      top: r.bottom + 2,
      width: Math.max(r.width, 320),
      from: tok.from,
      to: inputEl.selectionStart ?? value.length,
    };
  }

  async function choose(key: string) {
    if (!menu) return;
    const { from, to } = menu;
    const hasClose = value.slice(to, to + 2) === "}}";
    const insert = hasClose ? `{{${key}` : `{{${key}}}`;
    const caret = from + insert.length + (hasClose ? 2 : 0);
    value = value.slice(0, from) + insert + value.slice(to);
    menu = null;
    hoveredVar = null;
    onchange?.();
    await tick();
    inputEl?.focus();
    inputEl?.setSelectionRange(caret, caret);
    syncScroll();
  }

  function onKeydown(e: KeyboardEvent) {
    if (hoveredVar) hoveredVar = null;
    if (!menu) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      menu.index = (menu.index + 1) % menu.items.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      menu.index = (menu.index - 1 + menu.items.length) % menu.items.length;
    } else if ((e.key === "Enter" || e.key === "Tab") && menu.items[menu.index]) {
      e.preventDefault();
      void choose(menu.items[menu.index].key);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      menu = null;
    }
  }

  function onInput() {
    if (hoveredVar) hoveredVar = null;
    oninput?.();
    syncScroll();
    refresh();
  }

  function handleMouseMove(e: MouseEvent) {
    if (menu || !inputEl) {
      if (hoveredVar) hoveredVar = null;
      return;
    }
    cancelAnimationFrame(hoverRaf);
    hoverRaf = requestAnimationFrame(() => {
      if (!inputEl) return;
      inputEl.style.pointerEvents = "none";
      const target = document.elementFromPoint(e.clientX, e.clientY);
      inputEl.style.pointerEvents = "auto";
      const span = target?.closest("[data-var-name]") as HTMLElement | null;
      const varName = span?.getAttribute("data-var-name");
      if (!span || !varName) {
        hoveredVar = null;
        return;
      }
      const rect = span.getBoundingClientRect();
      const info = getVariableInfo(varName);
      const topPos = rect.bottom + 6 + 90 > window.innerHeight ? rect.top - 74 : rect.bottom + 6;
      hoveredVar = {
        name: varName,
        value: info.value,
        isDefined: info.isDefined,
        envName: info.envName,
        definedInOtherEnvs: info.definedInOtherEnvs,
        x: Math.max(12, Math.min(rect.left, window.innerWidth - 320)),
        y: Math.max(12, topPos),
      };
    });
  }

  function handleMouseLeave() {
    cancelAnimationFrame(hoverRaf);
    hoveredVar = null;
  }
</script>

<div class="relative {containerClass}">
  <!-- Highlight mirror: same classes as the input, but text is visible here and
       `{{var}}` tokens are colored. Sits directly behind the transparent input.
       `flex items-center` centers the single line vertically to match how the
       native input centers its text (fields set height via `h-*` with no `py`). -->
  <div
    bind:this={mirrorEl}
    aria-hidden="true"
    class="{cls} pointer-events-none absolute inset-0 flex items-center overflow-hidden"
  >
    <span class="shrink-0 whitespace-pre">
      {#each segments as seg, i (i)}
        {#if seg.name !== undefined}
          <span
            data-var-name={seg.name}
            class="{defined.has(seg.name) ? 'text-brand' : 'text-warn'} rounded-xs"
          >{seg.text}</span>
        {:else}{seg.text}{/if}
      {/each}
    </span>
  </div>
  <input
    bind:this={inputEl}
    bind:value
    {placeholder}
    {spellcheck}
    aria-label={ariaLabel}
    type="text"
    autocomplete="off"
    style="color: transparent; background: transparent; caret-color: var(--color-ink)"
    oninput={onInput}
    onscroll={() => {
      hoveredVar = null;
      syncScroll();
    }}
    onkeydown={onKeydown}
    onfocus={refresh}
    onclick={refresh}
    onmousemove={handleMouseMove}
    onmouseleave={handleMouseLeave}
    onblur={() => {
      menu = null;
      hoveredVar = null;
      onchange?.();
    }}
    {onpaste}
    class="{cls} relative block"
  />
</div>

{#if menu}
  <ul
    role="listbox"
    aria-label="Environment variables"
    style="position: fixed; left: {menu.left}px; top: {menu.top}px; min-width: {menu.width}px; max-width: 440px;"
    class="z-50 max-h-56 overflow-y-auto rounded-lg border border-line bg-panel py-1 shadow-2xl shadow-black/50"
  >
    {#each menu.items as item, i (item.key + item.envName)}
      <li role="option" aria-selected={i === menu.index}>
        <button
          type="button"
          onmousedown={(e) => {
            e.preventDefault();
            void choose(item.key);
          }}
          onmouseenter={() => {
            if (menu) menu.index = i;
          }}
          class="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left font-mono text-xs transition-colors {i ===
          menu.index
            ? 'bg-panel-2 text-ink'
            : 'text-ink-muted'}"
        >
          <div class="flex items-center gap-1 min-w-0">
            <span class={item.isCurrentEnv ? "text-brand" : "text-ink-muted"}>{"{{"}</span>
            <span class="font-semibold text-ink truncate">{item.key}</span>
            <span class={item.isCurrentEnv ? "text-brand" : "text-ink-muted"}>{"}}"}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0 text-11">
            <span class="max-w-[150px] truncate text-ink-muted font-mono" title={item.value}>
              {item.value !== "" ? item.value : "(empty)"}
            </span>
            <span
              class="rounded px-1.5 py-0.5 text-9 font-sans font-semibold tracking-wide border {item.isCurrentEnv
                ? 'border-brand/40 bg-brand/10 text-brand'
                : 'border-line bg-panel text-ink-faint'}"
            >
              {item.envName}
            </span>
          </div>
        </button>
      </li>
    {/each}
  </ul>
{/if}

{#if hoveredVar}
  <div
    role="tooltip"
    style="position: fixed; left: {hoveredVar.x}px; top: {hoveredVar.y}px;"
    class="pointer-events-none z-50 flex max-w-sm flex-col gap-1.5 rounded-lg border border-line bg-panel p-2.5 font-mono text-xs shadow-xl shadow-black/50"
  >
    <div class="flex items-center justify-between gap-3 border-b border-line/60 pb-1.5 font-sans">
      <span class="flex items-center gap-1 font-mono font-semibold text-ink">
        <span class={hoveredVar.isDefined ? "text-brand" : "text-warn"}>{"{{"}</span>{hoveredVar.name}<span class={hoveredVar.isDefined ? "text-brand" : "text-warn"}>{"}}"}</span>
      </span>
      <span
        class="rounded px-1.5 py-0.5 text-10 font-semibold tracking-wide {hoveredVar.isDefined
          ? 'bg-brand/15 text-brand'
          : 'bg-warn/15 text-warn'}"
      >
        {hoveredVar.isDefined ? hoveredVar.envName : "Unresolved"}
      </span>
    </div>

    {#if hoveredVar.isDefined}
      <div class="flex flex-col gap-1">
        <span class="font-sans text-10 uppercase tracking-wider text-ink-faint">Resolved Value</span>
        <div class="max-h-24 overflow-y-auto rounded bg-panel-2 px-2 py-1 text-ink break-all select-all font-mono">
          {hoveredVar.value !== "" ? hoveredVar.value : "(empty string)"}
        </div>
      </div>
    {:else}
      <div class="text-xs text-ink-muted font-sans">
        Not defined in active environment <span class="font-semibold text-ink">“{hoveredVar.envName}”</span>.
      </div>
      {#if hoveredVar.definedInOtherEnvs.length > 0}
        <div class="text-11 text-ink-faint font-sans">
          Found in: <span class="text-brand font-medium">{hoveredVar.definedInOtherEnvs.join(", ")}</span>
        </div>
      {/if}
    {/if}
  </div>
{/if}
