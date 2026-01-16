import { Injectable, signal } from '@angular/core';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { APP_CONFIG } from '../config/app.config';

export interface User {
  uid: string;
  email: string;
  role: 'ADMIN';
}

export interface ServerStats {
  cpu: number;
  memory: number;
  disk: number;
  uptime: number;
  players: number;
  maxPlayers: number;
}

export interface ServerStatus {
  state: 'running' | 'offline' | 'starting' | 'stopping' | 'maintenance' | 'unknown';
  stats: ServerStats;
}

export interface DiscordMessage {
  id: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: Date;
}

export interface PteroConfig {
  configured: boolean;
  last4: string | null;
  panelUrl: string | null;
  serverId: string | null;
}

export interface MaintenanceState {
  mode: 'NORMAL' | 'MAINTENANCE';
  operator?: string | null;
  updatedAt?: number | null;
}

export interface WhitelistState {
  enabled: boolean | null;
  updatedAt?: number | null;
  updatedBy?: string | null;
}

class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function parseJsonSafe(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  currentUser = signal<User | null>(null);
  serverStatus = signal<ServerStatus>({
    state: 'unknown',
    stats: {
      cpu: 0,
      memory: 0,
      disk: 0,
      uptime: 0,
      players: 0,
      maxPlayers: 100,
    },
  });
  maintenanceState = signal<MaintenanceState>({ mode: 'NORMAL', operator: null, updatedAt: null });
  whitelistState = signal<WhitelistState>({ enabled: null, updatedAt: null, updatedBy: null });
  discordMessages = signal<DiscordMessage[]>([]);
  pteroConfig = signal<PteroConfig>({
    configured: false,
    last4: null,
    panelUrl: null,
    serverId: null,
  });
  logs = signal<string[]>([]);
  lastUpdatedAt = signal<number | null>(null);

  private pollId: number | null = null;

  constructor() {
    onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        this.currentUser.set(null);
        this.stopPolling();
        return;
      }

      this.currentUser.set({
        uid: fbUser.uid,
        email: fbUser.email || 'admin',
        role: 'ADMIN',
      });

      this.startPolling();
    });
  }

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(auth, email, password);
    this.addLog('AUTH', `已登入：${email}`);
  }

  async logout(): Promise<void> {
    await signOut(auth);
    this.currentUser.set(null);
    this.discordMessages.set([]);
    this.addLog('AUTH', '已登出');
  }

  async refreshOpsStatus(): Promise<void> {
    try {
      const st = await this.apiGet('/api/status');
      const raw = String(st?.server?.status ?? st?.status ?? 'unknown').toLowerCase();
      const mappedState: ServerStatus['state'] =
        raw === 'running' ? 'running' :
        raw === 'starting' ? 'starting' :
        raw === 'stopping' ? 'stopping' :
        raw === 'maintenance' ? 'maintenance' :
        raw === 'offline' ? 'offline' :
        'unknown';

      const cpu = Number(st?.stats?.cpu ?? 0);
      const memoryBytes = Number(st?.stats?.memoryBytes ?? 0);
      const diskBytes = Number(st?.stats?.diskBytes ?? 0);

      const memory = Number((memoryBytes / 1024 / 1024).toFixed(1));
      const disk = Number((diskBytes / 1024 / 1024).toFixed(1));
      const uptime = Number(st?.stats?.uptimeSeconds ?? st?.stats?.uptime ?? 0);

      const playersRaw = st?.server?.playersOnline;
      const maxPlayersRaw = st?.server?.maxPlayers;
      const players = playersRaw === null || playersRaw === undefined ? 0 : Number(playersRaw);
      const maxPlayers = maxPlayersRaw === null || maxPlayersRaw === undefined ? 100 : Number(maxPlayersRaw);

      this.serverStatus.set({
        state: mappedState,
        stats: {
          cpu,
          memory,
          disk,
          uptime,
          players,
          maxPlayers,
        },
      });
      this.lastUpdatedAt.set(Date.now());
    } catch (e: any) {
      if (this.handleApiError(e)) return;
      this.addLog('ERROR', `狀態刷新失敗：${e.message || e}`);
    }
  }

  async refreshMaintenanceState(): Promise<void> {
    try {
      const maint = await this.apiGet('/api/maintenance/status');
      this.maintenanceState.set({
        mode: maint?.state?.mode ?? 'NORMAL',
        operator: maint?.state?.operator ?? maint?.state?.updatedBy ?? null,
        updatedAt: maint?.state?.updatedAt ?? null,
      });
    } catch (e: any) {
      if (this.handleApiError(e)) return;
      this.addLog('ERROR', `維護狀態讀取失敗：${e.message || e}`);
    }
  }

  async refreshWhitelistState(): Promise<void> {
    try {
      const r = await this.apiGet('/api/whitelist/status');
      this.whitelistState.set({
        enabled: typeof r?.state?.enabled === 'boolean' ? r.state.enabled : null,
        updatedAt: r?.state?.updatedAt ?? null,
        updatedBy: r?.state?.updatedBy ?? null,
      });
    } catch (e: any) {
      this.whitelistState.set({ enabled: null, updatedAt: null, updatedBy: null });
    }
  }

  async refreshDiscordMessages(): Promise<void> {
    try {
      const r = await this.apiGet('/api/discord/messages?limit=20');
      const raw = (r?.messages ?? []) as any[];
      const messages: DiscordMessage[] = raw.map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
      this.discordMessages.set(messages.reverse());
    } catch (e: any) {
      this.addLog('WARN', `Discord 訊息讀取失敗：${e.message || e}`);
    }
  }

  async refreshPteroConfig(): Promise<void> {
    try {
      const r = await this.apiGet('/api/pterodactyl/config');
      this.pteroConfig.set({
        configured: Boolean(r?.configured),
        last4: r?.last4 ?? null,
        panelUrl: r?.panelUrl ?? null,
        serverId: r?.serverId ?? null,
      });
    } catch (e: any) {
      if (this.handleApiError(e)) return;
      this.pteroConfig.set({ configured: false, last4: null, panelUrl: null, serverId: null });
    }
  }

  async powerStart(): Promise<void> {
    await this.apiPost('/api/power/start');
    await this.refreshOpsStatus();
  }

  async powerStop(): Promise<void> {
    await this.apiPost('/api/power/stop');
    await this.refreshOpsStatus();
  }

  async sendCommand(command: string): Promise<void> {
    if (!command.trim()) return;
    await this.apiPost('/api/command', { command: command.trim() });
    this.addLog('COMMAND', `已送出：${command.trim()}`);
  }

  async whitelistOn(): Promise<void> {
    await this.apiPost('/api/whitelist/on');
    this.addLog('COMMAND', '白名單已開啟');
    await this.refreshWhitelistState();
  }

  async whitelistOff(): Promise<void> {
    await this.apiPost('/api/whitelist/off');
    this.addLog('COMMAND', '白名單已關閉');
    await this.refreshWhitelistState();
  }

  async startMaintenance(): Promise<void> {
    await this.apiPost('/api/maintenance/start');
    await this.refreshOpsStatus();
    await this.refreshMaintenanceState();
  }

  async stopMaintenance(): Promise<void> {
    await this.apiPost('/api/maintenance/stop');
    await this.refreshOpsStatus();
    await this.refreshMaintenanceState();
  }

  async sendDiscordAnnouncement(type: string, content: string): Promise<void> {
    const title = this.getAnnouncementTitle(type);
    await this.apiPost('/api/discord/announce', {
      title,
      reason: content.trim(),
      message: undefined,
      remindKick: type === 'maintenance',
    });
  }

  async updatePterodactylConfig(config: { panelUrl: string; serverId: string; apiKey?: string }): Promise<void> {
    await this.apiPost('/api/pterodactyl/config', {
      panelUrl: config.panelUrl,
      serverId: config.serverId,
      apiKey: config.apiKey || undefined,
    }, 'PUT');
    await this.refreshPteroConfig();
  }

  async testPteroKey(): Promise<void> {
    await this.apiPost('/api/ptero-key/test');
  }

  private async apiGet(path: string): Promise<any> {
    const res = await fetch(`${APP_CONFIG.apiBaseUrl}${path}`, { headers: await this.authHeaders() });
    const text = await res.text();
    const data = parseJsonSafe(text);

    if (!res.ok) {
      throw new ApiError(data?.error || text || 'API 錯誤', res.status, data?.code);
    }
    return data;
  }

  private async apiPost(path: string, body?: any, method: 'POST' | 'PUT' = 'POST'): Promise<any> {
    const res = await fetch(`${APP_CONFIG.apiBaseUrl}${path}`, {
      method,
      headers: await this.authHeaders({ 'Content-Type': 'application/json' }),
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    const data = parseJsonSafe(text);

    if (!res.ok) {
      throw new ApiError(data?.error || text || 'API 錯誤', res.status, data?.code);
    }
    return data;
  }

  private async authHeaders(extra?: Record<string, string>) {
    const user = auth.currentUser;
    if (!user) throw new Error('尚未登入');

    const token = await user.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      ...(extra || {}),
    };
  }

  private handleApiError(e: any): boolean {
    const err = e as ApiError;
    if (err?.status === 412 || err?.code === 'PTERO_KEY_NOT_SET' || err?.code === 'PTERO_CONFIG_NOT_SET') {
      this.pteroConfig.set({ configured: false, last4: null, panelUrl: null, serverId: null });
      return true;
    }
    return false;
  }

  private startPolling() {
    this.stopPolling();
    this.refreshPteroConfig();
    this.refreshMaintenanceState();
    this.refreshWhitelistState();
    this.refreshOpsStatus();
    this.refreshDiscordMessages();

    this.pollId = window.setInterval(() => {
      if (!this.currentUser()) return;
      if (this.pteroConfig().configured) {
        this.refreshOpsStatus();
      }
      this.refreshMaintenanceState();
      this.refreshWhitelistState();
      this.refreshDiscordMessages();
    }, APP_CONFIG.pollIntervalMs);
  }

  private stopPolling() {
    if (this.pollId) {
      window.clearInterval(this.pollId);
      this.pollId = null;
    }
  }

  private addLog(module: string, message: string) {
    const time = new Date().toLocaleTimeString('zh-TW');
    this.logs.update((l) => [`[${time}] [${module}] ${message}`, ...l]);
  }

  private getAnnouncementTitle(type: string) {
    switch (type) {
      case 'status':
        return '伺服器狀態';
      case 'custom':
        return '自訂內容';
      case 'maintenance':
        return '維護通知';
      default:
        return '系統公告';
    }
  }
}
