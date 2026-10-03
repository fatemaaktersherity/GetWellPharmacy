using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.Product
{
    // Lookup table for the "Dosage Form" filter on the Brand Search page
    // (Tablet, Oral Suspension, Injection, Suppository, IV Infusion, etc.).
    // Seeded with common forms like Unit, extendable via DosageFormsController.
    public class DosageForm
    {
        [Key]
        public int Id { get; set; }

        [Required, MaxLength(100)]
        public string Name { get; set; } = string.Empty;

        public List<Product> Products { get; set; } = new();
    }
}
