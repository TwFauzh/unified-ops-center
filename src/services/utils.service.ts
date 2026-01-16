import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class UtilsService {
  anonymizeEmail(email: string): string {
    if (!email || !email.includes('@')) return 'Email 格式錯誤';

    const [user, domain] = email.split('@');
    if (!user || !domain) return 'Email 格式錯誤';

    const prefix = user.substring(0, 2);
    const suffix = user.slice(-1);
    const middleCount = Math.max(user.length - 3, 0);
    const maskedUser = prefix + '*'.repeat(middleCount) + suffix;
    const maskedDomain = '*'.repeat(domain.length);

    return `${maskedUser}@${maskedDomain}`;
  }

  getDiscordTimestamp(): string {
    const now = new Date();
    return now.toISOString();
  }
}
