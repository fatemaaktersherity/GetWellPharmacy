import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

let isHandlingExpiredSession = false;

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);
  const router = inject(Router);

  return next(req).pipe(
    catchError(err => {
      // A JWT is intentionally short-lived. Without this guard an expired
      // token made every dashboard request fail and looked like five separate
      // data problems. Clear the unusable session and request a fresh login.
      if (err.status === 401 && !req.url.includes('/api/auth/login')) {
        if (!isHandlingExpiredSession) {
          isHandlingExpiredSession = true;
          localStorage.removeItem('pharmacy_user');
          localStorage.removeItem('pharmacy_token');
          snackBar.open('Your session has expired. Please sign in again.', 'Close', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
          router.navigate(['/login']).finally(() => { isHandlingExpiredSession = false; });
        }
        return throwError(() => err);
      }

      // Individual components already show the error to the user (via a dialog
      // or their own snackbar) in their subscribe's error callback. Showing a
      // second, generic snackbar here duplicated that message on screen, so we
      // just forward the error and let the calling component decide how to
      // display it.
      return throwError(() => err);
    })
  );
};