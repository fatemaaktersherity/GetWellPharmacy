using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.SaleInvoice;

public class SalePayment
{
    public int Id { get; set; }
    public int SaleId { get; set; }
    public Sale Sale { get; set; } = null!;
    [Column(TypeName = "decimal(18,2)")] public decimal Amount { get; set; }
    [Required, MaxLength(30)] public string PaymentMethod { get; set; } = "Cash";
    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(500)] public string? Note { get; set; }
    public string? ReceivedByUserId { get; set; }
}
