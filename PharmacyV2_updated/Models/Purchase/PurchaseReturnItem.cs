using PharmacyV2.Models.Product;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.Purchase
{
    public class PurchaseReturnItem
    {
        public int Id { get; set; }

        public int PurchaseReturnId { get; set; }
        public PurchaseReturn PurchaseReturn { get; set; } = null!;

        public int ProductId { get; set; }
        public int PurchaseInvoiceItemId { get; set; }
        public Product.Product Product { get; set; } = null!;

        [Column(TypeName = "decimal(18,2)")]
        public decimal Quantity { get; set; }

        public int UnitId { get; set; }
        public Unit Unit { get; set; } = null!;

        [Column(TypeName = "decimal(18,2)")]
        public decimal BaseQuantity { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal UnitCost { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal SubTotal { get; set; }
    }
}
