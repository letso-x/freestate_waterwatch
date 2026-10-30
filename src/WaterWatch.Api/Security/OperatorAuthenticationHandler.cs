using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace WaterWatch.Api.Security;

// A small replaceable ASP.NET authentication scheme for a local hackathon demo.
// The server owns the key and actor identity; neither is accepted from JSON bodies.
public sealed class OperatorAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder,
    IConfiguration configuration, IWebHostEnvironment environment)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "DemoOperator";
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (LocalStaffAccess.IsAllowed(Context, configuration, environment))
        {
            var localIdentity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "local-staff"), new Claim(ClaimTypes.Role, "Operator")], SchemeName);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(localIdentity), SchemeName)));
        }
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return Task.FromResult(AuthenticateResult.NoResult());
        if (!Request.IsHttps && !environment.IsDevelopment())
            return Task.FromResult(AuthenticateResult.Fail("Operator access requires HTTPS outside Development."));
        var expected = configuration["Operator:ApiKey"];
        var supplied = header[7..];
        if (string.IsNullOrWhiteSpace(expected) || expected.Length < 32 || supplied.Length > 512 ||
            !CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(expected)), SHA256.HashData(Encoding.UTF8.GetBytes(supplied))))
            return Task.FromResult(AuthenticateResult.Fail("Invalid operator credential."));
        var identifier = configuration["Operator:Identifier"] ?? "demo-operator";
        if (identifier.Length is < 1 or > 120) return Task.FromResult(AuthenticateResult.Fail("Invalid operator configuration."));
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, identifier), new Claim(ClaimTypes.Role, "Operator")], SchemeName);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }
    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.Headers.WWWAuthenticate = "Bearer";
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    }
}
