/**
 * shop-modal.ts
 *
 * Simple shop overlay to mint NFT cards or packs via the backend NFT endpoints.
 */

import {getToken} from "../auth/auth.js";

class ShopModal extends HTMLElement {
    private cards: Array<{id: string; name: string}> = [];
    private status = "";
    private isBusy = false;
    private minted: Array<{cardDefinitionId: string; tokenId?: string}> = [];
    private packs: Array<{packId: string}> = [];

    connectedCallback() {
        this.render();
        void this.loadCards();
        void this.loadPacks();
    }

    private async loadCards() {
        try {
            const API = (window as any).__CFG__.API_URL;
            const res = await fetch(`${API}/cards`);
            const data = await res.json().catch(() => null);
            if (res.ok && data?.ok && Array.isArray(data.cards)) {
                this.cards = data.cards.map((c: any) => ({id: c.id, name: c.name}));
                this.render();
            } else {
                this.status = "Failed to load cards";
                this.render();
            }
        } catch (e: any) {
            this.status = e?.message || "Failed to load cards";
            this.render();
        }
    }

    private async loadPacks() {
        const token = getToken();
        if (!token) return;
        try {
            const API = (window as any).__CFG__.API_URL;
            const res = await fetch(`${API}/nft/packs`, {
                headers: {"Authorization": `Bearer ${token}`},
            });
            const data = await res.json().catch(() => null);
            if (res.ok && data?.ok && Array.isArray(data.packs)) {
                this.packs = data.packs;
                this.render();
            }
        } catch {
        }
    }

    private close() {
        this.remove();
    }

    private async mintSingle() {
        if (this.isBusy) return;
        const select = this.querySelector("#card-select") as HTMLSelectElement | null;
        const cardId = select?.value || "";
        if (!cardId) {
            this.status = "Select a card first";
            this.render();
            return;
        }
        const token = getToken();
        if (!token) {
            this.status = "Login with wallet first";
            this.render();
            return;
        }
        this.isBusy = true;
        this.status = "";
        this.render();
        try {
            const API = (window as any).__CFG__.API_URL;
            const res = await fetch(`${API}/nft/mint`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({cardDefinitionId: cardId}),
            });
            const data = await res.json().catch(() => null);
            if (res.ok && data?.ok) {
                this.status = `Minted token ${data.tokenId || ""}`;
                this.dispatchEvent(new CustomEvent("nft:updated", {bubbles: true}));
                void this.loadPacks();
            } else {
                this.status = data?.error || "Mint failed";
            }
        } catch (e: any) {
            this.status = e?.message || "Mint failed";
        } finally {
            this.isBusy = false;
            this.render();
        }
    }

    private async mintPack() {
        if (this.isBusy) return;
        const countInput = this.querySelector("#pack-count") as HTMLInputElement | null;
        const count = Math.max(1, Math.min(10, Number(countInput?.value || 3)));
        const token = getToken();
        if (!token) {
            this.status = "Login with wallet first";
            this.render();
            return;
        }
        this.isBusy = true;
        this.status = "";
        this.render();
        try {
            const API = (window as any).__CFG__.API_URL;
            const res = await fetch(`${API}/nft/mint-pack`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({count}),
            });
            const data = await res.json().catch(() => null);
            if (res.ok && data?.ok) {
                const minted = Array.isArray(data.items) ? data.items : [];
                this.minted = minted.map((it: any) => ({cardDefinitionId: it.cardDefinitionId, tokenId: it.tokenId}));
                const countMinted = minted.length;
                this.status = `Minted pack (${countMinted} tokens)`;
                this.dispatchEvent(new CustomEvent("nft:updated", {bubbles: true}));
                void this.loadPacks();
            } else {
                this.status = data?.error || "Pack mint failed";
            }
        } catch (e: any) {
            this.status = e?.message || "Pack mint failed";
        } finally {
            this.isBusy = false;
            this.render();
        }
    }

    private async mintPackNft() {
        if (this.isBusy) return;
        const token = getToken();
        if (!token) {
            this.status = "Login with wallet first";
            this.render();
            return;
        }
        this.isBusy = true;
        this.status = "";
        this.render();
        try {
            const API = (window as any).__CFG__.API_URL;
            const walletAddress = await this.getWalletAddress();
            const res = await fetch(`${API}/nft/packs/mint`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(walletAddress ? {walletAddress} : {}),
            });
            const data = await res.json().catch(() => null);
            if (res.ok && data?.ok) {
                this.status = `Minted pack ${data.packId || ""}`;
                this.packs = data.packs ?? this.packs;
                this.dispatchEvent(new CustomEvent("nft:updated", {bubbles: true}));
            } else {
                this.status = data?.error || "Pack mint failed";
            }
        } catch (e: any) {
            this.status = e?.message || "Pack mint failed";
        } finally {
            this.isBusy = false;
            this.render();
        }
    }

    private async openPack(packId: string) {
        if (this.isBusy) return;
        const token = getToken();
        if (!token) {
            this.status = "Login with wallet first";
            this.render();
            return;
        }
        this.isBusy = true;
        this.status = "Opening pack...";
        this.render();
        try {
            const API = (window as any).__CFG__.API_URL;
            const walletAddress = await this.getWalletAddress();
            const res = await fetch(`${API}/nft/packs/open`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify(Object.assign({packId}, walletAddress ? {walletAddress} : {})),
            });
            const data = await res.json().catch(() => null);
            if (res.ok && data?.ok) {
                const items = Array.isArray(data.items) ? data.items : [];
                const received = items.map((it: any) => {
                    const name = this.cards.find(c => c.id === it.cardDefinitionId)?.name || it.cardDefinitionId || it.tokenId;
                    return `${name}${it.tokenId ? ` (#${it.tokenId})` : ""}`;
                });
                this.status = `Opened pack ${packId}: minted ${received.length} cards${received.length ? ` [${received.join(", ")}]` : ""}`;
                this.packs = data.packs ?? [];
                this.minted = [];
                this.dispatchEvent(new CustomEvent("nft:updated", {bubbles: true}));
            } else {
                this.status = data?.error || "Open failed";
            }
        } catch (e: any) {
            this.status = e?.message || "Open failed";
        } finally {
            this.isBusy = false;
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

    private render() {
        const options = this.cards
            .map((c) => `<option value="${c.id}">${c.name}</option>`)
            .join("");
        this.innerHTML = `
<div class="modal-backdrop">
  <div class="modal">
    <div class="modal-header">
      <h2 class="text-lg font-semibold">Shop (NFT)</h2>
      <button id="btn-close" class="btn btn-secondary">Close</button>
    </div>
    <div class="modal-body flex flex-col gap-3">
      <label class="text-sm">Select card to mint</label>
      <select id="card-select" class="field-input p-2 border">${options}</select>
      <button id="btn-mint" class="btn btn-primary" ${this.isBusy ? "disabled" : ""}>Mint card</button>
      <div class="h-px bg-gray-200"></div>
      <label class="text-sm">Mint random pack (1-10)</label>
      <input id="pack-count" type="number" min="1" max="10" value="3" class="field-input p-2 border"/>
      <button id="btn-pack" class="btn btn-primary" ${this.isBusy ? "disabled" : ""}>Mint pack</button>
      <div class="text-xs text-gray-600">Requires wallet login; uses backend /api/nft endpoints.</div>
      <div class="text-sm ${this.status ? "text-emerald-700" : ""}">${this.status || ""}</div>
      ${this.minted.length ? `<div class="text-sm"><div class="font-semibold mb-1">Pack contents:</div><ul class="text-xs list-disc pl-4">${this.minted.map(it => {
            const name = this.cards.find(c => c.id === it.cardDefinitionId)?.name || it.cardDefinitionId;
            const tok = it.tokenId ? ` (token ${it.tokenId})` : "";
            return `<li>${name}${tok}</li>`;
          }).join("")}</ul></div>` : ""}
      <div class="h-px bg-gray-200"></div>
      <div class="flex items-center gap-2">
        <button id="btn-mint-pack-nft" class="btn btn-primary" ${this.isBusy ? "disabled" : ""}>Mint pack NFT</button>
        <span class="text-xs text-gray-500">Pack NFTs can be opened below.</span>
      </div>
      ${this.packs.length ? `<div class="text-sm"><div class="font-semibold mb-1">Your packs:</div><ul class="text-xs list-disc pl-4">${this.packs.map(p => `<li>Pack #${p.packId} <button data-pack="${p.packId}" class="btn btn-secondary btn-xs open-pack">Open</button></li>`).join("")}</ul></div>` : `<div class="text-xs text-gray-500">No packs yet.</div>`}
    </div>
  </div>
</div>
<style>
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.modal { background: white; padding: 16px; border-radius: 12px; width: min(420px, 92vw); box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.btn-xs { padding: 4px 8px; font-size: 11px; }
</style>
`;
        this.querySelector("#btn-close")?.addEventListener("click", () => this.close());
        this.querySelector("#btn-mint")?.addEventListener("click", () => this.mintSingle());
        this.querySelector("#btn-pack")?.addEventListener("click", () => this.mintPack());
        this.querySelector("#btn-mint-pack-nft")?.addEventListener("click", () => this.mintPackNft());
        this.querySelectorAll<HTMLButtonElement>(".open-pack")?.forEach((btn) => {
            btn.addEventListener("click", () => {
                const pid = btn.dataset.pack;
                if (pid) void this.openPack(pid);
            });
        });
    }
}

customElements.define("shop-modal", ShopModal);
