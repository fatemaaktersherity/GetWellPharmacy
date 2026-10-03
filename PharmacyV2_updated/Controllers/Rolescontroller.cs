using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Other;

namespace PharmacyV2.Controllers
{
    // CRUD for Role, which AppUser.RoleId and AuthController's Register
    // endpoint depend on. Permission assignment (RolePermission) is a
    // separate module, not covered here — this is just the role itself.
    [Authorize(Roles = "Admin")]
    [Route("api/[controller]")]
    [ApiController]
    public class RolesController : ControllerBase
    {
        private readonly PharmacyDbContext _db;

        public RolesController(PharmacyDbContext db)
        {
            _db = db;
        }

        // GET api/roles
        [HttpGet]
        public async Task<ActionResult<IEnumerable<RoleReadDto>>> GetAll()
        {
            var roles = await _db.Roles
                .AsNoTracking()
                .Select(r => new RoleReadDto
                {
                    Id = r.Id,
                    Name = r.Name,
                    Description = r.Description,
                    IsActive = r.IsActive,
                    UserCount = r.Users.Count
                })
                .ToListAsync();

            return Ok(roles);
        }

        // GET api/roles/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<RoleReadDto>> GetById(int id)
        {
            var role = await _db.Roles
                .AsNoTracking()
                .Where(r => r.Id == id)
                .Select(r => new RoleReadDto
                {
                    Id = r.Id,
                    Name = r.Name,
                    Description = r.Description,
                    IsActive = r.IsActive,
                    UserCount = r.Users.Count
                })
                .FirstOrDefaultAsync();

            if (role is null)
                return NotFoundResponse($"Role {id} not found.");

            return Ok(role);
        }

        // POST api/roles — Name must be unique (DB index).
        [HttpPost]
        public async Task<ActionResult<RoleReadDto>> Create([FromBody] RoleWriteDto dto)
        {
            if (await _db.Roles.AnyAsync(r => r.Name == dto.Name))
                return ConflictResponse($"Role '{dto.Name}' already exists.");

            var role = new Role
            {
                Name = dto.Name,
                Description = dto.Description,
                IsActive = dto.IsActive
            };

            _db.Roles.Add(role);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetById), new { id = role.Id }, new RoleReadDto
            {
                Id = role.Id,
                Name = role.Name,
                Description = role.Description,
                IsActive = role.IsActive,
                UserCount = 0
            });
        }

        // PUT api/roles/5
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] RoleWriteDto dto)
        {
            var role = await _db.Roles.FirstOrDefaultAsync(r => r.Id == id);
            if (role is null)
                return NotFoundResponse($"Role {id} not found.");

            if (await _db.Roles.AnyAsync(r => r.Name == dto.Name && r.Id != id))
                return ConflictResponse($"Role '{dto.Name}' already exists.");

            role.Name = dto.Name;
            role.Description = dto.Description;
            role.IsActive = dto.IsActive;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE api/roles/5 — blocked while any user still holds this role.
        // (DB-level FK is SetNull, which would silently strip users of their
        // role instead of failing — blocking here is the safer default for
        // an access-control table.)
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var role = await _db.Roles.FirstOrDefaultAsync(r => r.Id == id);
            if (role is null)
                return NotFoundResponse($"Role {id} not found.");

            if (await _db.AppUsers.AnyAsync(u => u.RoleId == id))
                return ConflictResponse("Cannot delete a role that users are assigned to.");

            _db.Roles.Remove(role);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        private ActionResult NotFoundResponse(string message) => NotFound(new ApiError(message));
        private ActionResult ConflictResponse(string message) => Conflict(new ApiError(message));
    }
}