using PharmacyV2.Models.SaleInvoice;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.SaleInvoice
{
    public class SaleReturn
    {
        public int Id { get; set; }

        [Required, MaxLength(50)]
        public string ReturnNo { get; set; } = string.Empty;

        public DateTime ReturnDate { get; set; } = DateTime.Now;

        public int SaleId { get; set; }
        public Sale SaleInvoice { get; set; } = null!;

        [Column(TypeName = "decimal(18,2)")]
        public decimal ReturnTotal { get; set; }

        [MaxLength(500)]
        public string? Reason { get; set; }
        public bool IsDeleted { get; set; } = false;

        // Scanned/photographed return slip attached to this return. Same
        // optional path/bytes/content-type pattern as Product's image
        // fields — all three are nullable and default to null.
        [MaxLength(500)]
        public string? ReceiptImagePath { get; set; }

        public byte[]? ReceiptImage { get; set; }

        [MaxLength(100)]
        public string? ReceiptImageContentType { get; set; }

        public ICollection<SaleReturnItem> Items { get; set; } = new List<SaleReturnItem>();
        public ICollection<SaleReturnRefund> Refunds { get; set; } = new List<SaleReturnRefund>();
    }
}
