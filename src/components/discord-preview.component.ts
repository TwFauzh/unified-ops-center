import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-discord-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-[#1e1f22] rounded-lg border border-gray-800 overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <span class="text-sm font-semibold text-gray-300">Discord 預覽</span>
        <span class="text-xs text-emerald-400">即時</span>
      </div>
      <div class="p-4 space-y-4 max-h-[420px] overflow-y-auto">
        @if (messages().length === 0) {
          <div class="text-sm text-gray-500">目前沒有訊息。</div>
        } @else {
          @for (msg of messages(); track msg.id) {
            <div class="flex gap-3">
              <img
                [src]="msg.avatar || fallbackAvatar"
                alt="avatar"
                class="w-9 h-9 rounded-full bg-gray-700"
              >
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-gray-200">{{ msg.author }}</span>
                  <span class="text-xs text-gray-500">
                    {{ msg.timestamp | date:'short' }}
                  </span>
                </div>
                <div class="text-sm text-gray-300 whitespace-pre-wrap">{{ msg.content }}</div>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class DiscordPreviewComponent {
  api = inject(ApiService);
  messages = this.api.discordMessages;
  fallbackAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
}
