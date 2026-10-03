using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using PharmacyV2.Models.People;
using PharmacyV2.Models.Product;

namespace PharmacyV2.Models.SaleInvoice
{
    public class Sale
    {
        public int SaleId { get; set; }

        [MaxLength(50)]
        public string InvoiceNo { get; set; } = string.Empty;

        public int? CustomerId { get; set; }
        public Customer? Customer { get; set; }

        public DateTime SaleDate { get; set; }
        public bool RequiresPrescription { get; set; } = false;

        public int? PrescriptionId { get; set; }
        public Prescription? Prescription { get; set; }

        public decimal TotalAmount { get; set; }

        /// <summary>
        /// Flat discount taken off TotalAmount at the point of sale. Defaults to 0 for all
        /// existing/legacy sales. Net amount owed = TotalAmount - Discount.
        /// </summary>
        [Column(TypeName = "decimal(18,2)")]
        public decimal Discount { get; set; } = 0;

        public string PaymentMethod { get; set; } = "Cash";

        public string? CashierId { get; set; }

        [MaxLength(200)]
        public string? CashierName { get; set; }

        [MaxLength(500)]
        public string? TermsAndConditions { get; set; }

        public bool? IsPaid { get; set; } = null;

        public bool IsVoided { get; set; } = false;
        [MaxLength(500)] public string? VoidReason { get; set; }
        public DateTime? VoidedAt { get; set; }
        public string? VoidedByUserId { get; set; }

        [MaxLength(500)]
        public string? ReceiptImagePath { get; set; }

        public byte[]? ReceiptImage { get; set; }

        [MaxLength(100)]
        public string? ReceiptImageContentType { get; set; }

        public ICollection<SaleItem> Items { get; set; } = new List<SaleItem>();
        public ICollection<SalePayment> Payments { get; set; } = new List<SalePayment>();
    }

}
