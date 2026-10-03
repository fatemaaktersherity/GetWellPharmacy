using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Other;

namespace PharmacyV2.Controllers
{
    // API for SmsLog — an audit trail of SMS attempts (e.g. order/payment
    // notifications). Had a model + DbSet but no controller.
    //
    // This does NOT send SMS itself — there's no SMS-gateway configuration
    // anywhere in this project (no API keys/settings for one). POST here
    // just records the outcome of a send that happened elsewhere (a 3rd-party
    // gateway call from the frontend, or a future background service), so
    // there's a queryable history of what was sent and whether it succeeded.
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class SmsLogsController : ControllerBase
    {
        private readonly PharmacyDbContext _db;

        public SmsLogsController(PharmacyDbContext db)
        {
            _db = db;
        }

        // GET api/smslogs — filterable audit list.
        [HttpGet]
        public async Task<ActionResult<IEnumerable<SmsLogReadDto>>> GetAll(
            [FromQuery] string? phoneNumber,
            [FromQuery] bool? isSuccess,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            [FromQuery] int take = 200)
        {
            take = take is < 1 or > 1000 ? 200 : take; 
            var query = _db.SmsLogs.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(phoneNumber))
                query = query.Where(s => s.PhoneNumber == phoneNumber);
            if (isSuccess is not null)
                query = query.Where(s => s.IsSuccess == isSuccess);
            if (fromDate is not null)
                query = query.Where(s => s.SentAt >= fromDate);
            if (toDate is not null)
                query = query.Where(s => s.SentAt <= toDate);

            var logs = await query
                .OrderByDescending(s => s.SentAt)
                .Take(take)
                .ToListAsync();

            return Ok(logs.Select(MapToReadDto).ToList());
        }

        // GET api/smslogs/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<SmsLogReadDto>> GetById(int id)
        {
            var log = await _db.SmsLogs.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id);
            if (log is null)
                return NotFoundResponse($"SMS log {id} not found.");

            return Ok(MapToReadDto(log));
        }

        // POST api/smslogs — records the result of an SMS send attempt.
        [HttpPost]
        public async Task<ActionResult<SmsLogReadDto>> Create([FromBody] SmsLogCreateDto dto)
        {
            var log = new SmsLog
            {
                PhoneNumber = dto.PhoneNumber,
                Message = dto.Message,
                SentAt = DateTime.Now,
                IsSuccess = dto.IsSuccess,
                Response = dto.Response
            };

            _db.SmsLogs.Add(log);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetById), new { id = log.Id }, MapToReadDto(log));
        }

        // DELETE api/smslogs/5 — remove a single log entry.
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var log = await _db.SmsLogs.FirstOrDefaultAsync(s => s.Id == id);
            if (log is null)
                return NotFoundResponse($"SMS log {id} not found.");

            _db.SmsLogs.Remove(log);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE api/smslogs/purge?olderThanDays=90 — bulk-clear old log
        // rows so this table doesn't grow forever. Returns how many were removed.
        [Authorize(Roles = "Admin")]
        [HttpDelete("purge")]
        public async Task<ActionResult<object>> Purge([FromQuery] int olderThanDays = 90)
        {
            if (olderThanDays < 1)
                return BadRequestResponse("olderThanDays must be at least 1.");

            var cutoff = DateTime.Now.AddDays(-olderThanDays);
            var toRemove = await _db.SmsLogs.Where(s => s.SentAt < cutoff).ToListAsync();

            _db.SmsLogs.RemoveRange(toRemove);
            await _db.SaveChangesAsync();

            return Ok(new { Deleted = toRemove.Count, CutoffDate = cutoff });
        }

        private static SmsLogReadDto MapToReadDto(SmsLog s) => new()
        {
            Id = s.Id,
            PhoneNumber = s.PhoneNumber,
            Message = s.Message,
            SentAt = s.SentAt,
            IsSuccess = s.IsSuccess,
            Response = s.Response
        };

        private ActionResult NotFoundResponse(string message) => NotFound(new ApiError(message));
        private ActionResult BadRequestResponse(string message) => BadRequest(new ApiError(message));
    }
}