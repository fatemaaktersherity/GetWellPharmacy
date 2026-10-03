using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.Other;

/// <summary>Persistent record of a successful user sign-in.</summary>
public class ActivityLog
{
    public long Id { get; set; }
    public int? UserId { get; set; }
    [MaxLength(36)] public string? SessionId { get; set; }
    [Required, MaxLength(100)] public string Username { get; set; } = string.Empty;
    [Required, MaxLength(200)] public string FullName { get; set; } = string.Empty;
    [MaxLength(100)] public string? RoleName { get; set; }
    [MaxLength(45)] public string? IpAddress { get; set; }
    [MaxLength(500)] public string? UserAgent { get; set; }
    public DateTime OccurredAtUtc { get; set; } = DateTime.UtcNow;
}
