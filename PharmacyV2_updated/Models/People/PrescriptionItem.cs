using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.People
{
    public class PrescriptionItem
    {
        public int Id { get; set; }

        public int PrescriptionId { get; set; }
        public Prescription Prescription { get; set; } = null!;

        public int? ProductId { get; set; }
        public PharmacyV2.Models.Product.Product? Product { get; set; }

        [Required, MaxLength(200)]
        public string MedicineName { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? Dosage { get; set; }

        [MaxLength(100)]
        public string? Duration { get; set; }

        [MaxLength(300)]
        public string? Instructions { get; set; }
    }
}