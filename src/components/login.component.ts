import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex items-center justify-center h-full w-full bg-gray-900">
      <div class="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-xl border border-gray-700">
        <div class="text-center mb-8">
          <i class="fa-solid fa-server text-5xl text-blue-500 mb-4"></i>
          <h2 class="text-2xl font-bold text-white">管理員登入</h2>
          <p class="text-gray-400 text-sm mt-2">使用 Firebase 管理員帳號登入</p>
        </div>

        <div class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">登入信箱</label>
            <input
              type="email"
              [(ngModel)]="email"
              class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition"
              placeholder="admin@example.com"
            >
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">密碼</label>
            <input
              type="password"
              [(ngModel)]="password"
              class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition"
              placeholder="••••••••"
            >
          </div>

          @if (error()) {
            <p class="text-sm text-red-400">{{ error() }}</p>
          }

          <button
            (click)="handleLogin()"
            [disabled]="isLoading()"
            class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded transition flex items-center justify-center gap-2"
          >
            @if (isLoading()) {
              <i class="fa-solid fa-circle-notch fa-spin"></i> 登入中...
            } @else {
              <i class="fa-solid fa-right-to-bracket"></i> 登入
            }
          </button>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  api = inject(ApiService);

  email = '';
  password = '';
  isLoading = signal(false);
  error = signal<string | null>(null);

  async handleLogin() {
    if (!this.email || !this.password) {
      this.error.set('請輸入信箱與密碼');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    try {
      await this.api.login(this.email, this.password);
    } catch (e: any) {
      this.error.set(e?.message || '登入失敗');
    } finally {
      this.isLoading.set(false);
    }
  }
}
