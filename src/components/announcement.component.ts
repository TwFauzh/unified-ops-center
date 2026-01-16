import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { UtilsService } from '../services/utils.service';

@Component({
  selector: 'app-announcement',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 class="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <i class="fa-brands fa-discord text-[#5865F2]"></i> Discord 公告
        </h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">公告類型</label>
            <select [(ngModel)]="type" class="w-full bg-gray-900 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-[#5865F2]">
              <option value="maintenance">維護通知</option>
              <option value="status">伺服器狀態</option>
              <option value="system">系統公告</option>
              <option value="custom">自訂內容</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">公告內容</label>
            <textarea
              [(ngModel)]="content"
              rows="6"
              class="w-full bg-gray-900 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-[#5865F2]"
              placeholder="可填寫詳細公告內容..."
            ></textarea>
          </div>

          <button
            (click)="send()"
            [disabled]="!content.trim() || sending()"
            class="w-full bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold py-2 px-4 rounded transition flex items-center justify-center gap-2"
          >
            @if (sending()) {
              <i class="fa-solid fa-circle-notch fa-spin"></i> 發送中...
            } @else {
              <i class="fa-regular fa-paper-plane"></i> 發送公告
            }
          </button>
        </div>
      </div>

      <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 class="text-lg font-bold text-white mb-4">預覽</h3>
        <div
          class="bg-[#313338] rounded p-4 max-w-md mx-auto font-sans border-l-4"
          [style.border-color]="color()"
        >
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-bold text-white bg-[#5865F2] px-1 rounded">機器人</span>
            <span class="text-white font-bold">系統通知機器人</span>
          </div>
          <div class="bg-[#2b2d31] rounded p-4">
            <h4 class="text-white font-bold mb-2">{{ title() }}</h4>
            <div class="text-gray-300 text-sm whitespace-pre-wrap">{{ content || '預覽內容...' }}</div>
            <div class="border-t border-gray-600 mt-4 pt-2 flex justify-between items-center">
              <span class="text-gray-400 text-xs">發布者：{{ anonymizedUser() }}</span>
              <span class="text-gray-500 text-xs">今天 {{ now | date:'shortTime' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AnnouncementComponent {
  api = inject(ApiService);
  utils = inject(UtilsService);

  type = 'system';
  content = '';
  sending = signal(false);
  now = new Date();

  anonymizedUser = signal(this.utils.anonymizeEmail(this.api.currentUser()?.email || 'test@test.com'));

  color() {
    switch (this.type) {
      case 'maintenance':
        return '#f59e0b';
      case 'status':
        return '#3b82f6';
      case 'custom':
        return '#a855f7';
      default:
        return '#22c55e';
    }
  }

  title() {
    switch (this.type) {
      case 'maintenance':
        return '維護通知';
      case 'status':
        return '伺服器狀態';
      case 'custom':
        return '自訂內容';
      default:
        return '系統公告';
    }
  }

  async send() {
    if (!this.content.trim()) return;
    this.sending.set(true);
    try {
      await this.api.sendDiscordAnnouncement(this.type, this.content);
      this.content = '';
      alert('公告已發送。');
    } catch (e: any) {
      alert(e?.message || '公告發送失敗。');
    } finally {
      this.sending.set(false);
    }
  }
}
