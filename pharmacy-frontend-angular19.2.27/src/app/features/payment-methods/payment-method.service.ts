import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";

export interface PaymentMethod {
  id: number;
  name: string;
  ledgerAccountCode?: string;
  isActive: boolean;
}

export interface PaymentMethodWrite {
  name: string;
  ledgerAccountCode?: string;
  isActive: boolean;
}

@Injectable({
  providedIn: "root",
})
export class PaymentMethodService {
  private apiUrl = `${environment.apiUrl}/PaymentMethods`;

  constructor(private http: HttpClient) { }

  // GET ALL
  getAll(): Observable<PaymentMethod[]> {
    return this.http.get<PaymentMethod[]>(this.apiUrl);
  }

  // GET BY ID
  getById(id: number): Observable<PaymentMethod> {
    return this.http.get<PaymentMethod>(`${this.apiUrl}/${id}`);
  }

  // CREATE
  create(paymentMethod: PaymentMethodWrite): Observable<PaymentMethod> {
    return this.http.post<PaymentMethod>(this.apiUrl, paymentMethod);
  }

  // UPDATE
  update(id: number, paymentMethod: PaymentMethodWrite): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/${id}`, paymentMethod);
  }

  // DELETE / DEACTIVATE
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
