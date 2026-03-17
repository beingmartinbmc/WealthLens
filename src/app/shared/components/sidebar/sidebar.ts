import { Component, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { StorageService } from '../../../core/services/storage.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo">
          <span class="logo-icon">💰</span>
          <span class="logo-text">WealthLens</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        @for (item of navItems; track item.route) {
          <a
            [routerLink]="item.route"
            routerLinkActive="active"
            class="nav-item"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span class="nav-label">{{ item.label }}</span>
          </a>
        }
      </nav>

      <div class="sidebar-footer">
        @if (confirmingClear()) {
          <div class="clear-confirm">
            <span>Delete all data?</span>
            <div class="clear-actions">
              <button class="btn-confirm" (click)="confirmClear()">Yes, clear</button>
              <button class="btn-cancel" (click)="confirmingClear.set(false)">Cancel</button>
            </div>
          </div>
        } @else {
          <button class="clear-btn" (click)="confirmingClear.set(true)">
            <span>🗑️</span> Clear Data & Restart
          </button>
        }
        <div class="privacy-badge">
          <span class="privacy-icon">🔒</span>
          <span class="privacy-text">Your data never leaves your device</span>
        </div>
      </div>
    </aside>
  `,
  styles: [`
    .sidebar {
      width: 260px;
      height: 100vh;
      background: #1a1a2e;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      position: fixed;
      left: 0;
      top: 0;
      z-index: 100;
      border-right: 1px solid rgba(255, 255, 255, 0.06);
    }

    .sidebar-header {
      padding: 24px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-icon { font-size: 28px; }

    .logo-text {
      font-size: 22px;
      font-weight: 700;
      background: linear-gradient(135deg, #6C5CE7, #00B894);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.5px;
    }

    .sidebar-nav {
      flex: 1;
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 10px;
      color: #a0a0b8;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .nav-item:hover {
      background: rgba(108, 92, 231, 0.1);
      color: #e0e0e0;
    }

    .nav-item.active {
      background: rgba(108, 92, 231, 0.2);
      color: #fff;
      font-weight: 600;
    }

    .nav-icon { font-size: 18px; }

    .sidebar-footer {
      padding: 16px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }

    .privacy-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: rgba(0, 184, 148, 0.1);
      border-radius: 8px;
      font-size: 11px;
      color: #00B894;
    }

    .privacy-icon { font-size: 14px; }

    .clear-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      margin-bottom: 12px;
      background: rgba(255, 107, 107, 0.08);
      border: 1px solid rgba(255, 107, 107, 0.2);
      border-radius: 8px;
      color: #FF6B6B;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .clear-btn:hover {
      background: rgba(255, 107, 107, 0.15);
      border-color: rgba(255, 107, 107, 0.4);
    }

    .clear-confirm {
      padding: 10px 12px;
      margin-bottom: 12px;
      background: rgba(255, 107, 107, 0.1);
      border: 1px solid rgba(255, 107, 107, 0.3);
      border-radius: 8px;
      font-size: 12px;
      color: #FF6B6B;
    }
    .clear-confirm span { font-weight: 600; }
    .clear-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .btn-confirm {
      flex: 1;
      padding: 6px;
      background: #FF6B6B;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-confirm:hover { background: #e55; }
    .btn-cancel {
      flex: 1;
      padding: 6px;
      background: transparent;
      color: #a0a0b8;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
    }
    .btn-cancel:hover { color: #e0e0e0; }
  `]
})
export class SidebarComponent {
  confirmingClear = signal(false);

  constructor(
    private storage: StorageService,
    private router: Router,
  ) {}

  async confirmClear(): Promise<void> {
    await this.storage.clearAllData();
    this.confirmingClear.set(false);
    this.router.navigate(['/upload']);
  }

  navItems: NavItem[] = [
    { label: 'Upload', icon: '📥', route: '/upload' },
    { label: 'Dashboard', icon: '📊', route: '/dashboard' },
    { label: 'Insights', icon: '🚨', route: '/insights' },
    { label: 'Chat', icon: '💬', route: '/chat' },
    { label: 'Simulator', icon: '🔮', route: '/simulator' },
    { label: 'Tax', icon: '🧾', route: '/tax' },
  ];
}
