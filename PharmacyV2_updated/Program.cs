using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using PharmacyV2.Data;
using PharmacyV2.Models.Other;
using PharmacyV2.Services;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// ── Controllers: require auth by default (AuthController uses [AllowAnonymous] to opt-out) ──
builder.Services.AddControllers(options =>
{
    var policy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
    options.Filters.Add(new AuthorizeFilter(policy));
});

// ── Swagger + JWT support ──
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "PharmacyV2 API", Version = "v1" });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Example: \"Authorization: Bearer {token}\"",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

// ── Database ──
builder.Services.AddDbContext<PharmacyDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// ── Identity (password hashing only) ──
builder.Services.AddScoped<IPasswordHasher<AppUser>, PasswordHasher<AppUser>>();
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<PurchaseOrderReceivingService>();
builder.Services.AddSingleton<LiveUpdateService>();

// ── JWT Authentication ──
var jwtSettings = builder.Configuration.GetSection("JwtSettings");
// SecretKey is deliberately absent from appsettings*.json (never commit a
// signing key to source control). It must come from either:
//   - dotnet user-secrets (local development — see SECURITY.md), or
//   - the JwtSettings__SecretKey environment variable / a secret manager
//     (staging/production).
// Both fail fast below rather than silently starting with a weak/known key.
var secretKey = jwtSettings["SecretKey"];

if (string.IsNullOrWhiteSpace(secretKey))
{
    throw new InvalidOperationException(
        "JwtSettings:SecretKey is not configured. For local development run " +
        "'dotnet user-secrets set \"JwtSettings:SecretKey\" \"<your-generated-key>\"' " +
        "from the PharmacyV2_updated project folder. In staging/production set the " +
        "JwtSettings__SecretKey environment variable or a secret-manager equivalent. " +
        "See SECURITY.md for details and a key-generation command.");
}

if (Encoding.UTF8.GetByteCount(secretKey) < 32)
{
    throw new InvalidOperationException(
        "JwtSettings:SecretKey must be at least 32 bytes (256 bits) for HS256. " +
        "Generate a new one, e.g.: openssl rand -base64 48");
}

if (secretKey == "YourSuperSecretKeyForPharmacyV2MustBeAtLeast32Chars!")
{
    throw new InvalidOperationException(
        "JwtSettings:SecretKey is still set to the old placeholder value that used to " +
        "be committed to source control. Generate a fresh secret and use that instead " +
        "— see SECURITY.md.");
}

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings["Issuer"],
        ValidAudience = jwtSettings["Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey)),
        ClockSkew = TimeSpan.Zero
    };
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var token = context.Request.Query["access_token"];
            if (!string.IsNullOrEmpty(token) && context.HttpContext.Request.Path.StartsWithSegments("/api/live/stream"))
                context.Token = token;
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

// ── Application services ──
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<IAccountingPostingService, AccountingPostingService>();
builder.Services.AddScoped<ICodeGeneratorService, CodeGeneratorService>();

// ── CORS ──
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// A row-version conflict means another cashier/process changed the same stock
// batch after this request read it. Treat it as a normal business conflict,
// never as an opaque 500 error.
app.Use(async (context, next) =>
{
    try { await next(); }
    catch (DbUpdateConcurrencyException)
    {
        context.Response.StatusCode = StatusCodes.Status409Conflict;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new { message = "This record was changed by another user. Refresh stock and try again." });
    }
});

// ── Seed data on startup ──
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<PharmacyDbContext>();
        await context.Database.MigrateAsync();
        await SeedData.SeedSampleDataAsync(context);
        await services.GetRequiredService<IAccountingPostingService>().EnsureSystemAccountsAsync();
        await SeedData.WarnAboutUnmappedPaymentMethodsAsync(context, services.GetRequiredService<ILogger<Program>>());
    }
    catch (Exception ex)
    {
        var logger = services.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "An error occurred while seeding the database.");
    }
}

// ── Middleware pipeline ──
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("AllowAll");
app.UseStaticFiles();   // serves wwwroot/images/...
app.UseAuthentication();
app.UseAuthorization();
app.Use(async (context, next) =>
{
    await next();
    var method = context.Request.Method;
    if ((HttpMethods.IsPost(method) || HttpMethods.IsPut(method) || HttpMethods.IsPatch(method) || HttpMethods.IsDelete(method))
        && context.Response.StatusCode is >= 200 and < 300)
    {
        var path = context.Request.Path.Value ?? "/";
        var resource = path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase)
            ? path[5..].Split('/', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "data"
            : "data";
        context.RequestServices.GetRequiredService<LiveUpdateService>().Publish(resource);
    }
});
app.MapGet("/api/live/stream", async (HttpContext context, LiveUpdateService updates) =>
{
    context.Response.Headers.ContentType = "text/event-stream";
    context.Response.Headers.CacheControl = "no-cache";
    context.Response.Headers["X-Accel-Buffering"] = "no";
    var (id, reader) = updates.Subscribe();
    try
    {
        await context.Response.WriteAsync(": connected\n\n");
        await context.Response.Body.FlushAsync();
        await foreach (var message in reader.ReadAllAsync(context.RequestAborted))
        {
            await context.Response.WriteAsync($"event: data-changed\ndata: {message}\n\n", context.RequestAborted);
            await context.Response.Body.FlushAsync(context.RequestAborted);
        }
    }
    catch (OperationCanceledException) { }
    finally { updates.Unsubscribe(id); }
}).RequireAuthorization();
app.MapControllers();

app.Run();
