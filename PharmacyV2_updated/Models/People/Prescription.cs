using System.ComponentModel.DataAnnotations;
using PharmacyV2.Models.SaleInvoice;

namespace PharmacyV2.Models.People
{
    public class Prescription
    {
        public int PrescriptionId { get; set; }

        public int DoctorId { get; set; }
        public Doctor Doctor { get; set; } = null!;

        public int CustomerId { get; set; }
        public Customer Customer { get; set; } = null!;

        public DateTime PrescriptionDate { get; set; } = DateTime.UtcNow;

        [MaxLength(1000)]
        public string? Diagnosis { get; set; }

        [MaxLength(1000)]
        public string? Notes { get; set; }

        [MaxLength(500)]
        public string? ImagePath { get; set; }
        public byte[]? Image { get; set; }
        [MaxLength(100)]
        public string? ImageContentType { get; set; }

        public int? SaleId { get; set; }
        public Sale? Sale { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<PrescriptionItem> Items { get; set; } = new List<PrescriptionItem>();
    }
}