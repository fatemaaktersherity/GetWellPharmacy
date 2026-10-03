import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, map } from 'rxjs';
import { MessageDialogComponent, MessageDialogData, MessageDialogType } from './message-dialog.component';

@Injectable({ providedIn: 'root' })
export class MessageDialogService {
    private readonly dialog: MatDialog = inject(MatDialog);

    show(message: string, type: MessageDialogType = 'info', title?: string): Observable<void> {
        return this.dialog
            .open<MessageDialogComponent, MessageDialogData, void>(MessageDialogComponent, {
                width: '380px',
                data: { message, type, title },
                autoFocus: false
            })
            .afterClosed()
            .pipe(map(() => undefined));
    }

    error(message: string, title?: string): Observable<void> {
        return this.show(message, 'error', title);
    }

    warning(message: string, title?: string): Observable<void> {
        return this.show(message, 'warning', title);
    }

    success(message: string, title?: string): Observable<void> {
        return this.show(message, 'success', title);
    }

    info(message: string, title?: string): Observable<void> {
        return this.show(message, 'info', title);
    }
}