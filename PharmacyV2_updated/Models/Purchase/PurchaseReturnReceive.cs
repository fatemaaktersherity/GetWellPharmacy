using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.Purchase
{
    public class PurchaseReturnReceive
    {
        public int Id { get; set; }

        public int PurchaseReturnId { get; set; }
        public PurchaseReturn PurchaseReturn { get; set; } = null!;

        [Column(TypeName = "decimal(18,2)")]
        public decimal ReceivedAmount { get; set; }

        public DateTime ReceivedDate { get; set; } = DateTime.Now;

        [Required, MaxLength(30)]
        public string PaymentMethod { get; set; } = "Cash";

        public string? ReceivedByUserId { get; set; }

        [MaxLength(500)]
        public string? Note { get; set; }
    }
}
