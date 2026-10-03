using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.Product
{
    // This class represents the details of a product in the pharmacy system.
    public class ProductDetails
    {
        public int Id { get; set; }

        public int ProductId { get; set; }
        public Product Product { get; set; } = null!;

        [MaxLength(50)]
        public string? Schedule { get; set; } // H, H1, X etc.

        [MaxLength(100)]
        public string? DarNo { get; set; } // Drug Administration Registration

        public string StorageConditions { get; set; } = string.Empty;   

        [Column(TypeName = "decimal(5,2)")]
        public decimal? TemperatureMin { get; set; }

        [Column(TypeName = "decimal(5,2)")]
        public decimal? TemperatureMax { get; set; }

        public string? Description { get; set; }

        [MaxLength(1000)]
        public string? Composition { get; set; }

        [MaxLength(1000)]
        public string? SideEffects { get; set; }

        [MaxLength(50)]
        public string? PregnancyCategory { get; set; }
        public bool RequiresPrescription { get; set; } = false;
        public bool IsControlledDrug { get; set; } = false;
    }
}
