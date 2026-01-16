import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { UtilsService } from '../services/utils.service';

@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div class="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-6">
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-bold text-white flex items-center gap-2">
            <i class="fa-solid fa-screwdriver-wrench text-yellow-500"></i> 維護模式控制
          </h3>
          <span
            class="text-xs px-2 py-1 rounded"
            [class.bg-orange-500/20]="maintenance().mode === 'MAINTENANCE'"
            [class.text-orange-300]="maintenance().mode === 'MAINTENANCE'"
            [class.bg-emerald-500/20]="maintenance().mode !== 'MAINTENANCE'"
            [class.text-emerald-300]="maintenance().mode !== 'MAINTENANCE'"
          >
            {{ maintenance().mode === 'MAINTENANCE' ? '維護中' : '正常' }}
          </span>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">維護持續時間（分鐘）</label>
          <input
            type="number"
            [(ngModel)]="duration"
            min="1"
            class="w-full bg-gray-900 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-500"
          >
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">維護事項說明</label>
          <textarea
            [(ngModel)]="reason"
            rows="4"
            placeholder="請輸入維護說明..."
            class="w-full bg-gray-900 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-500"
          ></textarea>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">預計完成時間（可選）</label>
          <input
            [(ngModel)]="eta"
            placeholder="例如：20 分鐘"
            class="w-full bg-gray-900 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-500"
          >
        </div>

        <div class="flex flex-wrap gap-3">
          <button
            (click)="startMaintenance()"
            [disabled]="!isValid() || processing()"
            class="bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded transition flex items-center gap-2"
          >
            @if (processing()) {
              <i class="fa-solid fa-circle-notch fa-spin"></i> 啟動中...
            } @else {
              <i class="fa-solid fa-lock"></i> 啟動維護
            }
          </button>
          <button
            (click)="stopMaintenance()"
            [disabled]="processing() || maintenance().mode !== 'MAINTENANCE'"
            class="bg-sky-600 hover:bg-sky-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded transition flex items-center gap-2"
          >
            <i class="fa-solid fa-unlock"></i> 結束維護
          </button>
          <button
            (click)="sendAnnouncement()"
            [disabled]="!reason.trim() || processing()"
            class="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded transition flex items-center gap-2"
          >
            <i class="fa-brands fa-discord"></i> 發送 Discord 通知
          </button>
        </div>
      </div>

      <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 class="text-lg font-bold text-white mb-4">Discord 預覽</h3>
        <div class="bg-[#313338] rounded p-4 border-l-4 border-yellow-500 max-w-md mx-auto font-sans">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-bold text-white bg-[#5865F2] px-1 rounded">機器人</span>
            <span class="text-white font-bold">維護通知機器人</span>
            <span class="text-xs text-gray-400">今天 {{ now | date:'shortTime' }}</span>
          </div>
          <div class="bg-[#2b2d31] rounded p-4">
            <h4 class="text-white font-bold mb-2">維護通知</h4>
            <p class="text-gray-300 text-sm mb-4">{{ reason || '等待輸入維護說明...' }}</p>
            <div class="grid grid-cols-2 gap-2 mb-2">
              <div>
                <p class="text-gray-400 text-xs font-bold uppercase">預計</p>
                <p class="text-gray-200 text-sm">{{ eta || (duration + ' 分鐘') }}</p>
              </div>
              <div>
                <p class="text-gray-400 text-xs font-bold uppercase">狀態</p>
                <p class="text-yellow-400 text-sm">維護中</p>
              </div>
            </div>
            <div class="border-t border-gray-600 mt-2 pt-2 flex justify-between items-center">
              <span class="text-gray-400 text-xs">操作者：{{ anonymizedUser() }}</span>
              <span class="text-gray-500 text-xs">{{ now | date:'medium' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MaintenanceComponent {
  api = inject(ApiService);
  utils = inject(UtilsService);

  maintenance = this.api.maintenanceState;
  duration = 30;
  reason = '';
  eta = '';
  processing = signal(false);
  now = new Date();

  anonymizedUser = signal(this.utils.anonymizeEmail(this.api.currentUser()?.email || 'unknown'));

  isValid() {
    return this.duration > 0 && this.reason.trim().length > 5;
  }

  async startMaintenance() {
    if (!this.isValid()) return;
    this.processing.set(true);
    try {
      await this.api.startMaintenance();
      await this.sendAnnouncement();
      this.reason = '';
      this.eta = '';
    } catch (e: any) {
      alert(e?.message || '啟動維護失敗。');
    } finally {
      this.processing.set(false);
    }
  }

  async stopMaintenance() {
    this.processing.set(true);
    try {
      await this.api.stopMaintenance();
    } catch (e: any) {
      alert(e?.message || '結束維護失敗。');
    } finally {
      this.processing.set(false);
    }
  }

  async sendAnnouncement() {
    if (!this.reason.trim()) return;
    try {
      await this.api.sendDiscordAnnouncement(
        'maintenance',
        this.reason.trim() + (this.eta ? `（預計：${this.eta}）` : '')
      );
    } catch (e: any) {
      alert(e?.message || 'Discord 通知發送失敗。');
    }
  }
}
