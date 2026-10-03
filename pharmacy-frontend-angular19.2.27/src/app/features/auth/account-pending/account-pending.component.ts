import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

@Component({
    selector: 'app-account-pending',
    standalone: true,
    imports: [MatCardModule, MatButtonModule, MatIconModule],
    templateUrl: './account-pending.component.html',
    styleUrl: './account-pending.component.scss'
})
export class AccountPendingComponent {
    private readonly auth = inject(AuthService);

    logout(): void {
        this.auth.logout();
    }
}