using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.DTOs
{
    public class SaleItemReadDto
    {
        public int SaleItemId { get; set; }
        public int ProductStockId { get; set; }
        public int ProductId { get; set; }
        public string? ProductName { get; set; }
        public string? ProductImagePath { get; set; }
        /// <summary>Batch number of the specific ProductStock this line was sold from.</summary>
        public string? BatchNumber { get; set; }
        public DateOnly? ManufacturingDate { get; set; }
        public int UnitId { get; set; }
        public string? UnitName { get; set; }
        public int Quantity { get; set; }
        public decimal BaseQuantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal TotalPrice { get; set; }
    }

    public class SaleItemWriteDto
    {
        [Required]
        public int ProductStockId { get; set; }

        [Required]
        public int UnitId { get; set; }

        [Range(1, int.MaxValue)]
        public int Quantity { get; set; }

        [Range(0, double.MaxValue)]
        public decimal UnitPrice { get; set; }

        // Set true only when a cashier has deliberately chosen to sell a
        // later-expiring batch while an earlier-expiring batch of the same
        // product still has stock (FEFO override). Defaults to false so the
        // API enforces FEFO unless explicitly told not to.
        public bool AllowOutOfOrderBatch { get; set; } = false;
    }

    public class SaleReadDto
    {
        public int SaleId { get; set; }
        public bool RequiresPrescription { get; set; }
        public int? PrescriptionId { get; set; }
        public string? PrescriptionImagePath { get; set; }
        public string InvoiceNo { get; set; } = string.Empty;
        public int? CustomerId { get; set; }
        public string? CustomerName { get; set; }
        public string? CustomerPhone { get; set; }
        public string? CashierName { get; set; }
        public string? TermsAndConditions { get; set; }
        public DateTime SaleDate { get; set; }
        public decimal TotalAmount { get; set; }

        /// <summary>Flat discount applied at the point of sale.</summary>
        public decimal Discount { get; set; }

        /// <summary>TotalAmount - Discount. What the customer actually owes.</summary>
        public decimal NetAmount { get; set; }

        public string PaymentMethod { get; set; } = string.Empty;
        public string? CashierId { get; set; }
        public bool? IsPaid { get; set; }
        public bool IsVoided { get; set; }
        public string? VoidReason { get; set; }
        public DateTime? VoidedAt { get; set; }
        public decimal TotalPaid { get; set; }
        public decimal DueAmount { get; set; }

        public decimal ReturnedAmount { get; set; }
        public bool HasReturns { get; set; }

        public string? ReceiptImagePath { get; set; }
        public string? ReceiptImageContentType { get; set; }

        public List<SaleItemReadDto> Items { get; set; } = new();
    }

    public class SaleCreateDto
    {
        public int? CustomerId { get; set; }
        public bool RequiresPrescription { get; set; } = false;
        public int? PrescriptionId { get; set; }

        public DateTime SaleDate { get; set; } = DateTime.UtcNow;

        [Obsolete("Server-computed from Items; sending this has no effect.")]
        public decimal TotalAmount { get; set; }

        /// <summary>Flat discount to take off the items subtotal. Must not exceed the subtotal.</summary>
        [Range(0, double.MaxValue)]
        public decimal Discount { get; set; } = 0;

        public string PaymentMethod { get; set; } = "Cash";

        public string? CashierId { get; set; }

        [MaxLength(500)]
        public string? TermsAndConditions { get; set; }

        public bool? IsPaid { get; set; } = null;

        [MinLength(1)]
        public List<SaleItemWriteDto> Items { get; set; } = new();
    }

    public class SaleUpdateDto
    {
        public int? CustomerId { get; set; }

        public DateTime? SaleDate { get; set; }

        public string PaymentMethod { get; set; } = "Cash";

        public string? CashierId { get; set; }

        public bool? IsPaid { get; set; } = null;

        public List<SaleItemSyncDto>? Items { get; set; }
    }

    public class SalePaymentDto
    {
        // No longer restricted to a hardcoded Cash/Card/Mobile Banking list —
        // SalesController now validates this against the active PaymentMethods
        // table at request time, so any method configured there works here too.
        [Required, MaxLength(50)]
        public string PaymentMethod { get; set; } = "Cash";
        [Range(0.01, double.MaxValue)] public decimal? Amount { get; set; }
        [MaxLength(500)] public string? Note { get; set; }
    }

    public class SaleVoidDto
    {
        [Required, MaxLength(500)]
        public string Reason { get; set; } = string.Empty;
    }

    public class SaleItemSyncDto : SaleItemWriteDto
    {

        public int? SaleItemId { get; set; }
    }
}
