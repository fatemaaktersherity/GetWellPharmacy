using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Other;

namespace PharmacyV2.Controllers
{
    [Authorize(Roles = "Admin")]
    [Route("api/[controller]")]
    [ApiController]
    public class UsersController : ControllerBase
    {
        private readonly PharmacyDbContext _db;
        private readonly IPasswordHasher<AppUser> _passwordHasher;
        public UsersController(PharmacyDbContext db, IPasswordHasher<AppUser> passwordHasher)
        {
            _db = db;
            _passwordHasher = passwordHasher;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<UserProfileDto>>> GetAll() =>
            Ok(await _db.AppUsers.Include(u => u.Role).AsNoTracking()
                .Select(u => new UserProfileDto
                {
                    Id = u.Id,
                    Username = u.Username,
                    FullName = u.FullName,
                    Email = u.Email,
                    Phone = u.Phone,
                    IsActive = u.IsActive,
                    RoleName = u.Role != null ? u.Role.Name : null
                }).ToListAsync());

        [HttpPut("{id:int}/role")]
        public async Task<IActionResult> ChangeRole(int id, [FromBody] ChangeRoleDto dto)
        {
            var allowedRoles = new[] { "Admin", "Manager", "Cashier" };
            if (!allowedRoles.Contains(dto.NewRoleName))
                return BadRequest(new { message = "Role must be Admin, Manager, or Cashier." });

            var user = await _db.AppUsers.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == id);
            if (user is null) return NotFound();

            // Protect the last remaining active Admin
            if (user.Role?.Name == "Admin" && dto.NewRoleName != "Admin")
            {
                var otherActiveAdmins = await _db.AppUsers
                    .Include(u => u.Role)
                    .CountAsync(u => u.Id != id && u.IsActive && u.Role != null && u.Role.Name == "Admin");
                if (otherActiveAdmins == 0)
                    return Conflict(new { message = "Cannot change role: at least one active Admin must remain." });
            }

            var newRole = await _db.Roles.FirstOrDefaultAsync(r => r.Name == dto.NewRoleName);
            if (newRole is null) return BadRequest(new { message = "Role does not exist." });

            user.RoleId = newRole.Id;
            await _db.SaveChangesAsync();
            return NoContent();
        }

        [HttpPut("{id:int}/status")]
        public async Task<IActionResult> SetActive(int id, [FromBody] bool isActive)
        {
            var user = await _db.AppUsers.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == id);
            if (user is null) return NotFound();

            if (!isActive && user.Role?.Name == "Admin")
            {
                var otherActiveAdmins = await _db.AppUsers.Include(u => u.Role)
                    .CountAsync(u => u.Id != id && u.IsActive && u.Role != null && u.Role.Name == "Admin");
                if (otherActiveAdmins == 0)
                    return Conflict(new { message = "Cannot deactivate the only active Admin." });
            }

            user.IsActive = isActive;
            await _db.SaveChangesAsync();
            return NoContent();
        }

        [HttpPut("{id:int}/reset-password")]
        public async Task<IActionResult> ResetPassword(int id, [FromBody] AdminResetPasswordDto dto)
        {
            if (dto.NewPassword != dto.ConfirmNewPassword)
                return BadRequest(new { message = "Passwords do not match." });

            var user = await _db.AppUsers.FirstOrDefaultAsync(u => u.Id == id);
            if (user is null) return NotFound();

            user.PasswordHash = _passwordHasher.HashPassword(user, dto.NewPassword);
            await _db.SaveChangesAsync();

            return Ok(new { message = "Password has been reset." });
        }
    }
}
