using PharmacyV2.Models.Product;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.Purchase
{
    // "Order Detail" rows from Order System / Manual Order / Order Checking.
    // Many-to-one back to PurchaseOrder (a PurchaseOrder has many items).
    public class PurchaseOrderItem
    {
        public int Id { get; set; }

        public int PurchaseOrderId { get; set; }
        public PurchaseOrder PurchaseOrder { get; set; } = null!;

        public int ProductId { get; set; }
        public Product.Product Product { get; set; } = null!;

        public int UnitId { get; set; }
        public Unit Unit { get; set; } = null!;

        // "Last Purchase Price" snapshot at order time
        [Column(TypeName = "decimal(18,2)")]
        public decimal LastPurchasePrice { get; set; }

        // "StockQty" snapshot at order time
        [Column(TypeName = "decimal(18,2)")]
        public decimal StockQty { get; set; }

        // "RequiredQty/MinQty"
        [Column(TypeName = "decimal(18,2)")]
        public decimal RequiredQty { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal OrderQty { get; set; }

        // "Cancel Box"
        public bool IsCancelled { get; set; } = false;
    }
}