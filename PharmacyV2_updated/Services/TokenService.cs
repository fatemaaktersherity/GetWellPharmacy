using Microsoft.IdentityModel.Tokens;
using PharmacyV2.Models.Other;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace PharmacyV2.Services
{
    // Reads the "Jwt" section from appsettings.json and issues HS256-signed
    // bearer tokens. Registered as a singleton in Program.cs.
    public class TokenService : ITokenService
    {
        private readonly IConfiguration _config;

        public TokenService(IConfiguration config)
        {
            _config = config;
        }

        public (string Token, DateTime ExpiresAtUtc) CreateToken(AppUser user)
        {
            var jwtSection = _config.GetSection("JwtSettings");
            // Program.cs already validates SecretKey (present, >=32 bytes, not the old
            // placeholder) at startup and fails fast if it's wrong, so reaching this
            // line means it's safe to use. This check is just defense-in-depth in case
            // TokenService is ever constructed outside that startup path (e.g. a test host).
            var key = jwtSection["SecretKey"];
            if (string.IsNullOrWhiteSpace(key))
                throw new InvalidOperationException(
                    "JwtSettings:SecretKey is not configured. See SECURITY.md — set it via " +
                    "'dotnet user-secrets' (local) or the JwtSettings__SecretKey environment " +
                    "variable (staging/production).");
            var issuer = jwtSection["Issuer"];
            var audience = jwtSection["Audience"];
            var expiresMinutes = int.TryParse(jwtSection["ExpiryMinutes"], out var m) ? m : 120;

            // Standard identity claims plus the role name, so [Authorize(Roles = "Admin")]
            // works on controllers/actions without an extra DB lookup per request.
            var claims = new List<Claim>
            {
                new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
                new(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new(ClaimTypes.Name, user.Username),
                new("name", user.FullName),
            };

            if (!string.IsNullOrWhiteSpace(user.Email))
                claims.Add(new Claim(ClaimTypes.Email, user.Email));

            if (user.Role is not null)
                claims.Add(new Claim(ClaimTypes.Role, user.Role.Name));

            var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
            var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
            var expires = DateTime.UtcNow.AddMinutes(expiresMinutes);

            var token = new JwtSecurityToken(
                issuer: issuer,
                audience: audience,
                claims: claims,
                expires: expires,
                signingCredentials: credentials);

            return (new JwtSecurityTokenHandler().WriteToken(token), expires);
        }
    }
}
