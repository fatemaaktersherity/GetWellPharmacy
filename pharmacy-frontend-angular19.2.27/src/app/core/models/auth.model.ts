export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  userId: number;
  username: string;
  fullName: string;
  roleName: string;
  token: string;
  expiresAtUtc: string;
}

export interface UserProfile {
  id: number;
  username: string;
  fullName: string;
  email?: string;
  phone?: string;
  isActive: boolean;
  roleName?: string;
}

export interface UpdateUserStatusRequest {
  isActive: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

export interface ForgotPasswordRequest {
  email: string;
  phone: string;
  newPassword: string;
  confirmNewPassword: string;
}
