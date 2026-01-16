import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bg-gray-800 rounded-lg p-6 border border-gray-700 max-w-3xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h3 class="text-xl font-bold text-white flex items-center gap-2">
          <i class="fa-solid fa-gear text-gray-400"></i> Pterodactyl 設定
        </h3>
        <span
          class="px-2 py-1 text-xs rounded border"
          [class.bg-emerald-900]="pteroConfig().configured"
          [class.text-emerald-200]="pteroConfig().configured"
          [class.border-emerald-700]="pteroConfig().configured"
          [class.bg-yellow-900]="!pteroConfig().configured"
          [class.text-yellow-200]="!pteroConfig().configured"
          [class.border-yellow-700]="!pteroConfig().configured"
        >
          {{ pteroConfig().configured ? '已設定' : '未設定' }}
        </span>
      </div>

      @if (pteroConfig().last4) {
        <p class="text-sm text-emerald-300">金鑰末四碼：{{ pteroConfig().last4 }}</p>
      }

      <div>
        <label class="block text-sm font-medium text-gray-300 mb-1">面板網址</label>
        <input
          [(ngModel)]="panelUrl"
          placeholder="https://panel.example.com"
          class="w-full bg-gray-900 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500"
        >
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-300 mb-1">伺服器 ID</label>
        <input
          [(ngModel)]="serverId"
          placeholder="abcd1234"
          class="w-full bg-gray-900 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500"
        >
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-300 mb-1">Client API 金鑰</label>
        <div class="relative">
          <input
            [type]="showKey() ? 'text' : 'password'"
            [(ngModel)]="apiKey"
            placeholder="ptlc_..."
            class="w-full bg-gray-900 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          >
          <button (click)="showKey.set(!showKey())" class="absolute right-3 top-2.5 text-gray-400 hover:text-white">
            <i class="fa-solid" [class.fa-eye]="!showKey()" [class.fa-eye-slash]="showKey()"></i>
          </button>
        </div>
        <p class="text-xs text-gray-500 mt-1">
          請使用你的 Pterodactyl Client API 金鑰（以 ptlc_ 開頭）。若不更換可留空。
        </p>
      </div>

      <div class="flex flex-wrap gap-3 justify-end">
        <button
          (click)="test()"
          [disabled]="saving()"
          class="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded transition"
        >
          測試金鑰
        </button>
        <button
          (click)="save()"
          [disabled]="saving()"
          class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded transition flex items-center gap-2"
        >
          @if (saving()) {
            <i class="fa-solid fa-circle-notch fa-spin"></i> 儲存中...
          } @else {
            <i class="fa-solid fa-floppy-disk"></i> 儲存設定
          }
        </button>
      </div>
    </div>
  `,
})
export class ConfigComponent {
  api = inject(ApiService);
  pteroConfig = this.api.pteroConfig;

  private readonly defaultPanelUrl = 'https://panel.speedtw.cloud';

  panelUrl = '';
  serverId = '';
  apiKey = '';
  showKey = signal(false);
  saving = signal(false);

  constructor() {
    this.panelUrl = this.defaultPanelUrl;
    effect(() => {
      const cfg = this.pteroConfig();
      if (cfg.panelUrl) this.panelUrl = cfg.panelUrl;
      if (!this.serverId && cfg.serverId) this.serverId = cfg.serverId;
    });
  }

  async save() {
    if (!this.panelUrl.trim()) {
      alert('請填寫面板網址。');
      return;
    }
    if (!this.serverId.trim()) {
      alert('請填寫伺服器 ID。');
      return;
    }

    this.saving.set(true);
    try {
      await this.api.updatePterodactylConfig({
        panelUrl: this.panelUrl.trim(),
        serverId: this.serverId.trim(),
        apiKey: this.apiKey.trim(),
      });
      this.apiKey = '';
      alert('Pterodactyl 設定已儲存。');
    } finally {
      this.saving.set(false);
    }
  }

  async test() {
    this.saving.set(true);
    try {
      await this.api.testPteroKey();
      alert('金鑰可用。');
    } catch (e: any) {
      alert(e?.message || '金鑰測試失敗。');
    } finally {
      this.saving.set(false);
    }
  }
}
