import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'upload', pathMatch: 'full' },
  {
    path: 'upload',
    loadComponent: () => import('./features/upload/upload').then(m => m.UploadComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then(m => m.DashboardComponent),
  },
  {
    path: 'insights',
    loadComponent: () => import('./features/insights/insights').then(m => m.InsightsComponent),
  },
  {
    path: 'chat',
    loadComponent: () => import('./features/chat/chat').then(m => m.ChatComponent),
  },
  {
    path: 'simulator',
    loadComponent: () => import('./features/simulator/simulator').then(m => m.SimulatorComponent),
  },
  {
    path: 'tax',
    loadComponent: () => import('./features/tax/tax').then(m => m.TaxComponent),
  },
  { path: '**', redirectTo: 'upload' },
];
