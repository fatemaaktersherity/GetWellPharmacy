using System.ComponentModel.DataAnnotations.Schema;
using PharmacyV2.Models.Product;

namespace PharmacyV2.Models.SaleInvoice
{
    public class SaleReturnItem
    {
        public int Id { get; set; }

        public int SaleReturnId { get; set; }
        public SaleReturn SaleReturn { get; set; } = null!;

        public int MedicineId { get; set; }
        public int SaleItemId { get; set; }
        public Product.Product Medicine { get; set; } = null!;

        [Column(TypeName = "decimal(18,2)")]
        public decimal Quantity { get; set; }

        public int UnitId { get; set; }
        public Unit Unit { get; set; } = null!;

        [Column(TypeName = "decimal(18,2)")]
        public decimal BaseQuantity { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal SalesPrice { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal SubTotal { get; set; }
    }
}
