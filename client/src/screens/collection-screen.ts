/**
 * collection-screen.ts
 *
 * Displays the player's card collection with search, filters and paging.
 * Allows opening a detailed card modal and handles UI interactions for the
 * collection view. This file provides a web component registered as
 * `<collection-screen>`.
 */

import "../ui/avatar-button";
import "../ui/shop-button";
import "../components/app-footer";
import "../ui/card/tl-card";

import type {MatchCard} from "../ui/types/card-types";
import {debug, error, warn} from "../core/log";
import {buildStats} from "../ui/card/card-utils";
import {getToken} from "../auth/auth.js";

const PAGE_SIZE = 8;

type CollectionCard = MatchCard & {
    level: number;
    owned: number;
    nftOwned: number;
};

class CollectionScreen extends HTMLElement {
        private cards: CollectionCard[] = [];
        private allCards: CollectionCard[] = [];
        private filtered: CollectionCard[] = [];
        private activeFilter: CollectionCard["type"] | "all" = "all";
        private page = 0;
        private loadError: string | null = null;
        private searchTerm = "";
        private shouldRefocusSearch = false;
        private hasAuth = false;
        private statusMsg: string | null = null;
        private isSyncing = false;
        private refreshTimer: number | null = null;
        private refreshHandler = () => { void this.loadOwnership(); };

        connectedCallback() {
            void this.load();
            this.startAutoRefresh();
            document.addEventListener("collection:refresh", this.refreshHandler);
        }

        disconnectedCallback() {
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
                this.refreshTimer = null;
            }
            document.removeEventListener("collection:refresh", this.refreshHandler);
        }

        private startAutoRefresh() {
            if (this.refreshTimer) return;
            // Refresh every 45s when authenticated
            this.refreshTimer = window.setInterval(() => {
                if (this.hasAuth) void this.loadOwnership();
            }, 45000);
        }

        private async load() {
            try {
                const API = (window as any).__CFG__.API_URL;
                const res = await fetch(`${API}/cards`);
                const data = await res.json().catch(() => null);

                if (!res.ok || !data?.ok || !Array.isArray(data.cards)) {
                    const serverMsg = "Failed to load cards";
                    error(serverMsg, {status: res.status, data});
                    this.cards = [];
                    this.filtered = [];
                    this.allCards = [];
                    this.loadError = serverMsg;
                    this.render();
                    return;
                }

                const all = data.cards.map((c: any): CollectionCard => ({
                    id: c.id,
                    name: c.name,
                    description: c.description ?? "",
                    type: (typeof c.type === "string" ? c.type.toLowerCase() : "attack") as CollectionCard["type"],
                    rarity: c.rarity ?? "common",
                    image: c.image ?? "",
                    cost: c.cost ?? 0,
                    baseDamage: c.baseDamage ?? null,
                    baseHpBonus: c.baseHpBonus ?? null,
                    baseDpsBonus: c.baseDpsBonus ?? null,
                    economyBonus: c.economyBonus ?? null,
                    buffMultiplier: c.buffMultiplier ?? null,
                    config: c.config ?? {},
                    level: 1,
                    owned: 0,
                    nftOwned: 0,
                    // optional: carry collectible from backend (default true)
                    // @ts-ignore if not in type
                    collectible: c.collectible ?? true,
                }));

                this.allCards = all;
                debug("[collection-screen] loaded cards:", this.allCards.map(c => c.id));

                // Only show collectible ones in the grid
                // @ts-ignore – if collectible isn't in CollectionCard, you can define it there
                this.cards = all.filter((c: any) => c.collectible !== false);

                this.filtered = this.cards;
                this.loadError = null;
                this.hasAuth = !!getToken();
                this.render();

                // Fetch owned counts (DB + NFT) if authenticated
                void this.loadOwnership();
            } catch (e) {
                error("Failed to load cards", e);
                this.cards = [];
                this.filtered = [];
                this.allCards = [];
                this.loadError = "Unable to load cards.";
                this.render();
            }
        }


        private openCardDetail(card: CollectionCard) {
            const overlay = document.createElement("div");
            overlay.className = "card-detail-overlay";

            const inner = document.createElement("div");
            inner.className = "card-detail-inner";

            const main = document.createElement("tl-card");
            main.setAttribute("name", card.name);
            main.setAttribute("cost", String(card.cost));
            main.setAttribute("type", card.type);
            main.setAttribute("rarity", card.rarity);
            main.setAttribute("image", card.image);
            main.setAttribute("description", card.description);
            main.setAttribute("stats", buildStats(card));
            main.classList.add("detail-card");

            const target = String((card.config as any)?.target ?? "").toLowerCase();

            if (target === "marry_proposal") {
                const spawnId =
                    (card.config as any).spawnCardId ?? "marry_refusal";

                const pool = (this.allCards && this.allCards.length > 0)
                    ? this.allCards
                    : this.cards;

                const spawned = pool.find((c) => c.id === spawnId);

                if (!spawned) {
                    warn("Spawn card not found", {spawnId, poolSize: pool.length});
                    inner.appendChild(main);
                } else {
                    const stack = document.createElement("div");
                    stack.className = "card-detail-stack ultimatum-stack";
                    main.classList.add("detail-card-front");

                    const spawnedEl = document.createElement("tl-card");
                    spawnedEl.setAttribute("name", spawned.name);
                    spawnedEl.setAttribute("cost", String(spawned.cost));
                    spawnedEl.setAttribute("type", spawned.type);
                    spawnedEl.setAttribute("rarity", spawned.rarity);
                    spawnedEl.setAttribute("image", spawned.image);
                    spawnedEl.setAttribute("description", spawned.description);
                    spawnedEl.setAttribute("stats", buildStats(spawned));
                    spawnedEl.classList.add("detail-card", "detail-card-back", "refusal-card");

                    stack.appendChild(main);
                    stack.appendChild(spawnedEl);
                    inner.appendChild(stack);

                    const label = document.createElement("div");
                    label.className = "linked-card-label";
                    label.textContent = "Refusal lurks behind. Tap a card to reveal who takes the stage.";
                    inner.appendChild(label);

                    stack.addEventListener("click", (ev) => {
                        const target = ev.target as HTMLElement | null;
                        if (!target?.closest("tl-card")) return;
                        stack.classList.toggle("swapped");
                    });
                }

                inner.classList.add("ultimatum-detail");
            } else {
                inner.appendChild(main);
            }

            overlay.appendChild(inner);

            overlay.addEventListener("click", (ev) => {
                if (ev.target === overlay) {
                    overlay.remove();
                }
            });

            const onKey = (ev: KeyboardEvent) => {
                if (ev.key === "Escape") {
                    overlay.remove();
                    window.removeEventListener("keydown", onKey);
                }
            };
            window.addEventListener("keydown", onKey);

            document.body.appendChild(overlay);
        }


        private render() {
            const totalPages = Math.max(1, Math.ceil(this.filtered.length / PAGE_SIZE));
            if (this.page > totalPages - 1) this.page = totalPages - 1;
            if (this.page < 0) this.page = 0;

            const pageCards = this.filtered.slice(
                this.page * PAGE_SIZE,
                this.page * PAGE_SIZE + PAGE_SIZE
            );

            const isEmpty = this.filtered.length === 0;

            const placeholderCount = isEmpty
                ? PAGE_SIZE
                : Math.max(0, PAGE_SIZE - pageCards.length);

            const FILTERS: Array<CollectionCard["type"] | "all"> = [
                "all",
                "attack",
                "defense",
                "buff",
                "economy",
            ];

            this.innerHTML = `
<style>
  .card-slot { position: relative; }
  .owned-chip { position: absolute; right: 8px; bottom: 8px; background: rgba(15,23,42,0.92); color: #e2e8f0; font-size: 12px; font-weight: 600; padding: 6px 10px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.25); }
  .owned-chip.count { color: #e2e8f0; }
  .owned-chip.missing { top: 8px; bottom: auto; background: rgba(148,163,184,0.9); color: #0f172a; font-weight: 600; }
</style>
<div class="screens vh-100">

  <div class="home-center center-content collection-screen">

    <h1 class="text-lg font-semibold text-gray-800 mb-2">Collection</h1>

    <p class="w-full max-w-md text-xs text-gray-500 mb-2">
      Browse your cards, search or filter by category.
    </p>
    ${this.hasAuth ? `
      <div class="w-full max-w-md flex items-center gap-2 mb-2">
        <button id="btn-sync" class="btn btn-primary ${this.isSyncing ? "opacity-60 cursor-not-allowed" : ""}" ${this.isSyncing ? "disabled" : ""}>
          ${this.isSyncing ? "Syncing wallet..." : "Sync wallet"}
        </button>
        <button id="btn-refresh" class="btn btn-secondary ${this.isSyncing ? "opacity-60 cursor-not-allowed" : ""}" ${this.isSyncing ? "disabled" : ""}>
          Refresh collection
        </button>
        <div class="text-xs ${this.statusMsg ? "text-emerald-700" : "text-gray-500"}">${this.statusMsg ?? ""}</div>
      </div>` : ""}

    ${
                this.loadError
                    ? `<div class="w-full max-w-md text-xs text-red-600 mb-2">${this.loadError}</div>`
                    : ""
            }

    <!-- search -->
    <div class="w-full max-w-md mb-2">
      <div class="field search-field">
        <div class="field-inner">
          <input id="search" class="field-input" placeholder=" " value="${this.searchTerm}"/>
          <label for="search" class="field-label">Search</label>
        </div>
      </div>
    </div>

    <!-- filters -->
    <div class="card-filter-selection">
        ${FILTERS
                .map((t) => {
                    const label = t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1);
                    const isActive = this.activeFilter === t;
                    return `
        <button
          data-filter="${t}"
          class="pill collection-filter ${isActive ? "pill-ok active-filter" : ""}">
          ${label}
        </button>`;
                })
                .join("")}
    </div>

     <!-- paged card grid + overlay -->
    <div class="card-page-grid-wrapper">
      <div class="card-page-grid">
        ${
                isEmpty
                    ? Array.from({length: placeholderCount})
                        .map(
                            () => `
            <tl-card
              class="placeholder-card"
              name=""
              cost="0"
              type="attack"
              rarity="common"
              image=""
              description=""
              stats="">
            </tl-card>
          `
                        )
                        .join("")
                    : `
          ${pageCards
                        .map(
                            (c) => {
                                const totalOwned = c.owned ?? 0;
                                const nftOwned = c.nftOwned ?? 0;
                                const hasAny = totalOwned > 0 || nftOwned > 0;
                                const badge = hasAny
                                    ? `<div class="owned-chip count">x${totalOwned}${nftOwned > 0 ? ` · NFT ${nftOwned}` : ""}</div>`
                                    : `<div class="owned-chip missing">Not owned</div>`;
                                return `
            <div class="card-slot" data-card-id="${c.id}">
              <tl-card
                name="${c.name}"
                cost="${c.cost}"
                type="${c.type}"
                rarity="${c.rarity}"
                image="${c.image}"
                description="${c.description}"
                stats="${buildStats(c)}">
              </tl-card>
              ${badge}
            </div>
          `;
                            }
                        )
                        .join("")}
          ${Array.from({length: placeholderCount})
                        .map(
                            () => `
            <tl-card
              class="placeholder-card"
              name=""
              cost="0"
              type="attack"
              rarity="common"
              image=""
              description=""
              stats="">
            </tl-card>
          `
                        )
                        .join("")}
        `
            }
      </div>

      ${
                isEmpty && !this.loadError
                    ? `
        <div class="card-empty-msg">
          No cards match your filters.
        </div>
      `
                    : ""
            }
    </div>

     <!-- page controls -->
    <div class="card-page-controls w-full max-w-4xl mx-auto mt-2 flex items-center">
      <span class="ml-auto text-xs text-gray-500">
        Page ${Math.min(this.page + 1, totalPages)} / ${totalPages}
      </span>
    </div>

  </div>
    <!-- Left arrow -->
    <button
        id="prev"
        class="btn btn-primary btn-arrow card-page-control-l ${this.page === 0 ? "btn-disabled" : ""}"
        ${this.page === 0 ? "disabled" : ""}>
            &#x25C0;
    </button>
    
    <!-- Right arrow -->
    <button
        id="next"
        class="btn btn-primary btn-arrow card-page-control-r ${this.page >= totalPages - 1 ? "btn-disabled" : ""}"
        ${this.page >= totalPages - 1 ? "disabled" : ""}>
            &#x25B6;
    </button>

  <button id="btn-back" class="btn btn-secondary btn-bot-ml">Back</button>
  <button id="btn-to-deck" class="btn btn-primary btn-bot-r mr-10">Play</button>
  <tl-avatar-button></tl-avatar-button>
  <tl-shop-button></tl-shop-button>
  <app-footer></app-footer>
</div>
`;
            this.bind();
        }

        private bind() {
            this.qs("#btn-back")?.addEventListener("click", () => {
                this.dispatchEvent(new CustomEvent("nav:back", {bubbles: true}));
            });

            this.qs("#btn-to-deck")?.addEventListener("click", () => {
                this.dispatchEvent(new CustomEvent("nav:deck", {bubbles: true}));
            });

            const syncBtn = this.qs("#btn-sync") as HTMLButtonElement | null;
            syncBtn?.addEventListener("click", () => {
                void this.syncWallet();
            });
            const refreshBtn = this.qs("#btn-refresh") as HTMLButtonElement | null;
            refreshBtn?.addEventListener("click", () => {
                this.statusMsg = "Refreshing...";
                this.render();
                void this.loadOwnership();
            });

            const search = this.qs("#search") as HTMLInputElement | null;
            search?.addEventListener("input", (e) => {
                this.searchTerm = (e.target as HTMLInputElement).value;
                this.shouldRefocusSearch = true;
                this.applyFilters();
            });

            this.querySelectorAll<HTMLButtonElement>(".collection-filter").forEach((btn) => {
                btn.addEventListener("click", () => {
                    this.activeFilter = btn.dataset.filter as CollectionCard["type"] | "all";
                    this.page = 0;
                    this.applyFilters();
                });
            });

            this.qs("#prev")?.addEventListener("click", () => {
                if (this.page > 0) {
                    this.page--;
                    this.render();
                }
            });

            this.qs("#next")?.addEventListener("click", () => {
                const totalPages = Math.ceil(this.filtered.length / PAGE_SIZE) || 1;
                if (this.page < totalPages - 1) {
                    this.page++;
                    this.render();
                }
            });

            const grid = this.qs(".card-page-grid") as HTMLElement | null;
            grid?.addEventListener("click", (e) => {
                const target = e.target as HTMLElement | null;
                if (!target) return;

                const cardEl = target.closest(".card-slot") as HTMLElement | null;
                if (!cardEl) return;
                if (cardEl.classList.contains("placeholder-card")) return;

                const insideControl =
                    (target.closest("button, a") as HTMLElement | null) !== null;
                if (insideControl) return;

                const cardId = cardEl.getAttribute("data-card-id");
                if (!cardId) return;

                const card = this.cards.find((c) => c.id === cardId);
                if (!card) return;

                this.openCardDetail(card);
            });

            if (this.shouldRefocusSearch) {
                const search = this.qs("#search") as HTMLInputElement | null;
                if (search) {
                    search.focus();
                    const len = search.value.length;
                    search.setSelectionRange(len, len);
                }
                this.shouldRefocusSearch = false;
            }
        }

        private applyFilters() {
            const term = this.searchTerm.toLowerCase().trim();

            this.filtered = this.cards.filter((c) => {
                const filterOK =
                    this.activeFilter === "all" || c.type === this.activeFilter;
                const searchOK =
                    !term ||
                    c.name.toLowerCase().includes(term) ||
                    c.description.toLowerCase().includes(term);
                return filterOK && searchOK;
            });

            this.page = 0;
            this.render();
        }

        private async loadOwnership() {
            const token = getToken();
            if (!token) return;
            const API = (window as any).__CFG__.API_URL;
            try {
                const res = await fetch(`${API}/nft/collection`, {
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                });
                const data = await res.json().catch(() => null);
                if (res.ok && data?.ok && Array.isArray(data.cards)) {
                    this.mergeOwnership(data.cards);
                    this.statusMsg = "Synced";
                    this.applyFilters();
                    return;
                }
                error("Failed to load NFT collection", {status: res.status, data});
                this.statusMsg = data?.error || "Refresh failed";
            } catch (err) {
                error("Ownership load failed", err);
                this.statusMsg = "Refresh failed";
            }
            this.render();
         }

        private mergeOwnership(collection: any[]) {
            const byId = new Map<string, any>();
            for (const entry of collection) {
                if (!entry?.cardId) continue;
                byId.set(entry.cardId, entry);
            }
            this.cards = this.cards.map((c) => {
                const owned = byId.get(c.id);
                const nftOwned = owned?.nftQuantity ?? 0;
                const total = owned?.total ?? owned?.dbQuantity ?? c.owned;
                return {...c, owned: total ?? 0, nftOwned};
            });
            this.allCards = this.allCards.map((c) => {
                const owned = byId.get(c.id);
                const nftOwned = owned?.nftQuantity ?? 0;
                const total = owned?.total ?? owned?.dbQuantity ?? c.owned;
                return {...c, owned: total ?? 0, nftOwned};
            });
        }

        private async syncWallet() {
            const token = getToken();
            if (!token) {
                this.statusMsg = "Login with a wallet to sync.";
                this.render();
                return;
            }
            const API = (window as any).__CFG__.API_URL;
            this.isSyncing = true;
            this.statusMsg = "";
            this.render();
            try {
                const walletAddress = await this.getWalletAddress();
                 const res = await fetch(`${API}/nft/sync`, {
                     method: "POST",
                     headers: {
                         "Content-Type": "application/json",
                         "Authorization": `Bearer ${token}`,
                     },
                    body: JSON.stringify(walletAddress ? {walletAddress} : {}),
                 });
                 const data = await res.json().catch(() => null);
                 if (res.ok && data?.ok && Array.isArray(data.cards)) {
                    this.mergeOwnership(data.cards);
                    this.statusMsg = "Wallet synced.";
                    this.applyFilters();
                    return;
                }
                this.statusMsg = data?.error || "Sync failed.";
            } catch (err: any) {
                this.statusMsg = err?.message || "Sync failed.";
            } finally {
                this.isSyncing = false;
                this.render();
            }
        }

        private async getWalletAddress(): Promise<string | null> {
            const eth = (window as any).ethereum;
            if (!eth?.request) return null;
            try {
                const accounts: string[] = await eth.request({method: "eth_accounts"});
                return accounts && accounts[0] ? accounts[0] : null;
            } catch {
                return null;
            }
        }

        private qs(sel: string) {
            return this.querySelector(sel) as HTMLElement | null;
        }
}

customElements.define("collection-screen", CollectionScreen);
