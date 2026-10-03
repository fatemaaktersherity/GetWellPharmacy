using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.People
{
    // Detail record — many contacts belong to one Supplier (master).
    // Managed through SuppliersController (nested create/update, plus
    // dedicated /contacts endpoints).
    public class SupplierContact
    {
        [Key]
        public int Id { get; set; }

        public int SupplierId { get; set; }
        public Supplier Supplier { get; set; } = null!;

        [Required, MaxLength(100)]
        public string ContactName { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? Designation { get; set; }

        [MaxLength(20)]
        public string? Phone { get; set; }

        public bool IsPrimary { get; set; } = false;
    }
}
