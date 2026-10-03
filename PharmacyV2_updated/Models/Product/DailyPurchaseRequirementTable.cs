using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.Product
{
    public class DailyPurchaseRequirementTable
    {
        [Key]
        public Guid SerialNo { get; set; } 
        public int ProductId { get; set; }
        public Product Product { get; set; } = null!; 
        public int UnitId { get; set; }
        public Unit Unit { get; set; } = null!;
        public decimal LastPurchaseRate { get; set; } 
        public decimal StockQty { get; set; } 
        public decimal RequiredQty { get; set; } 
        public decimal OrdersQty { get; set; } 
    }
}
