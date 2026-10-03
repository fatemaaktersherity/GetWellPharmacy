import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom, Observable, map } from 'rxjs';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly dialog = inject(MatDialog);

  /** Returns an Observable<boolean> — true if the user confirmed. */
  confirm(data: ConfirmDialogData): Observable<boolean> {
    return this.dialog
      .open(ConfirmDialogComponent, { width: '420px', data, autoFocus: false })
      .afterClosed()
      .pipe(map(result => result === true));
  }

  /** Promise form for component event handlers that previously used window.confirm(). */
  confirmAsync(data: ConfirmDialogData): Promise<boolean> {
    return firstValueFrom(this.confirm(data));
  }

  /** Convenience for the common "Delete this X?" case. */
  confirmDelete(itemLabel: string): Observable<boolean> {
    return this.confirm({
      title: 'Delete confirmation',
      message: `Delete this ${itemLabel}? This action cannot be undone.`,
      confirmText: 'Delete',
      danger: true
    });
  }
}
