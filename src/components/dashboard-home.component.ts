import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { DiscordPreviewComponent } from './discord-preview.component';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule, FormsModule, DiscordPreviewComponent],
  template: `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-2xl font-bold text-white">運維總覽</h2>
              <p class="text-gray-400 text-sm">
                Pterodactyl + Discord 運維狀態快照
              </p>
            </div>
            <div class="text-right">
              <span
                class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm"
                [class.bg-orange-500/20]="maintenance().mode === 'MAINTENANCE'"
                [class.text-orange-300]="maintenance().mode === 'MAINTENANCE'"
                [class.bg-emerald-500/20]="maintenance().mode !== 'MAINTENANCE'"
                [class.text-emerald-300]="maintenance().mode !== 'MAINTENANCE'"
              >
                <span
                  class="h-2 w-2 rounded-full"
                  [class.bg-orange-400]="maintenance().mode === 'MAINTENANCE'"
                  [class.bg-emerald-400]="maintenance().mode !== 'MAINTENANCE'"
                ></span>
                {{ maintenance().mode === 'MAINTENANCE' ? '維護中' : '正常' }}
              </span>
              @if (lastUpdatedAt()) {
                <div class="text-xs text-gray-500 mt-2">
                  最後更新：{{ lastUpdatedAt() | date:'shortTime' }}
                </div>
              }
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            class="bg-gray-800 rounded-lg p-5 border-l-4"
            [class.border-green-500]="status().state === 'running'"
            [class.border-red-500]="status().state === 'offline'"
            [class.border-yellow-500]="status().state === 'maintenance' || status().state === 'starting'"
          >
            <p class="text-gray-400 text-sm">伺服器狀態</p>
            <h3 class="text-xl font-bold mt-1 text-white">{{ stateLabel(status().state) }}</h3>
          </div>

          <div class="bg-gray-800 rounded-lg p-5 border-l-4 border-blue-500">
            <p class="text-gray-400 text-sm">線上玩家</p>
            <h3 class="text-xl font-bold text-white mt-1">
              {{ status().stats.players }}
              <span class="text-sm text-gray-500">/ {{ status().stats.maxPlayers }}</span>
            </h3>
          </div>

          <div class="bg-gray-800 rounded-lg p-5 border-l-4 border-purple-500">
            <p class="text-gray-400 text-sm">CPU 使用率</p>
            <h3 class="text-xl font-bold text-white mt-1">{{ status().stats.cpu }}%</h3>
            <div class="w-full bg-gray-700 h-1.5 mt-3 rounded-full overflow-hidden">
              <div class="bg-purple-500 h-full transition-all" [style.width.%]="status().stats.cpu"></div>
            </div>
          </div>

          <div class="bg-gray-800 rounded-lg p-5 border-l-4 border-orange-500">
            <p class="text-gray-400 text-sm">記憶體</p>
            <h3 class="text-xl font-bold text-white mt-1">{{ status().stats.memory }} MB</h3>
            <p class="text-xs text-gray-500 mt-1">硬碟：{{ status().stats.disk }} MB</p>
          </div>
        </div>

        <div class="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-bold text-white">控制</h3>
            <button
              (click)="refresh()"
              class="text-sm px-3 py-1 rounded bg-gray-700 hover:bg-gray-600"
            >
              重新整理
            </button>
          </div>
          <div class="text-sm text-gray-300">
            白名單狀態：<span class="font-semibold">{{ whitelistLabel() }}</span>
            @if (whitelistState().updatedAt) {
              <span class="text-xs text-gray-500 ml-2">更新時間：{{ whitelistState().updatedAt | date:'shortTime' }}</span>
            }
          </div>
          <div class="flex flex-wrap gap-3">
            <button
              (click)="powerStart()"
              class="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded"
              [disabled]="actionBusy() || !pteroConfig().configured || status().state === 'running'"
            >
              <i class="fa-solid fa-play"></i> 啟動
            </button>
            <button
              (click)="powerStop()"
              class="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded"
              [disabled]="actionBusy() || !pteroConfig().configured || status().state === 'offline'"
            >
              <i class="fa-solid fa-stop"></i> 關閉
            </button>
            <button
              (click)="whitelistOn()"
              class="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded"
              [disabled]="actionBusy() || !pteroConfig().configured"
            >
              <i class="fa-solid fa-user-shield"></i> 白名單開啟
            </button>
            <button
              (click)="whitelistOff()"
              class="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded"
              [disabled]="actionBusy() || !pteroConfig().configured"
            >
              <i class="fa-solid fa-user-slash"></i> 白名單關閉
            </button>
            @if (!pteroConfig().configured) {
              <span class="text-sm text-yellow-300">
                尚未設定 Pterodactyl 連線資訊。
              </span>
            }
          </div>
        </div>

        <div class="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-bold text-white">指令輸入</h3>
            <span class="text-xs text-gray-500">使用你的專屬 API 金鑰發送</span>
          </div>
          <div class="flex flex-col md:flex-row gap-3">
            <input
              [(ngModel)]="command"
              placeholder="say 來自維護中心的廣播"
              class="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
            >
            <button
              (click)="sendCommand()"
              class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded"
              [disabled]="actionBusy() || !pteroConfig().configured"
            >
              送出
            </button>
          </div>
        </div>
      </div>

      <div class="lg:col-span-1">
        <app-discord-preview></app-discord-preview>
      </div>
    </div>
  `,
})
export class DashboardHomeComponent {
  api = inject(ApiService);
  status = this.api.serverStatus;
  maintenance = this.api.maintenanceState;
  pteroConfig = this.api.pteroConfig;
  whitelistState = this.api.whitelistState;
  lastUpdatedAt = this.api.lastUpdatedAt;
  actionBusy = signal(false);

  command = '';

  refresh() {
    this.api.refreshOpsStatus();
    this.api.refreshMaintenanceState();
    this.api.refreshDiscordMessages();
    this.api.refreshWhitelistState();
  }

  async powerStart() {
    this.actionBusy.set(true);
    try {
      await this.api.powerStart();
    } catch (e: any) {
      alert(e?.message || '伺服器啟動失敗。');
    } finally {
      this.actionBusy.set(false);
    }
  }

  async powerStop() {
    this.actionBusy.set(true);
    try {
      await this.api.powerStop();
    } catch (e: any) {
      alert(e?.message || '伺服器關閉失敗。');
    } finally {
      this.actionBusy.set(false);
    }
  }

  async whitelistOn() {
    this.actionBusy.set(true);
    try {
      await this.api.whitelistOn();
    } catch (e: any) {
      alert(e?.message || '白名單開啟失敗。');
    } finally {
      this.actionBusy.set(false);
    }
  }

  async whitelistOff() {
    this.actionBusy.set(true);
    try {
      await this.api.whitelistOff();
    } catch (e: any) {
      alert(e?.message || '白名單關閉失敗。');
    } finally {
      this.actionBusy.set(false);
    }
  }

  async sendCommand() {
    this.actionBusy.set(true);
    try {
      await this.api.sendCommand(this.command);
      this.command = '';
    } catch (e: any) {
      alert(e?.message || '指令送出失敗。');
    } finally {
      this.actionBusy.set(false);
    }
  }

  stateLabel(state: string) {
    switch (state) {
      case 'running':
        return '運行中';
      case 'starting':
        return '啟動中';
      case 'stopping':
        return '關閉中';
      case 'maintenance':
        return '維護中';
      case 'offline':
        return '已離線';
      default:
        return '未知';
    }
  }

  whitelistLabel() {
    const enabled = this.whitelistState().enabled;
    if (enabled === true) return '開啟';
    if (enabled === false) return '關閉';
    return '未知';
  }
}
