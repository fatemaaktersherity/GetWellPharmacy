using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.Models.Other;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace PharmacyV2.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public sealed class ActivityLogsController : ControllerBase
{
    private readonly PharmacyDbContext _db;
    public ActivityLogsController(PharmacyDbContext db) => _db = db;

    // GET api/activitylogs?take=100
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] int take = 100)
    {
        take = Math.Clamp(take, 1, 500);
        var logs = await _db.ActivityLogs.AsNoTracking()
            .OrderByDescending(x => x.OccurredAtUtc)
            .Take(take)
            .Select(x => new
            {
                x.Id,
                x.UserId,
                x.Username,
                x.FullName,
                x.RoleName,
                x.IpAddress,
                x.UserAgent,
                x.OccurredAtUtc
            })
            .ToListAsync();
        return Ok(logs.Select(x => new
        {
            x.Id,
            x.UserId,
            x.Username,
            x.FullName,
            x.RoleName,
            x.IpAddress,
            x.UserAgent,
            OccurredAtUtc = DateTime.SpecifyKind(x.OccurredAtUtc, DateTimeKind.Utc)
        }));
    }

    // Backfills the session that was already active when login tracking was added.
    // JTI makes this safe to call again from the page without duplicate rows.
    [HttpPost("current-session")]
    public async Task<IActionResult> RecordCurrentSession()
    {
        var sessionId = User.FindFirstValue(JwtRegisteredClaimNames.Jti)
            ?? User.FindFirstValue("jti")
            ?? User.FindFirstValue(ClaimTypes.SerialNumber);
        if (string.IsNullOrWhiteSpace(sessionId)) return Unauthorized();
        if (await _db.ActivityLogs.AnyAsync(x => x.SessionId == sessionId)) return NoContent();

        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            return Unauthorized();

        var user = await _db.AppUsers.Include(x => x.Role).AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null) return Unauthorized();

        _db.ActivityLogs.Add(new ActivityLog
        {
            UserId = user.Id,
            SessionId = sessionId,
            Username = user.Username,
            FullName = user.FullName,
            RoleName = user.Role?.Name,
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
            UserAgent = Request.Headers.UserAgent.ToString() is { Length: > 500 } userAgent
                ? userAgent[..500]
                : Request.Headers.UserAgent.ToString(),
            OccurredAtUtc = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
