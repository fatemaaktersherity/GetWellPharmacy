using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Other;
using PharmacyV2.Services;
using System.Security.Claims;

namespace PharmacyV2.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly PharmacyDbContext _db;
        private readonly ITokenService _tokenService;
        private readonly IPasswordHasher<AppUser> _passwordHasher;

        public AuthController(PharmacyDbContext db, ITokenService tokenService, IPasswordHasher<AppUser> passwordHasher)
        {
            _db = db;
            _tokenService = tokenService;
            _passwordHasher = passwordHasher;
        }

        [Authorize(Roles = "Admin")]
        [HttpPost("register")]
        public async Task<ActionResult<RegisterResponseDto>> Register([FromBody] RegisterRequestDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Username) || string.IsNullOrWhiteSpace(dto.FullName))
                return BadRequest(new { message = "Username and full name are required." });

            if (await _db.AppUsers.AnyAsync(u => u.Username == dto.Username))
                return Conflict(new { message = $"Username '{dto.Username}' is already taken." });

            if (!string.IsNullOrWhiteSpace(dto.Email) && await _db.AppUsers.AnyAsync(u => u.Email == dto.Email))
                return Conflict(new { message = "An account with this email already exists." });

            if (dto.RoleId is not null && !await _db.Roles.AnyAsync(r => r.Id == dto.RoleId))
                return BadRequest(new { message = $"Role {dto.RoleId} does not exist." });

            // Every account must have a role. RoleId is optional on the request so
            // an Admin doesn't have to look up an id for the common case, but "not
            // specified" must still mean "Cashier" (least privilege), never "no role
            // at all" — a no-role account gets a JWT with no Role claim, which the
            // Angular app's role guard cannot route anywhere and loops on.
            var roleId = dto.RoleId ?? (await GetOrCreateDefaultUserRoleAsync()).Id;

            var user = new AppUser
            {
                Username = dto.Username,
                FullName = dto.FullName,
                Email = dto.Email,
                Phone = dto.Phone,
                RoleId = roleId,
                IsActive = true
            };
            user.PasswordHash = _passwordHasher.HashPassword(user, dto.Password);

            _db.AppUsers.Add(user);
            await _db.SaveChangesAsync();

            await _db.Entry(user).Reference(u => u.Role).LoadAsync();

            return StatusCode(201, new RegisterResponseDto
            {
                UserId = user.Id,
                Username = user.Username,
                FullName = user.FullName,
                RoleName = user.Role?.Name
            });
        }

        [AllowAnonymous]
        [HttpPost("login")]
        public async Task<ActionResult<AuthResponseDto>> Login([FromBody] LoginRequestDto dto)
        {
            var login = dto.Username.Trim();
            var user = await _db.AppUsers
                .Include(u => u.Role)
                .FirstOrDefaultAsync(u =>
                    u.Username == login ||
                    u.Email == login ||
                    u.Phone == login);

            if (user is null)
                return Unauthorized(new { message = "Invalid email or password." });

            if (!user.IsActive)
                return Unauthorized(new { message = "Your account is inactive. Please contact an administrator." });

            var verifyResult = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, dto.Password);
            if (verifyResult == PasswordVerificationResult.Failed)
                return Unauthorized(new { message = "Invalid email or password." });

            // Self-healing safety net: every account is now supposed to get a role
            // at creation time, but this catches any pre-existing row that somehow
            // still has RoleId == null, so it never issues a token with no Role
            // claim (which the Angular app's guard has nowhere valid to send).
            if (user.RoleId is null)
            {
                var defaultRole = await GetOrCreateDefaultUserRoleAsync();
                user.RoleId = defaultRole.Id;
                user.Role = defaultRole;
                await _db.SaveChangesAsync();
            }

            var (token, expires) = _tokenService.CreateToken(user);

            _db.ActivityLogs.Add(new ActivityLog
            {
                UserId = user.Id,
                SessionId = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(token).Id,
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

            return Ok(new AuthResponseDto
            {
                UserId = user.Id,
                Username = user.Username,
                FullName = user.FullName,
                RoleName = user.Role?.Name,
                Token = token,
                ExpiresAtUtc = expires
            });
        }

        [Authorize]
        [HttpGet("me")]
        public async Task<ActionResult<UserProfileDto>> Me()
        {
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!int.TryParse(userIdClaim, out var userId))
                return Unauthorized();

            var user = await _db.AppUsers
                .Include(u => u.Role)
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user is null)
                return NotFound();

            return Ok(new UserProfileDto
            {
                Id = user.Id,
                Username = user.Username,
                FullName = user.FullName,
                Email = user.Email,
                Phone = user.Phone,
                IsActive = user.IsActive,
                RoleName = user.Role?.Name
            });
        }

        [AllowAnonymous]
        [HttpPost("register-public")]
        public async Task<ActionResult<RegisterResponseDto>> RegisterPublic([FromBody] PublicRegisterRequestDto dto)
        {
            if (dto.Password != dto.ConfirmPassword)
                return BadRequest(new { message = "Passwords do not match." });

            if (await _db.AppUsers.AnyAsync(u => u.Email == dto.Email))
                return Conflict(new { message = "An account with this email already exists." });

            var username = dto.Email.Trim();
            if (await _db.AppUsers.AnyAsync(u => u.Username == username))
                return Conflict(new { message = "An account with this email already exists." });

            var userRole = await GetOrCreateDefaultUserRoleAsync();

            var user = new AppUser
            {
                Username = username,
                FullName = dto.FullName,
                Email = dto.Email.Trim(),
                Phone = dto.Phone,
                RoleId = userRole.Id,
                IsActive = true
            };
            user.PasswordHash = _passwordHasher.HashPassword(user, dto.Password);

            _db.AppUsers.Add(user);
            await _db.SaveChangesAsync();

            return StatusCode(201, new RegisterResponseDto
            {
                UserId = user.Id,
                Username = user.Username,
                FullName = user.FullName,
                RoleName = "Cashier"
            });
        }

        // Ensures every account has a role. Shared by Register, RegisterPublic,
        // and Login (self-healing fallback).
        private async Task<Role> GetOrCreateDefaultUserRoleAsync()
        {
            var userRole = await _db.Roles.FirstOrDefaultAsync(r => r.Name == "Cashier");
            if (userRole is null)
            {
                userRole = new Role
                {
                    Name = "Cashier",
                    Description = "POS / limited access",
                    IsActive = true
                };
                _db.Roles.Add(userRole);
                await _db.SaveChangesAsync();
            }
            return userRole;
        }

        [Authorize]
        [HttpPost("change-password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
        {
            if (dto.NewPassword != dto.ConfirmNewPassword)
                return BadRequest(new { message = "New passwords do not match." });

            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!int.TryParse(userIdClaim, out var userId))
                return Unauthorized();

            var user = await _db.AppUsers.FirstOrDefaultAsync(u => u.Id == userId);
            if (user is null)
                return NotFound();

            var verifyResult = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, dto.CurrentPassword);
            if (verifyResult == PasswordVerificationResult.Failed)
                return BadRequest(new { message = "Current password is incorrect." });

            user.PasswordHash = _passwordHasher.HashPassword(user, dto.NewPassword);
            await _db.SaveChangesAsync();

            return Ok(new { message = "Password changed successfully." });
        }

        [AllowAnonymous]
        [HttpPost("forgot-password")]
        public async Task<IActionResult> ForgotPassword([FromBody] PublicResetPasswordDto dto)
        {
            if (dto.NewPassword != dto.ConfirmNewPassword)
                return BadRequest(new { message = "New passwords do not match." });

            var email = dto.Email.Trim();
            var phone = dto.Phone.Trim();

            var user = await _db.AppUsers.FirstOrDefaultAsync(u =>
                u.Email == email && u.Phone == phone);

            // Deliberately vague message: don't reveal whether the email exists
            // but the phone didn't match, vs. neither existing at all.
            if (user is null)
                return BadRequest(new { message = "No account matches that email and phone number." });

            if (!user.IsActive)
                return BadRequest(new { message = "This account is deactivated. Contact an Administrator." });

            user.PasswordHash = _passwordHasher.HashPassword(user, dto.NewPassword);
            await _db.SaveChangesAsync();

            return Ok(new { message = "Password reset successfully. You can now sign in." });
        }
    }
}
