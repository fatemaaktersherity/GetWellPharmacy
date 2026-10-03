import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { AuthResponse, LoginRequest, UserProfile, ChangePasswordRequest, ForgotPasswordRequest } from '../models/auth.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  private readonly currentUserSubject = new BehaviorSubject<AuthResponse | null>(this.getStoredUser());
  readonly user$ = this.currentUserSubject.asObservable();

  login(dto: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, dto).pipe(
      tap(res => {
        localStorage.setItem('pharmacy_user', JSON.stringify(res));
        localStorage.setItem('pharmacy_token', res.token);
        this.currentUserSubject.next(res);
      })
    );
  }

  me(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.apiUrl}/me`);
  }

  changePassword(dto: ChangePasswordRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/change-password`, dto);
  }

  logout(): void {
    localStorage.removeItem('pharmacy_user');
    localStorage.removeItem('pharmacy_token');
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  getRole(): string | null {
    return this.currentUserSubject.value?.roleName ?? null;
  }

  hasRole(...roles: string[]): boolean {
    const r = this.getRole();
    return !!r && roles.includes(r);
  }

  dashboardUrl(): string {
    const role = this.getRole();
    if (role === 'Admin') return '/admin/dashboard';
    if (role === 'Manager') return '/manager/dashboard';
    if (role === 'Cashier') return '/user/dashboard';
    // No role, or an unrecognized one. '/account-pending' has no role
    // restriction, so it's always a safe final landing spot — returning
    // '/user/dashboard' here used to send a role-less account straight back
    // into a guard check that denies it and calls dashboardUrl() again,
    // looping forever.
    return '/account-pending';
  }

  goToDashboard(): void {
    this.router.navigateByUrl(this.dashboardUrl());
  }

  getToken(): string | null {
    return localStorage.getItem('pharmacy_token');
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  private getStoredUser(): AuthResponse | null {
    const stored = localStorage.getItem('pharmacy_user');
    if (!stored) return null;
    try {
      return JSON.parse(stored) as AuthResponse;
    } catch {
      localStorage.removeItem('pharmacy_user');
      return null;
    }
  }

  isAdmin(): boolean {
    return this.currentUserSubject.value?.roleName === 'Admin';
  }

  currentUserId(): number | null {
    return this.currentUserSubject.value?.userId ?? null;
  }

  forgotPassword(dto: ForgotPasswordRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/forgot-password`, dto);
  }
}
