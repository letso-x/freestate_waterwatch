using System.Net;

namespace WaterWatch.Api.Security;

public static class LocalStaffAccess
{
    public static bool IsAllowed(HttpContext context, IConfiguration configuration, IWebHostEnvironment environment)
    {
        if (!environment.IsDevelopment() || !configuration.GetValue<bool>("Operator:LocalAccessEnabled") ||
            context.Connection.RemoteIpAddress is not { } address || !IPAddress.IsLoopback(address) ||
            !string.IsNullOrEmpty(context.Request.Headers.Authorization)) return false;
        var host = context.Request.Host.Host.Trim('[', ']');
        if (!host.Equals("localhost", StringComparison.OrdinalIgnoreCase) &&
            !(IPAddress.TryParse(host, out var hostAddress) && IPAddress.IsLoopback(hostAddress))) return false;
        var origin = context.Request.Headers.Origin.ToString();
        return origin.Length == 0 || (configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
            .Contains(origin, StringComparer.OrdinalIgnoreCase);
    }
}
