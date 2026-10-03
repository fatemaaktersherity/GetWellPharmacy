import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const allowed = route.data?.['roles'] as string[] | undefined;

  if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);
  if (!allowed || auth.hasRole(...allowed)) return true;

  // logged in but wrong role -> send to their own dashboard, not a 404
  return router.createUrlTree([auth.dashboardUrl()]);
};
