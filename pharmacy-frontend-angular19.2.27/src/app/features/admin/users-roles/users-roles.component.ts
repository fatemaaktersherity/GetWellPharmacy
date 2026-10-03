import { CommonModule } from '@angular/common';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { ResetPasswordDialogComponent } from '../../../shared/reset-password-dialog/reset-password-dialog.component';
import { UserProfile } from '../../../core/models/auth.model';
import { ApiService } from '../../../core/services/api.service';

type RoleName = 'Admin' | 'Manager' | 'Cashier';

@Component({
  selector: 'app-users-roles',
  standalone: true,
  imports: [
    CommonModule,
    PaginationComponent,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTableModule,
  ],
  templateUrl: './users-roles.component.html',
  styleUrl: './users-roles.component.scss',
})
export class UsersRolesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);

  readonly roles: RoleName[] = ['Admin', 'Manager', 'Cashier'];
  readonly displayedColumns = ['name', 'email', 'phone', 'role', 'status', 'actions'];
  readonly users = signal<UserProfile[]>([]);
  readonly loading = signal(false);
  readonly savingId = signal<number | null>(null);
  readonly message = signal('');
  readonly search = signal('');
  readonly roleFilter = signal<RoleName | 'All'>('All');
  pageIndex = 0; pageSize = 10;

  readonly filteredUsers = computed(() => {
    const q = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    return this.users().filter((user) => {
      const roleMatches = role === 'All' || user.roleName === role;
      const textMatches = !q || [user.fullName, user.email, user.username, user.phone]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q));
      return roleMatches && textMatches;
    });
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.message.set('');
    this.api.getUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: (err) => {
        this.message.set(err?.error?.message ?? 'Unable to load users.');
        this.loading.set(false);
      },
    });
  }

  changeRole(user: UserProfile, role: RoleName): void {
    if (user.roleName === role) return;

    this.savingId.set(user.id);
    this.message.set('');
    this.api.changeUserRole(user.id, role).subscribe({
      next: () => {
        this.loadUsers();
        this.savingId.set(null);
      },
      error: (err) => {
        this.message.set(err?.error?.message ?? 'Unable to change role.');
        this.savingId.set(null);
      },
    });
  }

  setActive(user: UserProfile, isActive: boolean): void {
    this.savingId.set(user.id);
    this.message.set('');
    this.api.setUserActive(user.id, isActive).subscribe({
      next: () => {
        this.loadUsers();
        this.savingId.set(null);
      },
      error: (err) => {
        this.message.set(err?.error?.message ?? 'Unable to update user status.');
        this.savingId.set(null);
      },
    });
  }

  resetPassword(user: UserProfile): void {
    const ref = this.dialog.open(ResetPasswordDialogComponent, {
      width: '420px',
      data: { userFullName: user.fullName }
    });

    ref.afterClosed().subscribe((newPassword: string | null) => {
      if (!newPassword) return;

      this.savingId.set(user.id);
      this.message.set('');
      this.api.resetUserPassword(user.id, newPassword, newPassword).subscribe({
        next: (res) => {
          this.message.set(res.message || 'Password has been reset.');
          this.savingId.set(null);
        },
        error: (err) => {
          this.message.set(err?.error?.message ?? 'Unable to reset password.');
          this.savingId.set(null);
        },
      });
    });
  }
}
