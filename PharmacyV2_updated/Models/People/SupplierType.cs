using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.People
{
    // Lookup table for Supplier.SupplierTypeId. No controller — seeded via
    // HasData() in PharmacyDbContext.
    public class SupplierType
    {
        [Key]
        public int Id { get; set; }

        [Required, MaxLength(50)]
        public string Name { get; set; } = string.Empty;

        public List<Supplier> Suppliers { get; set; } = new();
    }
}
