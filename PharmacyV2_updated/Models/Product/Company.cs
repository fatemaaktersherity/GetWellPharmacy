using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.Product
{
    // Lookup table for the "Company" filter on the Brand Search / Brand List
    // pages (medex.com.bd-style: Company column + Company filter dropdown).
    // Replaces ProductDetails.Manufacturer (free text) as the source of truth
    // going forward — Manufacturer is left in place for backward compatibility
    // and is kept in sync from Company.Name when a product is saved with a
    // CompanyId.
    public class Company
    {
        [Key]
        public int Id { get; set; }

        [Required, MaxLength(150)]
        public string Name { get; set; } = string.Empty;

        public bool IsActive { get; set; } = true;

        public List<Product> Products { get; set; } = new();
        public List<CompanyDivision> Divisions { get; set; } = new();
    }
}
