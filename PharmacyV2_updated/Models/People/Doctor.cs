using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.People
{
    public class Doctor
    {
        public int DoctorId { get; set; }

        [Required, MaxLength(150)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? Specialization { get; set; }

        [MaxLength(100)]
        public string? RegistrationNo { get; set; }

        [MaxLength(150)]
        public string? Hospital { get; set; }

        [MaxLength(20)]
        public string? Phone { get; set; }

        [MaxLength(150)]
        public string? Email { get; set; }

        [MaxLength(300)]
        public string? Address { get; set; }

        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<Prescription> Prescriptions { get; set; } = new List<Prescription>();
    }
}