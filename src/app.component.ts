import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoginComponent } from './components/login.component';
import { DashboardHomeComponent } from './components/dashboard-home.component';
import { MaintenanceComponent } from './components/maintenance.component';
import { AnnouncementComponent } from './components/announcement.component';
import { ConfigComponent } from './components/config.component';
import { ApiService } from './services/api.service';
import { UtilsService } from './services/utils.service';

type View = 'dashboard' | 'maintenance' | 'announcement' | 'config';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, 
    LoginComponent, 
    DashboardHomeComponent, 
    MaintenanceComponent, 
    AnnouncementComponent, 
    ConfigComponent
  ],
  templateUrl: './app.component.html'
})
export class AppComponent {
  api = inject(ApiService);
  utils = inject(UtilsService);
  
  user = this.api.currentUser;
  currentView = signal<View>('dashboard');
  
  logs = this.api.logs;

  anonymizedEmail = computed(() => {
    const email = this.user()?.email;
    return email ? this.utils.anonymizeEmail(email) : '';
  });

  setView(view: View) {
    this.currentView.set(view);
  }
}
