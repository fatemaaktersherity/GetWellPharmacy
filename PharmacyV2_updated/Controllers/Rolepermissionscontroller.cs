using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Other;

namespace PharmacyV2.Controllers
{
    // API for RolePermission — the per-module CanView/CanCreate/CanEdit/
    // CanDelete matrix for a Role. Had a model + DbSet + fluent config
    // (unique on RoleId+Module, cascade-deletes with its Role) but no
    // controller. Nested under /api/roles/{roleId}/permissions rather than
    // a top-level resource, since a permission row is meaningless without
    // its role.
    [Authorize(Roles = "Admin")]
    [Route("api/roles/{roleId:int}/permissions")]
    [ApiController]
    public class RolePermissionsController : ControllerBase
    {
        private readonly PharmacyDbContext _db;

        public RolePermissionsController(PharmacyDbContext db)
        {
            _db = db;
        }

        // GET api/roles/5/permissions — the full matrix for this role
        // (only the modules that have an explicit row; anything not listed
        // has no access).
        [HttpGet]
        public async Task<ActionResult<IEnumerable<RolePermissionReadDto>>> GetAll(int roleId)
        {
            if (!await _db.Roles.AnyAsync(r => r.Id == roleId))
                return NotFoundResponse($"Role {roleId} not found.");

            var permissions = await _db.RolePermissions
                .AsNoTracking()
                .Where(p => p.RoleId == roleId)
                .Select(p => MapToReadDto(p))
                .ToListAsync();

            return Ok(permissions);
        }

        // PUT api/roles/5/permissions — replaces the entire matrix in one
        // call: for each {module, canView, canCreate, canEdit, canDelete} in
        // the body, upsert that module's row; any existing module row NOT
        // present in the body is removed (so unchecking a module in the UI
        // and saving actually revokes it). This matches how a permissions
        // screen is normally built — one grid, one Save.
        [HttpPut]
        public async Task<ActionResult<IEnumerable<RolePermissionReadDto>>> SetAll(int roleId, [FromBody] List<RolePermissionSetDto> permissions)
        {
            if (!await _db.Roles.AnyAsync(r => r.Id == roleId))
                return NotFoundResponse($"Role {roleId} not found.");

            var moduleNames = permissions.Select(p => p.Module).ToList();
            if (moduleNames.Distinct(StringComparer.OrdinalIgnoreCase).Count() != moduleNames.Count)
                return BadRequestResponse("Each module can only appear once in the list.");

            var existing = await _db.RolePermissions.Where(p => p.RoleId == roleId).ToListAsync();

            // Remove rows for modules no longer in the submitted matrix.
            var toRemove = existing.Where(e => !moduleNames.Contains(e.Module, StringComparer.OrdinalIgnoreCase)).ToList();
            _db.RolePermissions.RemoveRange(toRemove);

            foreach (var dto in permissions)
            {
                var row = existing.FirstOrDefault(e => string.Equals(e.Module, dto.Module, StringComparison.OrdinalIgnoreCase));
                if (row is null)
                {
                    row = new RolePermission { RoleId = roleId, Module = dto.Module };
                    _db.RolePermissions.Add(row);
                }

                row.CanView = dto.CanView;
                row.CanCreate = dto.CanCreate;
                row.CanEdit = dto.CanEdit;
                row.CanDelete = dto.CanDelete;
            }

            await _db.SaveChangesAsync();

            var result = await _db.RolePermissions
                .AsNoTracking()
                .Where(p => p.RoleId == roleId)
                .Select(p => MapToReadDto(p))
                .ToListAsync();

            return Ok(result);
        }

        // DELETE api/roles/5/permissions/Sales — revoke access to a single module.
        [HttpDelete("{module}")]
        public async Task<IActionResult> DeleteOne(int roleId, string module)
        {
            var row = await _db.RolePermissions
                .FirstOrDefaultAsync(p => p.RoleId == roleId && p.Module.ToLower() == module.ToLower());

            if (row is null)
                return NotFoundResponse($"No permission row for module '{module}' on role {roleId}.");

            _db.RolePermissions.Remove(row);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        private static RolePermissionReadDto MapToReadDto(RolePermission p) => new()
        {
            Id = p.Id,
            Module = p.Module,
            CanView = p.CanView,
            CanCreate = p.CanCreate,
            CanEdit = p.CanEdit,
            CanDelete = p.CanDelete
        };

        private ActionResult NotFoundResponse(string message) => NotFound(new ApiError(message));
        private ActionResult BadRequestResponse(string message) => BadRequest(new ApiError(message));
    }
}