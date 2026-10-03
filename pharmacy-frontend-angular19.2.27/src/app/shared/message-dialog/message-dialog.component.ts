import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export type MessageDialogType = 'info' | 'success' | 'warning' | 'error';

export interface MessageDialogData {
  title?: string;
  message: string;
  type?: MessageDialogType;
  okText?: string;
}

@Component({
  selector: 'app-message-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="dialog-shell" [class]="data.type || 'info'">
      <button mat-icon-button type="button" class="close-btn" (click)="close()" aria-label="Close">
        <mat-icon>close</mat-icon>
      </button>
      <div class="icon-circle">
        <mat-icon>{{ icon }}</mat-icon>
      </div>
      <h2 class="title">{{ data.title || defaultTitle }}</h2>
      <p class="message">{{ data.message }}</p>
      <div class="actions">
        <button mat-raised-button color="primary" type="button" (click)="close()">
          {{ data.okText || 'OK' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      overflow-x: hidden;
    }
    .dialog-shell {
      position: relative;
      box-sizing: border-box;
      padding: 32px 24px 24px;
      text-align: center;
    }
    .close-btn {
      position: absolute;
      top: 4px;
      right: 4px;
      color: rgba(0, 0, 0, 0.45);
    }
    .icon-circle {
      width: 56px;
      height: 56px;
      margin: 0 auto 12px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon-circle mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }
    .dialog-shell.error .icon-circle { background: rgba(211, 47, 47, 0.1); }
    .dialog-shell.error .icon-circle mat-icon { color: #d32f2f; }
    .dialog-shell.warning .icon-circle { background: rgba(237, 108, 2, 0.1); }
    .dialog-shell.warning .icon-circle mat-icon { color: #ed6c02; }
    .dialog-shell.success .icon-circle { background: rgba(46, 125, 50, 0.1); }
    .dialog-shell.success .icon-circle mat-icon { color: #2e7d32; }
    .dialog-shell.info .icon-circle { background: rgba(63, 81, 181, 0.1); }
    .dialog-shell.info .icon-circle mat-icon { color: #3f51b5; }
    .title {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 600;
      color: rgba(0, 0, 0, 0.87);
    }
    .message {
      margin: 0 0 24px;
      max-width: 100%;
      color: rgba(0, 0, 0, 0.65);
      line-height: 1.5;
      white-space: pre-line;
      word-break: break-word;
    }
    .actions {
      display: flex;
      justify-content: center;
    }
    .actions button {
      min-width: 100px;
    }
  `]
})
export class MessageDialogComponent {
  readonly dialogRef: MatDialogRef<MessageDialogComponent, void> =
    inject(MatDialogRef<MessageDialogComponent, void>);
  readonly data: MessageDialogData = inject<MessageDialogData>(MAT_DIALOG_DATA);

  get icon(): string {
    switch (this.data.type) {
      case 'error': return 'error';
      case 'warning': return 'warning';
      case 'success': return 'check_circle';
      default: return 'info';
    }
  }

  get defaultTitle(): string {
    switch (this.data.type) {
      case 'error': return 'Error';
      case 'warning': return 'Warning';
      case 'success': return 'Success';
      default: return 'Notice';
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}