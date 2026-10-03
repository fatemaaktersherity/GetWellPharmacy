using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using PharmacyV2.Models.Branch;

namespace PharmacyV2.Models.Product
{
    // This class represents a product rack in a warehouse.
    public class ProductRak
    {
        [Key]
        public int Id { get; set; }

        public int WarehouseId { get; set; }
        public Warehouse Warehouse { get; set; } = null!;

        [Required, MaxLength(100)]
        public string Name { get; set; } = string.Empty;

        [Column(TypeName = "decimal(18,2)")]
        public decimal? Capacity { get; set; }

        public bool IsActive { get; set; } = true;

        public ICollection<ProductStock> ProductStocks { get; set; } = new List<ProductStock>();
    }
}
